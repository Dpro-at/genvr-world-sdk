/** Tidewater VegNodes.js 4811ba48, ©2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { TSL, type Texture } from 'three/webgpu';
/* eslint-disable @typescript-eslint/no-explicit-any -- native TSL graph inputs */
type N = any;
/** Borrowed nodes and texture: the owner advances the phase and disposes the texture. */
export interface VegetationWindProvider {
  readonly detail: Texture;
  readonly gustOffset: N;
  readonly windDirection: N;
  readonly windSpeed: N;
}

export const VEGETATION_GUST_WGSL = `
fn twVegetationGust(xz: vec2f, gustOffset: vec2f, detail: texture_2d<f32>, detailSampler: sampler) -> f32 {
  let p = xz - gustOffset;
  let n = textureSampleLevel(detail, detailSampler, p / 140.0, 0.0).w * 0.62
    + textureSampleLevel(detail, detailSampler, p / 61.0 + 0.37, 0.0).w * 0.38;
  return smoothstep(0.46, 0.6, n);
}`;

/** Supply the existing TidewaterGround as provider: no second clock or texture allocation. */
export function vegetationWind(provider: VegetationWindProvider, worldXZ: N): {
  strength: N; gust: N; direction: N; perpendicular: N;
} {
  const t = TSL as N;
  const detail = t.texture(provider.detail);
  const p = worldXZ.sub(provider.gustOffset);
  // Native texture nodes register their vertex-stage sampler; passing a bare
  // sampler into wgslFn left it undeclared in visible and shadow vertex shaders.
  const gust = detail.sample(p.div(140)).level(0).w.mul(0.62)
    .add(detail.sample(p.div(61).add(0.37)).level(0).w.mul(0.38));
  return {
    // Source has a calm floor, not a storm ceiling; do not clamp high wind speeds to2.5.
    strength: t.max(provider.windSpeed.mul(0.1), 0.03),
    gust: t.smoothstep(0.46, 0.6, gust),
    direction: t.vec3(provider.windDirection.x, 0, provider.windDirection.y),
    perpendicular: t.vec3(provider.windDirection.y.negate(), 0, provider.windDirection.x),
  };
}
