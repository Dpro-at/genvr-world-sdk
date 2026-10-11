/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { type Material } from 'three';
/** VegNodes.js 58: a JS number as a WGSL float literal. */
export declare const f: (x: number) => string;
export declare const C: (hex: number) => string;
/** A WGSL module of the source engine (ShaderModule options), kept as data. */
export interface GrassWgslModule {
    name: string;
    code: string;
    deps?: readonly GrassWgslModule[];
}
/**
 * Stand-in for the source's `vegModule` (VegNodes.js 65, name 'veg'): wind, hashes, detail texture,
 * camera uniform. Not ported as WGSL; pass the real module when one exists.
 */
export declare const VEG_MODULE_REF: GrassWgslModule;
export declare const MEADOW: {
    lush: string;
    green: string;
    olive: string;
    yellow: string;
    straw: string;
    soil: string;
};
export declare const grassModule: GrassWgslModule;
export declare function grassMaterialOptions(field: GrassMaterialSource, vegModule?: GrassWgslModule): GrassMaterialOptions;
/** What the material reads from the field (GrassField.js 698-709). */
export interface GrassMaterialSource {
    terrain: {
        res: number;
        origin: number;
        size: number;
        texel: number;
    };
    heightTex: unknown;
    maskTex: unknown;
}
/** The source engine's `Material` options for the grass (WGSL as text). */
export interface GrassMaterialOptions {
    name: string;
    side: 'double';
    roughness: number;
    metalness: number;
    modules: GrassWgslModule[];
    textures: {
        grassHeights: unknown;
        grassMask: unknown;
    };
    attributes: Record<string, string>;
    varyings: Record<string, string>;
    vertex: string;
    surface: string;
}
/** Turns the source material options into a renderer material (the TSL port plugs in here). */
export type GrassMaterialFactory = (options: GrassMaterialOptions) => Material;
/**
 * Default factory: a three.js stand-in that carries the source options in `userData.wgsl`. It does
 * NOT place, size or bend anything (that is the WGSL vertex stage): never add it to a scene before the
 * TSL port.
 */
export declare const standInGrassMaterial: GrassMaterialFactory;
/** WGSL `vegGrassTierFade`: per-tier visibility at camera distance d; `cut` is the blade's tier-0 cut-off. */
export declare function grassTierFade(tier: number, d: number, cut: number): number;
/** WGSL `comp`: width compensation of the remaining blades (coverage constant while tiers fade). */
export declare function grassWidthCompensation(d: number): number;
/** WGSL `cut`: the tier-0 cut-off distance of a blade from its random and the slot hash `r2`. */
export declare function grassTierZeroCut(bRnd: number, r2: number): number;
