export interface ShoreFieldInput {
    /** Sea depth (level - ground, m) per cell, row-major, res x res; <= 0 is land. */
    depth: Float32Array;
    res: number;
    /** World x and z of the grid's first corner (the square is origin .. origin + size on both axes). */
    origin: number;
    size: number;
    /** Unit xz direction the swell travels in. */
    swellDir: [number, number];
    maxDepth?: number;
    minDepth?: number;
}
export interface ShoreField {
    data: Float32Array;
    res: number;
    cellSize: number;
    origin: number;
    size: number;
}
/** Tidewater's swell direction (WorldLayout.js L35): travelling north (-z), a little to the west. */
export declare const DEFAULT_SWELL_DIR: [number, number];
/** `computeShoreField` (L66-243). Self-contained: nothing from outside the function body is used. */
export declare function computeShoreField(input: ShoreFieldInput): ShoreField;
/**
 * The swell direction when the place does not set one (Genvr's own): from the open side of the island. For 16
 * directions, the share of deep water (capped at 25 m) in the up-swell strip of the square; Tidewater's direction
 * when it is as good as the best (an island in open sea), else the mean of the best directions.
 */
export declare function autoSwellDirection(depth: Float32Array, res: number): [number, number];
