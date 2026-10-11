import { type ShoreEngine, type ShoreShaderModule, type ShoreTerrainGpu } from './shore-engine.js';
export declare const aTint = "tint";
export declare const aData = "vdata";
export declare const stoneSurfaceModule: ShoreShaderModule;
export declare const NATURE_SURFACE: string;
export declare function createNatureMaterial(gpu: ShoreTerrainGpu, { sunShadow }?: {
    sunShadow?: boolean | undefined;
}, engine?: ShoreEngine): import("./shore-engine.js").ShoreMaterial;
