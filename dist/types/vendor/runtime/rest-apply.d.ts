import type { CommandPayload } from '../contracts/index.js';
import { type RestShape, type SurfaceIndex, type SurfaceLayers } from '../validator/index.js';
import type { AppliedStep, CommandHistory, WorldState } from '../world/index.js';
/** What the rest law needs to know about the place being edited (P2-43). */
export interface RestContext {
    shapeOf(itemId: string): RestShape | null;
    /** The surface index; the host keeps it cached and rebuilds it when told to. */
    surfaces(): SurfaceIndex;
    /** Drops the cached surface index, so the next `surfaces()` builds a new one. */
    invalidate?(): void;
    /**
     * Room floors, bridge decks and water as the place stands now (`restLayers` of `@genvr/world`):
     * after the ground under a wall, road or river changed, the cached index takes these instead of
     * keeping the old ones (P2-43 final review, I6).
     */
    layers?(): SurfaceLayers;
}
/**
 * The one door every studio edit goes through (P2-43, decision 116): a command that asks for rest
 * gets its y (and tilt) by the law, and every item the change reaches that rested before rests
 * again. What stands on a moved item moves with it (I5). All of it is one undo step: its own group,
 * or the group the caller already opened (a build tool's drag), which it then leaves open. While a
 * caller's group is open, a graded building rests on the ground as it is and is graded only once,
 * when the group ends (`endRestGroup`, I1), so a drag leaves no trail of levelled ground. A graded
 * building first levels its ground, then rests again on the levelled ground (the server resolves
 * it after the grade too). If any command is refused, everything this call applied is taken back
 * before the error is thrown on. Undo and redo never come here.
 */
export declare function applyWithRest(history: CommandHistory, state: WorldState, context: RestContext, input: CommandPayload): AppliedStep[];
/**
 * Ends the undo group a caller opened (P2-43 final review, I1): first levels the ground under every
 * graded building the group moved (rested without grading while it was dragged), rests it again
 * on that ground and runs the chain, all inside the same group, then closes it. Returns the steps
 * it applied, for the host to report. Use it instead of `history.endGroup()` around edits that went
 * through `applyWithRest`. If a grade is refused the group is still closed and the error thrown on.
 */
export declare function endRestGroup(history: CommandHistory, state: WorldState, context: RestContext): AppliedStep[];
/**
 * Begins an undo group for edits that go through `applyWithRest` (P2-43 final review): a group
 * still open is ended first through `endRestGroup`, so the grades it deferred are not lost the way
 * `history.beginGroup()` alone would lose them. Returns the steps that flush applied.
 */
export declare function beginRestGroup(history: CommandHistory, state: WorldState, context: RestContext): AppliedStep[];
