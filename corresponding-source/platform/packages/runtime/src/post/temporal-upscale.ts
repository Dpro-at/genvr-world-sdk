/** Tidewater 4811ba48 (MIT): source TAAU resolve with camera-only fallback velocities. */
import {
  StorageTexture,
  HalfFloatType,
  FloatType,
  UnsignedByteType,
  LinearFilter,
  Matrix4,
  Vector2,
  TSL,
  type Texture,
  type PerspectiveCamera,
  type WebGPURenderer,
} from 'three/webgpu';
import { halton, TEMPORAL_WGSL } from './temporal-math.js';
/* eslint-disable @typescript-eslint/no-explicit-any -- WGSL/TSl resource function inputs */
type N = any;
const {
  Fn,
  wgslFn,
  texture,
  sampler,
  storageTexture,
  uniform: rawUniform,
  globalId,
  ivec2,
  vec2,
  vec4,
  textureLoad,
  textureStore,
  If,
  max,
} = TSL as N;
const uniform = (value: unknown): N => rawUniform(value).setGroup(TSL.renderGroup);
const target = (name: string): StorageTexture => {
  const t = new StorageTexture(1, 1);
  t.name = name;
  t.type = HalfFloatType;
  t.minFilter = t.magFilter = LinearFilter;
  return t;
};
const dims = (t: Texture): [number, number] => {
  const image = t.image as { width: number; height: number };
  return [image.width, image.height];
};
const resizeTexture = (t: StorageTexture, w: number, h: number): void => {
  const image = t.image as { width: number; height: number };
  if (image.width === w && image.height === h) return;
  t.dispose();
  image.width = w;
  image.height = h;
  t.needsUpdate = true;
};

export class TemporalUpscale {
  readonly history = [0, 1].map((i) => [
    target(`taa-color-${i}`),
    target(`taa-lock-${i}`),
    target(`taa-luma-${i}`),
  ]);
  readonly texture = target('taa-output');
  readonly velocityTexture = target('taa-camera-velocity');
  readonly previousDepth = target('taa-previous-depth');
  jitterPhaseOverride = 4;
  jitterScale = 0.5;
  jitterMoving = 0.35;
  readonly settings: Record<string, N> = {};
  readonly #currentVP = uniform(new Matrix4());
  readonly #previousVP = uniform(new Matrix4());
  readonly #inverseVP = uniform(new Matrix4());
  readonly #view = uniform(new Matrix4());
  readonly #previousInverse = uniform(new Matrix4());
  readonly #size = uniform(new Vector2(1, 1));
  readonly #inputSize = uniform(new Vector2(1, 1));
  readonly #jitter = uniform(new Vector2());
  readonly #nearFar = uniform(new Vector2());
  readonly #exposure = uniform(1);
  #exposureNode: N | null = null;
  #compiled = false;
  readonly #reset = uniform(1);
  readonly #phases = uniform(4);
  readonly #velocityKernel: N;
  readonly #resolves: N[];
  readonly #copies: N[];
  readonly #depthCopy: N;
  #cur = 0;
  #index = 0;
  #hasHistory = false;
  #hasCamera = false;
  #cameraMotion = 0;
  #cameraPrevious: number[] | null = null;
  #previousUnjittered = new Matrix4();
  #savedView: PerspectiveCamera['view'] = null;
  #begun = false;

  constructor(
    readonly beauty: Texture,
    readonly depth: Texture,
    readonly camera: PerspectiveCamera,
    readonly waterMask?: Texture,
    readonly externalVelocity?: Texture,
  ) {
    this.previousDepth.type = FloatType;
    for (const hist of this.history) hist[2]!.type = UnsignedByteType;
    const defaults = {
      depthThreshold: 0.0005,
      edgeDepthDiff: 0.001,
      hasWaterMask: waterMask ? 1 : 0,
      boxStill: 3,
      boxMotion: 1,
      maxAccumulation: 2,
      motionAccumulation: 10,
      blurComp: 0.5,
      locks: 1,
      instability: 1,
      lockThreshold: 1.05,
      staticKeep: 1,
    };
    for (const [key, value] of Object.entries(defaults)) this.settings[key] = uniform(value);
    this.#velocityKernel = Fn(() => {
      const px = ivec2(globalId.xy);
      If(px.x.lessThan(this.#inputSize.x).and(px.y.lessThan(this.#inputSize.y)), () => {
        const uv = vec2(px).add(0.5).div(this.#inputSize);
        const d = textureLoad(depth, px).r;
        const clip = vec4(uv.x.mul(2).sub(1), uv.y.mul(-2).add(1), d, 1);
        const world = this.#inverseVP.mul(clip).toVar();
        const position = world.div(max(world.w.abs(), 1e-8)).toVar();
        const c = this.#currentVP.mul(position),
          p = this.#previousVP.mul(position);
        const v = c.xy.div(c.w).sub(p.xy.div(p.w)).mul(vec2(0.5, -0.5));
        textureStore(this.velocityTexture, px, vec4(v, 0, 1));
      });
    })().computeKernel([8, 8, 1]);
    const resolve = wgslFn(TEMPORAL_WGSL);
    this.#resolves = this.history.map((hist, i) =>
      Fn(() => {
        const px = ivec2(globalId.xy);
        If(px.x.lessThan(this.#size.x).and(px.y.lessThan(this.#size.y)), () => {
          const args: Record<string, N> = {
            pixel: px,
            uv: vec2(px).add(0.5).div(this.#size),
            taauBeauty: texture(beauty),
            taauDepth: texture(depth),
            taauPrevDepth: texture(this.previousDepth),
            taauVelocity: texture(externalVelocity ?? this.velocityTexture),
            taauMask: texture(waterMask ?? this.velocityTexture),
            taauHistory: texture(hist[0]),
            taauLock: texture(hist[1]),
            taauLumaHistory: texture(hist[2]),
            smpLinearClamp: sampler(texture(hist[0])),
            currentView: this.#view,
            exposureValue: max(this.#exposureNode ?? this.#exposure, 1e-4),
            param_prevInvViewProj: this.#previousInverse,
            param_jitterOffset: this.#jitter,
            param_cameraNearFar: this.#nearFar,
            param_reset: this.#reset,
            param_jitterPhases: this.#phases,
            outputColor: storageTexture(this.history[1 - i]![0]).toWriteOnly(),
            outputLock: storageTexture(this.history[1 - i]![1]).toWriteOnly(),
            outputLuma: storageTexture(this.history[1 - i]![2]).toWriteOnly(),
          };
          for (const [key, value] of Object.entries(this.settings)) args[`param_${key}`] = value;
          resolve(args).toVar();
        });
      })().computeKernel([8, 8, 1]),
    );
    this.#copies = this.history.map((hist) =>
      Fn(() => {
        const px = ivec2(globalId.xy);
        If(px.x.lessThan(this.#size.x).and(px.y.lessThan(this.#size.y)), () => {
          textureStore(this.texture, px, textureLoad(hist[0], px));
        });
      })().computeKernel([8, 8, 1]),
    );
    this.#depthCopy = Fn(() => {
      const px = ivec2(globalId.xy);
      If(px.x.lessThan(this.#inputSize.x).and(px.y.lessThan(this.#inputSize.y)), () => {
        textureStore(this.previousDepth, px, vec4(textureLoad(depth, px).r, 0, 0, 1));
      });
    })().computeKernel([8, 8, 1]);
  }

  /** Bind previous-frame GPU auto exposure before the first update/compile. */
  setExposureNode(node: N): void {
    if (this.#disposed) return;
    if (this.#compiled) throw new Error('TemporalUpscale exposure must be bound before first update');
    this.#exposureNode = node;
  }
  resize(w: number, h: number): void {
    if (this.#disposed) return;
    if (this.#size.value.x === w && this.#size.value.y === h) return;
    this.#size.value.set(w, h);
    for (const hist of this.history) for (const tex of hist) resizeTexture(tex, w, h);
    resizeTexture(this.texture, w, h);
    this.reset();
  }
  reset(): void {
    this.#hasHistory = false;
    this.#hasCamera = false;
  }
  beginFrame(): void {
    if (this.#disposed) return;
    if (this.#begun) return;
    this.#begun = true;
    const c = this.camera;
    c.updateMatrixWorld();
    this.#view.value.copy(c.matrixWorldInverse);
    const vp = new Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse);
    this.#currentVP.value.copy(vp);
    this.#previousVP.value.copy(this.#hasCamera ? this.#previousUnjittered : vp);
    this.#previousUnjittered.copy(vp);
    this.#hasCamera = true;
    const e = c.matrixWorld.elements;
    const cur = [e[12]!, e[13]!, e[14]!, e[8]!, e[9]!, e[10]!];
    let moving = 0;
    if (this.#cameraPrevious) {
      const p = this.#cameraPrevious;
      moving = Math.max(
        0,
        Math.min(
          1,
          Math.max(
            (Math.hypot(cur[0]! - p[0]!, cur[1]! - p[1]!, cur[2]! - p[2]!) - 0.002) / 0.008,
            (Math.hypot(cur[3]! - p[3]!, cur[4]! - p[4]!, cur[5]! - p[5]!) - 0.0005) / 0.0015,
          ),
        ),
      );
    }
    this.#cameraPrevious = cur;
    this.#cameraMotion =
      moving > this.#cameraMotion ? moving : this.#cameraMotion + (moving - this.#cameraMotion) * 0.15;
    const [w, h] = dims(this.beauty);
    const phases = this.jitterPhaseOverride || Math.max(1, Math.ceil(8 * (this.#size.value.x / w) ** 2));
    this.#phases.value = phases;
    const k = this.jitterScale * (1 + (this.jitterMoving - 1) * this.#cameraMotion);
    this.#jitter.value.set(
      (halton((this.#index % phases) + 1, 2) - 0.5) * k,
      (halton((this.#index % phases) + 1, 3) - 0.5) * k,
    );
    this.#savedView = c.view ? { ...c.view } : null;
    c.setViewOffset(w, h, this.#jitter.value.x, this.#jitter.value.y, w, h);
  }
  update(renderer: WebGPURenderer, _dt: number, exposure = 1): void {
    if (this.#disposed) return;
    if (!this.#begun) throw new Error('TemporalUpscale.beginFrame must run before the scene render');
    const [w, h] = dims(this.depth);
    if (this.#inputSize.value.x !== w || this.#inputSize.value.y !== h) {
      this.#inputSize.value.set(w, h);
      resizeTexture(this.velocityTexture, w, h);
      resizeTexture(this.previousDepth, w, h);
      this.#hasHistory = false;
    }
    this.#inverseVP.value
      .multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse)
      .invert();
    if (!this.#hasHistory) this.#previousInverse.value.copy(this.#inverseVP.value);
    this.#nearFar.value.set(this.camera.near, this.camera.far);
    this.#exposure.value = Math.max(exposure, 1e-4);
    this.#reset.value = this.#hasHistory ? 0 : 1;
    this.#compiled = true;
    renderer.compute(this.#velocityKernel, [Math.ceil(w / 8), Math.ceil(h / 8), 1]);
    renderer.compute(this.#resolves[this.#cur], [
      Math.ceil(this.#size.value.x / 8),
      Math.ceil(this.#size.value.y / 8),
      1,
    ]);
    this.#cur = 1 - this.#cur;
    renderer.compute(this.#copies[this.#cur], [
      Math.ceil(this.#size.value.x / 8),
      Math.ceil(this.#size.value.y / 8),
      1,
    ]);
    renderer.compute(this.#depthCopy, [Math.ceil(w / 8), Math.ceil(h / 8), 1]);
    this.#previousInverse.value.copy(this.#inverseVP.value);
    this.#hasHistory = true;
    this.endFrame();
  }
  endFrame(): void {
    if (!this.#begun) return;
    this.camera.view = this.#savedView;
    this.camera.updateProjectionMatrix();
    this.#begun = false;
    this.#index = (this.#index + 1) % 1024;
  }
  #disposed = false;
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.endFrame();
    this.#velocityKernel.dispose();
    for (const kernel of [...this.#resolves, ...this.#copies]) kernel.dispose();
    this.#depthCopy.dispose();
    for (const hist of this.history) for (const tex of hist) tex.dispose();
    this.texture.dispose();
    this.velocityTexture.dispose();
    this.previousDepth.dispose();
  }
}
