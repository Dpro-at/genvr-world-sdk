import type { WaterBody } from '../contracts/index.js';
import { type HeightUpdate, type TerrainData } from './terrain-data.js';
type Point = readonly [number, number];
export declare const ROAD_LIMITS: {
    /** Total length of the control polyline in meters. */
    readonly maxLength: 1000;
    /** Shortest distance between two control points. */
    readonly minSegment: 1;
};
export declare const polylineLength: (points: readonly Point[]) => number;
/**
 * Smooth centerline through the control points (Catmull-Rom), sampled about every `step`
 * meters. Always passes through every control point; two points give a straight line.
 */
export declare function roadCenterline(points: readonly Point[], step?: number): Array<[number, number]>;
/** Problems with a road's shape, or null when it can be built. */
export declare function roadShapeError(points: readonly Point[]): string | null;
/** Bridges: deck height above the water, ramp steepness, and dry land kept under each end. */
export declare const BRIDGE: {
    readonly clearance: 1.2;
    readonly rampSlope: 0.12;
    readonly abutment: 2;
};
/** One point on a road's centerline with the height the road surface should have there. */
export interface RoadSample {
    x: number;
    z: number;
    /** Meters from the start of the road. */
    distance: number;
    height: number;
    /** True where the road is a bridge (over water, including a short abutment on each shore). */
    bridge: boolean;
    /** True where the road is over water (the ground there is never graded). */
    overWater: boolean;
}
/**
 * Height profile of a road: the natural ground smoothed along the road so it climbs hills
 * gently, raised to a bridge deck over water with ramps on both sides. Deterministic, so the
 * browser, the server, and the renderer agree.
 */
export declare function roadProfile(
/** The ground under the road: the height field, or block ground (P2-26). */
terrain: Pick<TerrainData, 'heightAt'>, points: readonly Point[], water?: readonly WaterBody[]): RoadSample[];
/**
 * Plans the terrain changes that give a road a flat bed: the ground under the road follows a
 * smoothed height profile along the centerline, and blends back to the natural ground over a
 * shoulder on both sides. Deterministic, so every client and the server grade identically.
 */
export declare function planRoadGrading(terrain: TerrainData, points: readonly Point[], width: number, water?: readonly WaterBody[]): HeightUpdate[];
export {};
