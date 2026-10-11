import { type ItemPart } from './_parts.js';
/**
 * Cube-built looks for the Voxel style (P2-26 stage 3, decisions 98 and 99): shapes made of
 * small cubes in a few close shades of one color, so light and shape carry the detail. Only cubes
 * on the outside of a shape are kept (the inside never shows), and neighbors in the same shade
 * along a row merge into one longer box to keep items light. Made the same way every time.
 */
/** Edge of one small cube (half a ground block). */
export declare const CUBE = 0.5;
/** Shades per material, light to dark (the clean palette of the plain block look). */
export declare const VOXEL_COLORS: {
    readonly leaf: readonly ["#9fd84a", "#7cc43e", "#5fa834", "#478a2c"];
    readonly pine: readonly ["#4f8d3a", "#3c7431", "#2f5f29", "#264f23"];
    readonly trunk: readonly ["#a36c35", "#8b5829", "#704522"];
    readonly rock: readonly ["#b5bbc0", "#9aa3ab", "#838c95", "#707985"];
    readonly planks: readonly ["#d9b27a", "#c99f66", "#b88d57"];
    readonly log: readonly ["#8b5829", "#704522"];
    readonly roof: readonly ["#c0503a", "#a8432f", "#8f3a29"];
    readonly stone: readonly ["#a3a9b0", "#8e959d"];
    readonly glass: readonly ["#9fdcff"];
    readonly door: readonly ["#6e4424"];
    readonly petal: readonly ["#ffffff", "#f4f6fb"];
    readonly flowerMiddle: readonly ["#ffd24a"];
    readonly stem: readonly ["#4f9d3a"];
    readonly metal: readonly ["#7a838e", "#67707b", "#5b6470"];
    readonly barrel: readonly ["#d0493a", "#c0392b", "#a93226"];
    readonly cone: readonly ["#ff8a2a", "#ff7a1a", "#ec6a10"];
    readonly white: readonly ["#ffffff", "#eef0f4"];
    readonly lampLight: readonly ["#fff6c4", "#ffe98a"];
};
/** A tiny seeded random generator, so every item is the same everywhere. */
export declare function seeded(seed: number): () => number;
/** Cells of a cube grid: x, y, z in cubes (y = 0 is the ground layer), with a color. */
export type Cell = readonly [number, number, number, string];
/**
 * Parts from grid cells: one cube per cell (where shapes overlap, a later cell paints over an
 * earlier one: two cubes in one place would flicker), hidden cells (all six neighbors filled) are
 * dropped, and runs of cells in one color along x merge into one box. `offset` (in meters) moves the result, e.g. by half a cube
 * to center a shape that is an odd number of cubes wide.
 */
export declare function cellsToParts(cells: readonly Cell[], size?: number, offset?: readonly [number, number, number]): ItemPart[];
/** One shade of a material, picked at random. */
export declare const shade: (colors: readonly string[], random: () => number) => string;
/**
 * A rounded, uneven clump of cubes (tree crowns, bushes): cells inside an ellipsoid, with some
 * cells on its edge left out so the outline is not a perfect ball.
 */
export declare function clump(options: {
    /** Center in cubes. */
    center: readonly [number, number, number];
    /** Radii in cubes. */
    radius: readonly [number, number, number];
    colors: readonly string[];
    seed: number;
    /** Share of edge cells left out. */
    gaps?: number;
}): Cell[];
/** A column of cells from `bottom` up to (not including) `top`. */
export declare function column(x: number, z: number, bottom: number, top: number, colors: readonly string[], seed: number): Cell[];
/**
 * A solid block of cells between two corners (inclusive, in cubes), each cell in a random shade;
 * `shadeBy: 'row'` gives each row along x one shade instead, so it merges into one board.
 */
export declare function fill(from: readonly [number, number, number], to: readonly [number, number, number], colors: readonly string[], random: () => number, shadeBy?: 'cell' | 'row'): Cell[];
