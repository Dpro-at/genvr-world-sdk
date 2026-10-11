import type { WorldSeed } from '../contracts/index.js';
/** The spawn stands in a clearing this wide (m), flattened so arriving is never on a slope. */
export declare const CLEARING_RADIUS = 14;
/**
 * The island's sea (P2-40 task 7): the land's shore is below 0 all round and the edge of the place
 * fades back up to 0, so water at this height rings the land and stops short of the outer ground.
 */
export declare const ISLAND_SEA_LEVEL = -1;
/**
 * How high the ground is at a point, in meters, for a place of this size. `half` is half the side
 * of the playable area, so the world fits whatever size tier the place has.
 */
export declare function worldHeightAt(world: WorldSeed, x: number, z: number, half: number): number;
