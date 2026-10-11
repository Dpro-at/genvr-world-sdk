export declare const NOISE_SCALE = 2.55;
/** The options object the source passes to `new Texture( ... )` (ReefNoise.js 81). */
export interface NoiseVolumeTextureOptions {
    label: 'reefNoise';
    width: number;
    height: number;
    depth: number;
    dimension: '3d';
    format: 'rgba8unorm';
    data: Uint8Array;
    sampler: 'linearRepeat';
}
/** Injected GPU texture factory (the engine's `new Texture( options )`). */
export type NoiseVolumeTextureFactory<T> = (options: NoiseVolumeTextureOptions) => T;
export declare function createNoiseVolumeData(size?: number, cells?: number, seed?: number): Uint8Array;
export declare function noiseVolumeTextureOptions(size: number, data: Uint8Array): NoiseVolumeTextureOptions;
export declare function createNoiseVolume<T>(createTexture: NoiseVolumeTextureFactory<T>, size?: number, cells?: number, seed?: number): T;
