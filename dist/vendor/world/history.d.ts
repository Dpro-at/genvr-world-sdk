import type { CommandPayload } from '../contracts/index.js';
import { type ApplyResult, type WorldState } from './apply.js';
/** A command that was applied, with its result (e.g. to rebuild what changed and to save it). */
export interface AppliedStep {
    applied: CommandPayload;
    result: ApplyResult;
}
/**
 * Undo/redo history for one editing session. Every step is itself a command, so undo and redo
 * can be sent to the server and to other players like any other edit. Commands made between
 * beginGroup() and endGroup() (one brush drag, a pond dug and filled) undo as one step.
 */
export declare class CommandHistory {
    #private;
    private readonly state;
    private readonly limit;
    constructor(state: WorldState, limit?: number);
    get canUndo(): boolean;
    get canRedo(): boolean;
    /**
     * A mark for `mergeSince`: the undo steps so far, counting the oldest ones a full history dropped.
     * It grows by one for every new step even when the history is full (REAL-06: a map build applied
     * piece by piece tells from it whether a piece added a step), and shrinks by one on undo.
     */
    get size(): number;
    /**
     * Joins every undo step made since `mark` (a `size` read earlier) into one, e.g. all the edits
     * of one assistant reply, so a single Undo takes them all back. Steps the full history dropped
     * since the mark are gone; the rest are joined. Returns true when it merged.
     */
    mergeSince(mark: number): boolean;
    /** True while a group is open (between beginGroup() and endGroup()). */
    get grouping(): boolean;
    /**
     * Takes back the newest `count` commands of the open group, newest first, and forgets them, so a
     * composite edit that fails half way (P2-43: a grade applied, then its building refused) leaves
     * neither the world nor the undo step changed. Does nothing when no group is open. The redo
     * stack the discarded commands cleared is not restored.
     */
    discardFromGroup(count: number): void;
    /**
     * Counts the groups begun so far, so a helper can tell one open group from the next (P2-43: the
     * rest law keeps what a drag deferred per group). Changes only in `beginGroup`.
     */
    get groupNumber(): number;
    /** Starts collecting commands into one undo step (ends any open group first). */
    beginGroup(): void;
    endGroup(): void;
    /** Applies a new command; clears the redo stack. Returns the applied command and its result. */
    execute(command: CommandPayload): AppliedStep;
    /** Undoes the last step (all commands of a group, newest first). Returns what was applied. */
    undo(): AppliedStep[];
    redo(): AppliedStep[];
}
