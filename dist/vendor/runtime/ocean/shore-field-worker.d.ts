import { type ShoreField, type ShoreFieldInput } from './shore-field.js';
/** Cells per side of the shore field (Tidewater: 512). */
export declare const SHORE_FIELD_RES = 512;
export interface ShoreFieldRequest {
    /** Ground height of the place at world x, z. */
    heightAt: (x: number, z: number) => number;
    /** Sea level. */
    level: number;
    /** The sea square is -extent .. extent on x and z. */
    extent: number;
    res?: number;
    /** Unit direction the swell travels in; null or absent: from the open side (`autoSwellDirection`). */
    swellDir?: [number, number] | null;
}
/** Depth (level - ground) at the cell centres of the field's grid, row-major from (-extent, -extent). */
export declare function shoreDepthGrid(heightAt: (x: number, z: number) => number, level: number, extent: number, res: number): Float32Array;
/** Runs the solve in a worker when one can start, else on this thread after the current task. */
export declare function solveShoreField(input: ShoreFieldInput): Promise<ShoreField>;
/** The place's shore field: its heights resampled over the sea square, the swell given or worked out, solved. */
export declare function shoreFieldFromHeights(request: ShoreFieldRequest): Promise<ShoreField & {
    swellDir: [number, number];
}>;
