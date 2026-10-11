/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import * as THREE from 'three';
import { GeoBuilder } from './geometry-builder.js';
import { PART } from './palm-geometry.js';
export { PART };
export interface Built {
    geometry: THREE.BufferGeometry;
    triangles: number;
}
export interface MergedBuilt<K extends string> extends Built {
    perKind: Record<K, number>;
}
export declare function buildFern(seed?: number, b?: GeoBuilder): Built;
export declare function buildBanana(seed?: number, b?: GeoBuilder): Built;
export declare const UNDERSTORY: {
    YOUNG: number;
    BANANA: number;
    FERN: number;
    BANANA_B: number;
};
export declare function buildUnderstory(): MergedBuilt<'young' | 'fern'>;
export declare function buildBananas(): MergedBuilt<'banana' | 'bananaB'>;
export declare function buildMonstera(seed?: number, b?: GeoBuilder): Built;
export declare function buildElephantEar(seed?: number, b?: GeoBuilder): Built;
export declare function buildHeliconia(seed?: number, b?: GeoBuilder): Built;
export declare function buildStrelitzia(seed?: number, b?: GeoBuilder): Built;
export declare const BROADLEAF: {
    MONSTERA: number;
    ELEPHANT: number;
    HELICONIA: number;
    STRELITZIA: number;
};
export declare function buildMonsteraMesh(): Built;
export declare function buildBroadleaf(): MergedBuilt<'elephant' | 'heliconia' | 'strelitzia'>;
