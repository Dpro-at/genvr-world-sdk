import type { CommandPayload, WorldDocument } from '../../contracts/index.js';
import type { Rect } from './region.js';
import { type RestShape } from './rest.js';
import type { SurfaceIndex } from './surface-index.js';
export interface ChainResult {
    commands: CommandPayload[];
    truncated: boolean;
}
/** Which items in a region rest by the law now, before a change (P2-43). */
export declare function restingBefore(doc: WorldDocument, region: Rect[] | 'all', shapeOf: (itemId: string) => RestShape | null, surfaces: SurfaceIndex): Map<string, boolean>;
/**
 * Rests again, lowest first, every item that rested before the change (P2-43). When an item
 * moves, the items over its old place are checked first (while it is still where it was), so a
 * lamp on a table on a platform follows all of them: each candidate resting on something that
 * rose gets a `lift` added to the height `rest` searches down from (controller ruling, amended in
 * review round 1: `lift[c] = max(lift[c], dy)` — `dy` alone, since a level's own `dy` already
 * reflects every lift below it through the search it did with its own already-lifted `fromY`;
 * adding the mover's `lift` again double-counted and could search past a real, lower support all
 * the way up to something merely floating above). Items placed in the air on purpose, and
 * floating ones, are never touched (their `resting` entry is false). A `grade` item also re-queues
 * whatever rested, before the grade, in the blended ring around its base (review round 1,
 * IMPORTANT 1), even if that neighbour was outside the region the caller judged `resting` from,
 * because the grade's own blend can move ground under it that the triggering command never
 * touched.
 */
export declare function settleChain(doc: WorldDocument, shapeOf: (itemId: string) => RestShape | null, surfaces: SurfaceIndex, resting: Map<string, boolean>, apply: (command: CommandPayload) => void, limits?: {
    levels: number;
    items: number;
}, options?: {
    /**
     * Asked before a re-rested `grade` item levels its ground (P2-43 final review): true means the
     * caller grades it later (once, when a sculpt drag ends), so this pass only rests it on the
     * ground as it is and neither levels nor re-queues its blend ring.
     */
    deferGrade?: (instanceId: string) => boolean;
}): ChainResult;
/**
 * Level the ground under a graded base, and blend it into the ground around (P2-43): first a soft
 * flatten over the base grown by `BLEND` (full in the middle, fading to nothing at its edge), then
 * a hard flatten over the base itself, so the base is exactly level and the edge is a slope.
 */
export declare function gradeCommands(grade: {
    area: Array<[number, number]>;
    level: number;
}): CommandPayload[];
