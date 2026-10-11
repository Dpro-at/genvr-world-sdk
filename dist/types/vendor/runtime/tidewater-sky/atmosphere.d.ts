import { Color, StorageTexture, Vector3, type WebGPURenderer } from 'three/webgpu';
type AnyNode = any;
/** A TSL uniform node with its `value` (typed loosely, like the node chains). */
export type UniformOf<T> = AnyNode & {
    value: T;
};
/** Uniforms of the atmosphere (Atmosphere.js 110-123), three-style `{ value }` handles. */
export interface AtmosphereParams {
    rayleighScale: UniformOf<number>;
    mieScale: UniformOf<number>;
    mieG: UniformOf<number>;
    ozoneScale: UniformOf<number>;
    groundAlbedo: UniformOf<Color>;
    /** Height of the viewer, km from the planet's centre. */
    viewHeight: UniformOf<number>;
    sunIlluminance: UniformOf<number>;
    /** The real sun, which may be below the horizon (twilight, night). */
    sunDir: UniformOf<Vector3>;
}
/**
 * The atmosphere's lookup tables made by TSL compute: transmittance (256 x 64), multiple scattering (32 x 32) once,
 * the sky view (192 x 108) whenever the sun, the viewer's height or the air change. `skyLuminance(dir)` and
 * `transmittanceToSpace(dir)` are TSL functions for the materials that draw the sky.
 */
export declare class Atmosphere {
    #private;
    readonly transmittanceLUT: StorageTexture;
    readonly multiScatLUT: StorageTexture;
    readonly skyViewLUT: StorageTexture;
    readonly params: AtmosphereParams;
    /** Sky irradiance / PI, sun transmittance at sea level, horizon colour (read back every 0.25 s; null before). */
    skyIrradiance: [number, number, number] | null;
    sunTransmittance: [number, number, number] | null;
    horizon: [number, number, number] | null;
    constructor();
    /** Nearest positive ray-sphere distance from `ro` (km, planet centred), -1 when none. */
    static raySphere: any;
    /** (r, mu) -> transmittance LUT uv (Atmosphere.js `atmosphereTransmittanceUV`). */
    static transmittanceUV: any;
    /** Transmittance from radius r (km) toward zenith cosine mu, from the LUT. */
    sampleTransmittance(r: AnyNode, mu: AnyNode): AnyNode;
    /** Transmittance from the viewer toward `dir` (sun disc, sun light colour). */
    transmittanceToSpace(dir: AnyNode): AnyNode;
    /** Sky luminance toward `dir` (normalized world direction), no sun disc, from the sky view LUT. */
    skyLuminance(dir: AnyNode): AnyNode;
    /**
     * Runs the kernels that are due (Atmosphere.js `update`): the static LUTs once, the sky view when the sun, the
     * viewer's height (quantized: 2 m near the sea, 2 % higher up) or the air changed, and the irradiance read-back
     * every 0.25 s. Returns true when the sky view LUT was made again.
     */
    update(renderer: WebGPURenderer, dt: number, cameraY: number): boolean;
    /** The LUTs are made again on the next update (e.g. after the air changed). */
    invalidate(): void;
    /** Copies the transmittance LUT into a buffer for checks against the CPU reference (tests). */
    readTransmittance(renderer: WebGPURenderer): Promise<Float32Array>;
    dispose(): void;
}
export {};
