/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
/** A WGSL module as the source declares it (`new ShaderModule( { name, deps, code } )`). */
export interface ShoreShaderModule {
    name: string;
    deps?: readonly unknown[];
    code?: string;
}
/** Options of the source's `new Texture( { ... } )` (plus the pixel data). */
export interface ShoreTextureOptions {
    label: string;
    width: number;
    height: number;
    format: string;
    usage: readonly string[];
    mips?: boolean;
    data: Uint8Array;
}
/** What the materials read of the source's TerrainGPU (opaque WGSL modules). */
export interface ShoreTerrainGpu {
    module: unknown;
    sunModulationModule: unknown;
}
/** Parameters the source passes to `standard()`. */
export type ShoreMaterialParams = Record<string, unknown> & {
    name: string;
};
export interface ShoreMaterial {
    params: ShoreMaterialParams;
    dispose(): void;
}
export interface ShoreTexture {
    options: ShoreTextureOptions;
    destroyed: number;
    getGPU(): void;
    destroy(): void;
}
export interface ShoreEngine {
    standard(params: ShoreMaterialParams): ShoreMaterial;
    texture(options: ShoreTextureOptions): ShoreTexture;
    generateMipmaps(texture: ShoreTexture): void;
    commonModule: unknown;
    lodFadeModule: unknown;
    terrainShadingModule(): unknown;
}
/** Records the engine calls (materials and textures as data); nothing is drawn with them. */
export declare const RECORDING_ENGINE: ShoreEngine;
