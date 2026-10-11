import { type River, type WaterBody, type WorldDocument } from '../contracts/index.js';
import { type HeightUpdate, type TerrainData } from './terrain-data.js';
type Point = readonly [number, number];
export type RiverStretch = 'calm' | 'rapids' | 'waterfall' | 'mouth';
/** One point along a river's centerline, one per meter. */
export interface RiverSample {
    x: number;
    z: number;
    /** Meters from the start of the river. */
    distance: number;
    /** Height of the carved bed. */
    bed: number;
    /** Height of the water surface (always falling along the river). */
    surface: number;
    /** How steeply the surface falls here (meters per meter, never negative). */
    slope: number;
    /** The river's width at this point; it widens toward the mouth. */
    width: number;
    kind: RiverStretch;
}
/** A river's shape with its derived samples, used for drawing and for the current. */
export interface RiverProfile {
    id: string;
    flow: number;
    samples: RiverSample[];
}
/** How deep a river of this width is, in meters. */
export declare const riverDepth: (width: number) => number;
/** Problems with a river's shape, or null when it can be built. */
export declare function riverShapeError(points: readonly Point[]): string | null;
/**
 * Samples a river every meter: the bed carved into the ground, the water surface that always
 * falls, how steep each stretch is, and whether it is calm water, rapids, a waterfall, or the
 * mouth where the river meets a lake or the sea and stops by itself.
 */
export declare function riverProfile(terrain: Pick<TerrainData, 'heightAt'>, points: readonly Point[], width: number, widen?: number, water?: readonly WaterBody[], sea?: number | null): RiverSample[];
/**
 * Plans the terrain changes that carve a river's bed: flat across the middle at the bed height,
 * sloping up to the natural ground over a bank on both sides. Shaped like `planRoadGrading`, so
 * undo restores the hill exactly.
 */
export declare function planRiverCarving(terrain: TerrainData, samples: readonly RiverSample[], 
/**
 * Steepest bank the style allows, in degrees (2026-09-29). A bank was a fixed width however deep
 * the river cut, so a river running down through a bump left cliffs of up to 57° either side and
 * every starter valley failed its own checks. The bank is now a slope under it, up to the ground.
 */
maxSlope?: number): HeightUpdate[];
/**
 * Roads a river runs across. A road is graded flat when it is drawn and bridged where it meets
 * water that already exists, so a river carved across one afterwards leaves it hanging over the
 * new channel until its grading is run again. The builder is told rather than left to find out.
 */
export declare function roadsCrossedBy(samples: readonly RiverSample[], roads: ReadonlyArray<{
    id: string;
    name?: string | undefined;
    points: ReadonlyArray<Point>;
    width?: number | undefined;
}>): string[];
/** Builds the profiles of a place's rivers, ready for drawing and for the current. */
export declare function riverProfiles(terrain: Pick<TerrainData, 'heightAt'>, rivers: readonly River[], water?: readonly WaterBody[], sea?: number | null): RiverProfile[];
/**
 * The river's water surface at a point, or null outside its banks. Rivers have no polygon, so
 * `waterSurfaceAt` cannot find them: without this a player walks along the riverbed and never
 * swims, and the current never reaches anyone. Both the browser and the server call it, from the
 * same profiles, so they agree.
 */
export declare function riverSurfaceAt(profiles: readonly RiverProfile[], x: number, z: number): number | null;
/**
 * The water surface at a point from everything in the place: lakes, the sea and rivers, the
 * higher wins; null where the ground is dry. The studio draws and swims by this, and the rest law
 * (P2-43) floats things on it in the browser and on the server alike.
 */
export declare function placeWaterAt(environment: Pick<WorldDocument['environment'], 'water' | 'sea'>, terrain: TerrainData, profiles: readonly RiverProfile[], x: number, z: number): number | null;
/**
 * `placeWaterAt` for a document as it stands now, with its rivers' profiles worked out once
 * (P2-43): the water a `SurfaceIndex` rests things on. Build it again after the water, the rivers
 * or the ground under them change.
 */
export declare function restWaterAt(doc: Pick<WorldDocument, 'environment'>, terrain: TerrainData): (x: number, z: number) => number | null;
/**
 * The current at a point: the river's direction there times its speed, which rises with the
 * slope. Zero outside the banks, so swimmers only feel it in the water.
 */
export declare function riverFlowAt(profiles: readonly RiverProfile[], x: number, z: number): [number, number];
export {};
