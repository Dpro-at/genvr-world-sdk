import type { GenvrManifest } from '../../../contracts/index.js';
/**
 * Road types of the Core Library (task P3-16). A road stores its type as `materialId`; the
 * engine grades the ground, builds bridges over water, and draws each type its own way.
 */
export type RoadLook = 'street' | 'lane' | 'dirt' | 'tram' | 'rail' | 'fantasy' | 'path';
export interface RoadType {
    manifest: GenvrManifest;
    id: string;
    name: string;
    /** Default width in meters (the road bed that gets graded). */
    width: number;
    look: RoadLook;
}
/** One road type; the file lives at `environment/roads/<slug>.ts` (id `genvr.core.road.<slug>`). */
export declare function defineRoad(road: {
    id: string;
    name: string;
    width: number;
    look: RoadLook;
}): RoadType;
