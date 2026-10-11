/** Source PostFX orchestration, Tidewater 4811ba48 (MIT). See source-audit.md for remaining water differences. */
import {
  RenderTarget,
  DepthTexture,
  HalfFloatType,
  UnsignedIntType,
  LinearFilter,
  Vector2,
  Vector3,
  Matrix4,
  RenderPipeline,
  TSL,
  type Scene,
  type PerspectiveCamera,
  type WebGPURenderer,
} from 'three/webgpu';
import type { TidewaterSky } from '../tidewater-sky/index.js';
import type { TidewaterLighting } from '../tidewater-sky/lighting.js';
import { GTAO } from './gtao.js';
import { AirHaze } from './air-haze.js';
import { TemporalUpscale } from './temporal-upscale.js';
import { MotionBlur } from './motion-blur.js';
import { LensFlare } from './lens-flare.js';
import { LensDrops } from './lens-drops.js';
import { TidewaterBloom } from './bloom.js';
import { TidewaterExposure } from './exposure.js';
import { createFinalNode, createFinalParams } from './final.js';
import { PostPass } from './pass.js';
import { underwaterBeauty } from './beauty.js';
import type { Texture } from 'three/webgpu';
import { hazeShadowProvider } from './shadow-provider.js';
/* eslint-disable @typescript-eslint/no-explicit-any -- render hooks and native TSL graph */
const N = TSL as any;
// VelocityNode captures this matrix in cached material graphs; retain its identity across quality switches.
const projections = new WeakMap<PerspectiveCamera, Matrix4>();
export const TIDEWATER_POST_ORDER = [
  'motion-tiles',
  'gtao',
  'air-haze',
  'beauty',
  'temporal',
  'bloom',
  'final',
  'exposure-next-frame',
] as const;
export class TidewaterPost {
  readonly opaque = this.#target('tidewater-opaque');
  readonly sceneTarget = this.#target('tidewater-scene');
  readonly projection: Matrix4;
  readonly #currentVP = N.uniform(new Matrix4()).setGroup(N.renderGroup);
  readonly #previousVP = N.uniform(new Matrix4()).setGroup(N.renderGroup);
  readonly #savedVP = new Matrix4();
  #hasPrevious = false;
  readonly underwater = N.uniform(0).setGroup(N.renderGroup);
  readonly direction = N.uniform(new Vector3()).setGroup(N.renderGroup);
  readonly color = N.uniform(new Vector3()).setGroup(N.renderGroup);
  readonly irradiance = N.uniform(new Vector3()).setGroup(N.renderGroup);
  readonly params = createFinalParams();
  #size = new Vector2();
  #mrt = N.mrt({ output: N.output, velocity: N.velocity.mul(N.vec2(0.5, -0.5)), waterMask: N.vec4(0) });
  #cameraMotionMaterials = new Map<any, any>();
  #ao?: GTAO;
  #haze?: AirHaze;
  #taa?: TemporalUpscale;
  #motion?: MotionBlur;
  #flare?: LensFlare;
  #drops = new LensDrops();
  #bloom?: TidewaterBloom;
  #exposure?: TidewaterExposure;
  #final?: RenderPipeline;
  #beauty?: PostPass;
  #disposed = false;
  constructor(
    readonly renderer: WebGPURenderer,
    readonly scene: Scene,
    readonly camera: PerspectiveCamera,
    readonly sky: TidewaterSky,
    readonly lighting: TidewaterLighting,
    readonly caustics: Texture | null = null,
    readonly underwaterRays = false,
  ) {
    this.projection = projections.get(camera) ?? new Matrix4();
    projections.set(camera, this.projection);
  }
  #target(name: string): RenderTarget {
    const target = new RenderTarget(1, 1, {
      count: 3,
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
    });
    target.textures[0]!.name = 'output';
    target.textures[1]!.name = 'velocity';
    target.textures[2]!.name = 'waterMask';
    target.depthTexture = new DepthTexture(1, 1, UnsignedIntType);
    target.depthTexture.name = name + '-depth';
    return target;
  }
  #build(): void {
    const r = this.renderer,
      c = this.camera,
      s = this.sky,
      l = this.lighting,
      rt = this.sceneTarget;
    this.#ao = new GTAO(this.opaque.depthTexture!, c, {
      inputTexture: rt.texture,
      finalDepthTexture: rt.depthTexture!,
    });
    this.#haze = new AirHaze({
      inputTexture: this.#ao.colorTexture,
      depthTexture: rt.depthTexture!,
      camera: c,
      unjitteredProjectionMatrix: this.projection,
      sunDirectionNode: this.direction,
      sunColorNode: this.color,
      seaLevelNode: l.sea,
      skyIrradianceNode: this.irradiance,
      underwaterNode: this.underwater,
      skyLuminanceNode: (d) => s.atmosphere.skyLuminance(d).add(s.shading.moonSky(d)),
      cloudShadowNode: (xz) => s.clouds.cloudShadow(xz),
      cloudViewNode: (d) => s.clouds.sampleView(d),
      terrainShadowNode: (p) => l.bounce.heightfieldVisibilityNode(p),
      shadowNode: hazeShadowProvider(l.sun, c) ?? (() => N.float(1)),
    });
    this.#beauty = new PostPass(
      r,
      underwaterBeauty(
        this.#haze.texture,
        rt.depthTexture!,
        c,
        this.underwater,
        this.caustics,
        this.underwaterRays,
      ),
      'tidewater-beauty',
    );
    this.#taa = new TemporalUpscale(
      this.#beauty.texture,
      rt.depthTexture!,
      c,
      rt.textures[2],
      rt.textures[1],
    );
    this.#motion = new MotionBlur(this.#taa.texture, rt.depthTexture!, rt.textures[1]!, c);
    this.#flare = new LensFlare(rt.depthTexture!, c, (d) => s.clouds.sampleView(d).a);
    this.#bloom = new TidewaterBloom(this.#taa.texture);
    this.#exposure = new TidewaterExposure(this.#bloom.meterTexture);
    this.#taa.setExposureNode(this.#exposure.node.mul(this.params.exposure));
    this.#final = new RenderPipeline(
      r,
      createFinalNode({
        resolved: this.#taa.texture,
        depth: rt.depthTexture!,
        bloom: this.#bloom.texture,
        half: this.#bloom.half,
        exposureNode: this.#exposure.node,
        params: this.params,
        motionApply: (sharp, uv) => this.#motion!.node(sharp, uv),
        flare: (uv) => this.#flare!.node(uv),
        lens: (uv, sharp, blurred) => this.#drops.node(uv, sharp, blurred),
      }),
    );
    this.#final.outputColorTransform = false;
    this.#resizePasses();
  }
  #resizePasses(): void {
    const { x: w, y: h } = this.#size;
    for (const p of [
      this.#ao,
      this.#haze,
      this.#beauty,
      this.#taa,
      this.#motion,
      this.#flare,
      this.#drops,
      this.#bloom,
    ])
      p?.resize(w, h);
  }
  #drawScene(): void {
    const r = this.renderer,
      scene = this.scene,
      camera = this.camera;
    const target = r.getRenderTarget(),
      mrt = r.getMRT(),
      auto = r.autoClear,
      hook = r.getRenderObjectFunction();
    const background = scene.background,
      fog = scene.fog;
    const cameraMotionMaterials = new Set<any>();
    scene.traverse((o: any) => {
      for (const m of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []) {
        const water = m.name === 'tidewater-sea';
        const nativeTerrain = o.name === 'native-terrain';
        if (water || nativeTerrain) cameraMotionMaterials.add(m);
        if ((water || nativeTerrain) && !this.#cameraMotionMaterials.has(m)) {
          this.#cameraMotionMaterials.set(m, m.mrtNode);
          // Water and native CDLOD terrain use camera-only motion of the CURRENT world point.
          // Terrain instance reordering/morphing must not become object motion.
          // Three's default velocity compares positionLocal with undeformed positionGeometry.
          const point = N.vec4(N.positionWorld, 1);
          const current = this.#currentVP.mul(point),
            previous = this.#previousVP.mul(point);
          const velocity = current.xy.div(current.w).sub(previous.xy.div(previous.w)).mul(N.vec2(0.5, -0.5));
          m.mrtNode = N.mrt({
            velocity,
            waterMask: water ? N.vec4(N.frontFacing.select(0, 1), 1, 0, 1) : N.vec4(0),
          });
          m.needsUpdate = true;
        }
      }
    });
    for (const [material, original] of this.#cameraMotionMaterials) {
      if (cameraMotionMaterials.has(material)) continue;
      material.mrtNode = original;
      material.needsUpdate = true;
      this.#cameraMotionMaterials.delete(material);
    }
    const draw = hook ?? r.renderObject.bind(r);
    let late = false;
    try {
      scene.fog = null;
      r.setMRT(this.#mrt);
      r.setRenderObjectFunction(((...args: any[]) => {
        const material = args[4];
        if (args[2] === camera && !!material.transparent !== late) return;
        (draw as any)(...args);
      }) as any);
      r.autoClear = true;
      r.setRenderTarget(this.opaque);
      r.render(scene, camera);
      r.initRenderTarget(this.sceneTarget);
      for (let i = 0; i < 3; i++)
        r.copyTextureToTexture(this.opaque.textures[i]!, this.sceneTarget.textures[i]!);
      r.copyTextureToTexture(this.opaque.depthTexture!, this.sceneTarget.depthTexture!);
      late = true;
      scene.background = null;
      r.autoClear = false;
      r.setRenderTarget(this.sceneTarget);
      r.render(scene, camera);
    } finally {
      scene.background = background;
      scene.fog = fog;
      r.autoClear = auto;
      r.setRenderObjectFunction(hook);
      r.setRenderTarget(target);
      r.setMRT(mrt);
    }
  }
  resetHistory(): void {
    this.#hasPrevious = false;
    this.#taa?.reset();
    this.#motion?.reset();
    this.#haze?.invalidate();
  }

  render(dt: number, submerged: number): void {
    if (this.#disposed) return;
    const size = this.renderer.getDrawingBufferSize(new Vector2());
    if (!size.equals(this.#size)) {
      this.#hasPrevious = false;
      this.#size.copy(size);
      this.opaque.setSize(size.x, size.y);
      this.sceneTarget.setSize(size.x, size.y);
      this.#resizePasses();
    }
    this.camera.updateMatrixWorld(true);
    this.projection.copy(this.camera.projectionMatrix);
    this.#currentVP.value.multiplyMatrices(this.projection, this.camera.matrixWorldInverse);
    this.#previousVP.value.copy(this.#hasPrevious ? this.#savedVP : this.#currentVP.value);
    this.#savedVP.copy(this.#currentVP.value);
    this.#hasPrevious = true;
    N.velocity.setProjectionMatrix(this.projection);
    this.underwater.value = submerged;
    this.direction.value.copy(this.sky.light.direction);
    const color = this.sky.light.color;
    this.color.value.set(color.r, color.g, color.b);
    this.irradiance.value.fromArray(this.sky.atmosphere.skyIrradiance ?? [0, 0, 0]);
    this.params.exposure.value = this.renderer.toneMappingExposure;
    this.#motion?.beginFrame();
    this.#taa?.beginFrame();
    try {
      this.#drawScene();
      if (!this.#final) {
        this.#build();
        this.#motion!.beginFrame();
        this.#taa!.beginFrame();
        this.#drawScene();
      }
      this.#motion!.update(this.renderer, dt);
      this.#ao!.update(this.renderer, dt, this.camera);
      this.#haze!.update(this.renderer, dt, this.camera);
      this.#beauty!.update();
      this.#taa!.update(this.renderer, dt);
      this.#flare!.update(this.renderer, dt, this.sky.light.direction, submerged < 0.5, this.color.value);
      this.#drops.update(dt, submerged > 0.5);
      this.#bloom!.update(this.renderer);
      this.params.frameIndex.value = (this.params.frameIndex.value + 1) >>> 0;
      this.#final!.render();
      this.#exposure!.update(this.renderer, dt, this.sky.light.night);
    } finally {
      this.#taa?.endFrame();
      N.velocity.setProjectionMatrix(null);
    }
  }
  /** Source-style stage access for GPU profiling and diagnostic fixtures. */
  get passes() {
    return {
      scene: () => this.#drawScene(),
      ao: this.#ao,
      haze: this.#haze,
      beauty: this.#beauty,
      temporal: this.#taa,
      motion: this.#motion,
      flare: this.#flare,
      bloom: this.#bloom,
      final: this.#final,
      exposure: this.#exposure,
    };
  }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const p of [
      this.#final,
      this.#ao,
      this.#haze,
      this.#beauty,
      this.#taa,
      this.#motion,
      this.#flare,
      this.#drops,
      this.#bloom,
      this.#exposure,
    ])
      p?.dispose();
    for (const [m, original] of this.#cameraMotionMaterials) {
      m.mrtNode = original;
      m.needsUpdate = true;
    }
    this.#cameraMotionMaterials.clear();
    this.opaque.dispose();
    this.sceneTarget.dispose();
  }
}
