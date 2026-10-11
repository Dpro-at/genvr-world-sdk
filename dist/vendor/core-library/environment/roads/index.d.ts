import type { RoadType } from './_road.js';
export * from './_road.js';
/** Every Core road type, in catalog order (one file per type). */
export declare const ROAD_TYPES: readonly RoadType[];
export declare const DEFAULT_ROAD_TYPE: RoadType;
/** Road type of a road's `materialId` (roads without one are streets). */
export declare const getRoadType: (id: string | undefined) => RoadType;
