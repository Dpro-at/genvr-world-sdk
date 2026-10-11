import type { BuildingLook } from '../contracts/index.js';
type Point = readonly [number, number];
type RoofShape = NonNullable<BuildingLook['roofShape']>;
/** A roof face as a plane: metres above the eaves at (x, z) are `a * x + b * z + c`. */
export interface RoofPlane {
    a: number;
    b: number;
    c: number;
}
/**
 * The rectangle a roof is built over (Real place R4b): the smallest box around the outline along one of its own
 * sides. `u` runs along the ridge (the longer side), `v` across it.
 */
export interface RoofFrame {
    cx: number;
    cz: number;
    ux: number;
    uz: number;
    /** Half the box along the ridge and across it, metres. */
    halfLength: number;
    halfWidth: number;
}
export declare function roofFrame(points: readonly Point[]): RoofFrame;
/** A roof can be a whole spire (R4c). */
export declare const MAX_ROOF_HEIGHT = 80;
/** Height of a roof of this shape over this outline when the map does not say: a usual pitch, 1 m to 8 m. */
export declare function defaultRoofHeight(points: readonly Point[], shape: RoofShape): number;
/**
 * The faces of a roof: its height over a point is the lowest of them (never below the eaves). Gabled: two faces
 * meeting at a ridge along the long side. Hipped: also sloped ends, as steep as the sides. Pyramidal: four faces to
 * one top. Skillion: one face rising across the building. Flat: none.
 */
export declare function roofPlanes(points: readonly Point[], shape: RoofShape, height: number): RoofPlane[];
/** Metres of roof above the eaves at (x, z). */
export declare function roofHeightAt(planes: readonly RoofPlane[], x: number, z: number): number;
/**
 * The part of the outline under one roof face: the outline cut by the lines where this face stops being the lowest.
 * A face lies wholly in its part, so the part is drawn as a flat polygon on it.
 */
export declare function roofFacet(points: readonly Point[], planes: readonly RoofPlane[], index: number): Array<[number, number]>;
/**
 * Where along a facade side (0..1, from a to b) the roof above it bends: the wall top is straight between them, so
 * a gable end is drawn exactly.
 */
export declare function roofBends(a: Point, b: Point, planes: readonly RoofPlane[]): number[];
export {};
