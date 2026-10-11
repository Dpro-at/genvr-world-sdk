/** Tidewater VegNodes.js 4811ba48, ©2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { type Texture } from 'three/webgpu';
type N = any;
/** Borrowed nodes and texture: the owner advances the phase and disposes the texture. */
export interface VegetationWindProvider {
    readonly detail: Texture;
    readonly gustOffset: N;
    readonly windDirection: N;
    readonly windSpeed: N;
}
export declare const VEGETATION_GUST_WGSL = "\nfn twVegetationGust(xz: vec2f, gustOffset: vec2f, detail: texture_2d<f32>, detailSampler: sampler) -> f32 {\n  let p = xz - gustOffset;\n  let n = textureSampleLevel(detail, detailSampler, p / 140.0, 0.0).w * 0.62\n    + textureSampleLevel(detail, detailSampler, p / 61.0 + 0.37, 0.0).w * 0.38;\n  return smoothstep(0.46, 0.6, n);\n}";
/** Supply the existing TidewaterGround as provider: no second clock or texture allocation. */
export declare function vegetationWind(provider: VegetationWindProvider, worldXZ: N): {
    strength: N;
    gust: N;
    direction: N;
    perpendicular: N;
};
export {};
