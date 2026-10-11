import { type TerrainData } from './terrain-data.js';
type Point = [number, number];
export declare const WATER_FILL: {
    /** How far from the tap the fill may spread (a basin larger than this is capped). */
    readonly maxRadius: 48;
    /** Minimum depth for a fill to count as a pond (flat ground has no basin). */
    readonly minDepth: 0.3;
    /** Water sits this far below the spill point so it never looks like it overflows. */
    readonly freeboard: 0.05;
};
/** Convex hull (monotone chain) of points on the ground plane, counter-clockwise. */
export declare function convexHull(points: readonly Point[]): Point[];
/**
 * Plans filling the basin around a tapped spot with water: the water rises until it would spill
 * over the lowest point of the rim (priority flood). Returns the water level and an outline that
 * covers the flooded ground, or null when there is no basin (flat or sloping ground).
 */
export declare function planWaterFill(terrain: TerrainData, x: number, z: number): {
    level: number;
    area: Point[];
} | null;
/** Outline of a circle (for brushes and ponds), as a polygon with `sides` corners. */
export declare function circleArea(x: number, z: number, radius: number, sides?: number): Point[];
/**
 * Water surface height at a point, or null where there is no water above the ground there
 * (used for swimming and, later, buoyancy).
 */
export declare function waterSurfaceAt(water: ReadonlyArray<{
    level: number;
    area: ReadonlyArray<readonly [number, number]>;
}>, terrain: TerrainData, x: number, z: number, 
/** The place's sea level (P2-39), which covers everywhere the ground is below it. */
sea?: number | null): number | null;
export {};
