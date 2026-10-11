import { type ItemInstance, type WorldDocument } from '../contracts/index.js';
import { type Placed } from './geometry.js';
import type { WorldEnvironment, WorldFinding } from './world-checks.js';
/**
 * Reachability from the start point (P2-11): a walk over a grid of cells around everything built,
 * standing on the ground, water (players swim), room floors, and the tops of solid items, blocked
 * by item boxes and wall blocks (the same boxes the physics uses). Walking climbs ground up to the
 * character's slope, floors and items up to a jump, ladders up to their top (P2-23), and drops
 * down any height. Reports items that
 * are made to be used from the front (placement rule `clearFront`: benches, houses) and doors that
 * players cannot get to, and closed-in areas on the ground. Pure, like the other checks.
 */
export declare function checkReach(doc: WorldDocument, env: WorldEnvironment, placed: readonly Placed[], nameOf: (instance: ItemInstance) => string): WorldFinding[];
