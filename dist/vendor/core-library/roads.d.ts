/**
 * Road types of the Core Library (task P3-16). A road stores its type as `materialId`; the
 * engine grades the ground, builds bridges over water, and draws each type its own way.
 */
export type RoadLook = 'street' | 'dirt' | 'tram' | 'rail' | 'fantasy' | 'path';
export interface RoadType {
    id: string;
    name: string;
    /** Default width in meters (the road bed that gets graded). */
    width: number;
    look: RoadLook;
}
export declare const ROAD_TYPES: readonly RoadType[];
export declare const DEFAULT_ROAD_TYPE: RoadType;
/** Road type of a road's `materialId` (roads without one are streets). */
export declare const getRoadType: (id: string | undefined) => RoadType;
