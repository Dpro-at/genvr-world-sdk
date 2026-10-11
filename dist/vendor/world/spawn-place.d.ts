import type { WorldDocument } from '../contracts/index.js';
/**
 * Where a player may arrive (owner, 2026-10-07): on a street or open ground, never inside a house or any other
 * object. A Real place build puts houses over an old start point, and creators move walls and items after setting
 * one, so the start point is checked where it is used and moved to the nearest free street (else open ground).
 */
/** Metres kept free between a player and a wall line: the player's radius and a little room. */
export declare const SPAWN_CLEARANCE = 0.6;
/** How far a start point is moved at most, metres. */
export declare const SPAWN_REACH = 300;
/** True when a player standing at (x, z) would be inside a closed building or room, or touch a wall. */
export declare function insideBuilding(doc: WorldDocument, x: number, z: number): boolean;
export interface FreeSpawn {
    x: number;
    z: number;
    /** False when (x, z) was already free. */
    moved: boolean;
}
/**
 * A free place to stand at or near (x, z): (x, z) itself when nothing is there, else the nearest street point that is
 * free, else the nearest free open ground around it. `blocked` adds the caller's own test (items, which only the
 * studio can size). Stays inside the place; returns (x, z) unmoved when nothing free is within `SPAWN_REACH`.
 */
export declare function freeSpawnPoint(doc: WorldDocument, x: number, z: number, blocked?: (x: number, z: number) => boolean): FreeSpawn;
