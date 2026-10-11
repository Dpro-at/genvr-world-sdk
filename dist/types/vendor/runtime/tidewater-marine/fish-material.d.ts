/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { Vector4 } from 'three';
import { WgslMaterial as Material, WgslModule as ShaderModule, WgslUniformBlock as UniformBlock, type MarineBatch } from './marine-shared.js';
export declare const FISH_SPECULAR = "intended";
export declare const skinTable: () => UniformBlock;
/** The skin table rows (8 vec4 per species, in pattern order). */
export declare const skinRows: () => Vector4[];
export declare function fishModule(): ShaderModule;
export declare function createSwimMaterial(batch: MarineBatch, { fade }?: {
    fade?: boolean;
}): Material;
export declare function createPropMaterial(batch: MarineBatch, { fade }?: {
    fade?: boolean;
}): Material;
