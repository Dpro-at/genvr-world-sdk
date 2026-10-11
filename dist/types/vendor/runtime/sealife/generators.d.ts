import type { Generator } from '../generators.js';
/**
 * Generators of the sea-life items (SEALIFE-01). Pure geometry: equal parameters always give equal geometry, so
 * `buildGenerated` keeps one build per parameter set. Three levels each, nearest first; `ItemsView` switches them
 * by distance (`LOD_DISTANCES`).
 */
export declare const STARFISH_GENERATOR = "sealife.starfish";
export declare const CLAM_GENERATOR = "sealife.giant-clam";
export declare const SHELL_GENERATOR = "sealife.shell";
export declare const starfishGenerator: Generator;
export declare const clamGenerator: Generator;
export declare const shellGenerator: Generator;
