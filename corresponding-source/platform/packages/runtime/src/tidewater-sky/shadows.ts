/* Tidewater 4811ba48, Copyright 2026 DRG Software Solutions LLC, MIT (LICENSE-tidewater.md).
 * Shadows.js and wgsl/lighting.js ported onto three's CSM lifetime and separate shadow targets.
 * Source filtering: near cascade center+8 blocker taps, 12 raw filter taps; far 5 hardware PCF taps.
 * Three owns the depth pass; its caster depth bias differs from Tidewater's native GPU pipeline.
 */
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import {
  Vector3,
  TSL,
  type DirectionalLight,
  type PerspectiveCamera,
  type DirectionalLightShadow,
} from 'three/webgpu';
import {
  cascadeDue,
  shadowMargin,
  shadowPose,
  shadowSphere,
  TIDEWATER_NORMAL_BIAS,
  TIDEWATER_SHADOW_BIAS,
  TIDEWATER_SHADOW_SPLITS,
  TIDEWATER_SUN_DIAMETER,
} from './shadow-math.js';

/* eslint-disable @typescript-eslint/no-explicit-any -- three's CSM private hooks and TSL filter callback are untyped. */
type Node = any;
const {
  Fn,
  If,
  float,
  vec4,
  vec2,
  min,
  max,
  clamp,
  textureLoad,
  texture,
  uniform,
  positionView,
  screenCoordinate,
  interleavedGradientNoise,
  vogelDiskSample,
} = TSL as Node;

export class TidewaterShadowNode extends CSMShadowNode {
  readonly radii = [0, 0, 0];
  readonly rendered = [false, false, false];
  #frame = 0;
  #dirty = true;
  #lastFrameId = -1;
  #lastSun = new Vector3(0, -2, 0);
  readonly #noiseFrame = uniform(0).setGroup(TSL.renderGroup);

  constructor(sun: DirectionalLight) {
    super(sun, {
      cascades: 3,
      maxFar: 400,
      mode: 'custom',
      lightMargin: 200,
      customSplitsCallback: (_count, _near, _far, breaks) => breaks.push(10 / 400, 60 / 400, 1),
    });
    this.fade = true;
  }

  invalidate(): void {
    this.#dirty = true;
  }

  _init(builder: Node): void {
    (CSMShadowNode.prototype as Node)._init.call(this, builder);
    this.lights.forEach((light, i) => {
      const shadow = light.shadow!;
      shadow.autoUpdate = false;
      // Three adds bias in standard Z; Tidewater subtracts its positive bias.
      shadow.bias = -TIDEWATER_SHADOW_BIAS;
      shadow.normalBias = TIDEWATER_NORMAL_BIAS[i]!;
      (shadow as Node).filterNode = this.#filter(i);
    });
  }

  #filter(cascade: number): Node {
    return Fn(({ depthTexture, shadowCoord, shadow }: Node) => {
      const size = uniform(shadow.mapSize.x);
      const texel = float(1).div(size);
      const phi = interleavedGradientNoise(screenCoordinate.xy.add(this.#noiseFrame.mul(5.588238))).mul(
        Math.PI * 2,
      );
      const raw = (uv: Node): Node =>
        textureLoad(depthTexture, clamp(uv.mul(size), vec2(0), vec2(size.sub(1))).convert('ivec2')).r;
      const z = shadowCoord.z;
      const sum = float(0).toVar();
      if (cascade > 0) {
        const pcfPhi = interleavedGradientNoise(screenCoordinate.xy).mul(Math.PI * 2);
        for (let i = 0; i < 5; i++)
          sum.addAssign(
            texture(depthTexture, shadowCoord.xy.add(vogelDiskSample(i, 5, pcfPhi).mul(texel))).compare(z),
          );
        return sum.div(5);
      }
      const width = uniform(1).onRenderUpdate(() => this.radii[cascade]! * 2);
      const range = uniform(1).onRenderUpdate(() => shadow.camera.far - shadow.camera.near);
      const search = max(min(float(30 * TIDEWATER_SUN_DIAMETER).div(width), texel.mul(24)), texel.mul(1.5));
      const blocker = float(0).toVar();
      const count = float(0).toVar();
      const center = raw(shadowCoord.xy).toVar();
      If(center.lessThan(z), () => {
        blocker.addAssign(center);
        count.addAssign(1);
      });
      for (let i = 0; i < 8; i++) {
        const depth = raw(shadowCoord.xy.add(vogelDiskSample(i, 8, phi).mul(search))).toVar();
        If(depth.lessThan(z), () => {
          blocker.addAssign(depth);
          count.addAssign(1);
        });
      }
      const result = float(1).toVar();
      If(count.greaterThanEqual(0.5), () => {
        const dz = blocker.div(max(count, 1)).sub(z).abs().mul(range);
        const penumbra = clamp(dz.mul(TIDEWATER_SUN_DIAMETER).div(width), texel.mul(1.2), texel.mul(32));
        for (let i = 0; i < 12; i++) {
          const depth = raw(shadowCoord.xy.add(vogelDiskSample(i, 12, phi.add(1.7)).mul(penumbra)));
          sum.addAssign(depth.greaterThanEqual(z).select(1, 0));
        }
        result.assign(sum.div(12));
      });
      return result;
    });
  }

  _setupFade(): Node {
    return Fn((builder: Node) => {
      this.setupShadowPosition(builder);
      const distance = positionView.z.negate();
      const ret = vec4(1).toVar();
      for (let i = 0; i < 3; i++) {
        const x = i === 0 ? 0 : TIDEWATER_SHADOW_SPLITS[i - 1]!;
        const y = TIDEWATER_SHADOW_SPLITS[i]!;
        const center = (x + y) / 2;
        const margin = max(distance.lessThan(center).select(shadowMargin(x), shadowMargin(y)), 1e-5);
        const low = float(x).sub(margin.mul(0.5));
        const high = i === 2 ? float(y) : float(y).add(margin.mul(0.5));
        If(distance.greaterThanEqual(low).and(distance.lessThanEqual(high)), () => {
          let ratio = clamp(min(distance.sub(low), high.sub(distance)).div(margin), 0, 1);
          if (i === 0) ratio = distance.lessThanEqual(center).select(1, ratio);
          ret.subAssign((this as Node)._shadowNodes[i].oneMinus().mul(ratio));
        });
      }
      return max(ret, vec4(0));
    })();
  }

  override updateBefore(frame?: { frameId: number }): undefined {
    // Environment captures and additional passes must not advance the main-frame cadence.
    if (frame && frame.frameId === this.#lastFrameId) return;
    if (frame) this.#lastFrameId = frame.frameId;
    const camera = this.camera as PerspectiveCamera | null;
    if (!camera || !camera.isPerspectiveCamera) return;
    camera.updateMatrixWorld();
    this.#frame++;
    this.#noiseFrame.value = this.#frame % 64;
    const sun = this.light.position
      .clone()
      .sub((this.light as DirectionalLight).target.position)
      .normalize();
    const moved = this.#lastSun.angleTo(sun) > 1e-4;
    this.#lastSun.copy(sun);
    this.lights.forEach((light, i) => {
      const shadow = light.shadow as DirectionalLightShadow;
      if (!light.parent && this.light.parent) this.light.parent.add(light, light.target);
      const due = this.#dirty || moved || cascadeDue(this.#frame, i);
      this.rendered[i] = due;
      if (!due) return; // Keep camera, shadow matrix and stored texture from the same frame.
      const sphere = shadowSphere(camera, i);
      this.radii[i] = sphere.radius;
      const pose = shadowPose(sphere.center, sphere.radius, sun, shadow.mapSize.x);
      light.position.copy(pose.eye);
      light.target.position.copy(pose.eye).sub(sun);
      shadow.camera.up.copy(pose.up);
      Object.assign(shadow.camera, {
        left: -sphere.radius,
        right: sphere.radius,
        top: sphere.radius,
        bottom: -sphere.radius,
        near: 0.1,
        far: 2 * sphere.radius + 200,
      });
      shadow.camera.updateProjectionMatrix();
      light.updateMatrixWorld();
      light.target.updateMatrixWorld();
      shadow.needsUpdate = true;
    });
    this.#dirty = false;
  }

  override dispose(): void {
    // CSMShadowNode removes placeholder lights, but does not release their ShadowNode targets.
    for (const node of (this as Node)._shadowNodes) node.dispose();
    super.dispose();
  }
}
