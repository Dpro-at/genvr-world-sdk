import type { CommandPayload, CorrectionKind, CorrectionReport } from '../contracts/index.js';
/**
 * Correction logging (task P4-08): watches what a builder does right after an assistant reply
 * and turns it into preference data. Edits to things the reply made count as corrections
 * (moved, deleted, changed); undoing the reply counts as `undone`; a reply nobody touched until
 * the watch ends counts as `kept`.
 */
/** How long after a reply its things are watched. */
export declare const CORRECTION_WINDOW_MS: number;
/** Where a local change came from: an edit, or the undo and redo buttons. */
export type ChangeSource = 'edit' | 'undo' | 'redo';
/** The placed things (items, roads, walls, ...) a command names. */
export declare function commandTargets(command: CommandPayload): string[];
/** What kind of correction a builder's command is. */
export declare function correctionKind(command: CommandPayload): Exclude<CorrectionKind, 'undone' | 'kept'>;
export declare class CorrectionTracker {
    #private;
    /** Receives finished reports (the studio sends them to the API). */
    private readonly send;
    private readonly now;
    constructor(
    /** Receives finished reports (the studio sends them to the API). */
    send: (report: CorrectionReport) => void, now?: () => number);
    /** A reply starts: the previous one's watch ends. */
    startReply(prompt: string): void;
    /** A command the assistant applied (during the reply). */
    recordAi(command: CommandPayload): void;
    /** The reply ended; the watch starts when it changed the world. */
    endReply(): void;
    /**
     * Every local change: during a reply it is the assistant's work (its tool calls apply as
     * normal commands); after the reply it may correct that work.
     */
    onChange(command: CommandPayload, source: ChangeSource): void;
    /** Ends the current watch and sends its report (kept when nothing was corrected). */
    finish(): void;
}
