import type { CommandPayload } from '@genvr/contracts';

/**
 * Applies a Real place map build to the studio (REAL-06): in pieces with a frame drawn between them, joined into one
 * undo step, with progress, Cancel, and a clean take-back when it fails.
 */

/** What a map build needs from the studio runtime (`GenvrRuntime` has all of it). */
export interface MapBuildTarget {
  /** Grows by one per new undo step, also when the full history drops its oldest (CommandHistory.size). */
  undoMark(): number;
  mergeUndoSince(mark: number): void;
  applyBatch(commands: readonly CommandPayload[]): boolean;
  undo(): boolean;
}

export interface MapBuildProgress {
  signal: AbortSignal;
  report(done: number, total: number, stage: string): void;
}

export const MAP_BUILD_CANCELLED = 'Build cancelled.';
export const MAP_BUILD_FAILED = 'This place could not take the build; nothing was changed.';
export const MAP_BUILD_CHANGED =
  'The place was changed while the map was building, so the build stopped. Use Undo at the top to take back what was built.';

/**
 * Each piece aims at this many milliseconds: a house grades its ground and takes far longer than a tree, so the piece
 * size follows the time the last piece took (150 houses at once froze the studio long enough for the room to drop the
 * connection).
 */
export const MAP_BUILD_PIECE_MS = 40;
export const MAP_BUILD_PIECE = { first: 10, max: 150 };

/**
 * Ends an edit group the player has open (a brush stroke, an item drag) so it becomes its own undo step and moves
 * the mark: an empty batch closes the open group and adds nothing. Undo would otherwise close it and take it back
 * instead of the build.
 */
export function closeOpenEdit(target: MapBuildTarget): void {
  target.applyBatch([]);
}

/**
 * Applies `commands` and returns the undo mark of the build's one step, or null when nothing was applied. Throws
 * `MAP_BUILD_CANCELLED` (Cancel; all taken back), `MAP_BUILD_FAILED` (a piece was refused; all taken back) or
 * `MAP_BUILD_CHANGED` (another edit came in between pieces; what was built stays, never joined with that edit).
 */
export async function applyMapBuild(
  target: MapBuildTarget,
  commands: readonly CommandPayload[],
  options: {
    stage: (type: string) => string;
    progress?: MapBuildProgress;
    now?: () => number;
    pause?: () => Promise<void>;
  },
): Promise<number | null> {
  const { stage, progress, now = () => performance.now() } = options;
  const pause = options.pause ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  // The undo mark right after our last piece; -1 while nothing was applied.
  let mark = -1;
  // Takes the build back when its step is still the newest; false when another edit lies on top of it.
  const takeBack = (): boolean => {
    if (mark < 0) return true;
    closeOpenEdit(target);
    const ours = target.undoMark() === mark;
    if (ours) target.undo();
    mark = -1;
    return ours;
  };
  const stop = (message: string) => new Error(takeBack() ? message : MAP_BUILD_CHANGED);
  let size = MAP_BUILD_PIECE.first;
  for (let i = 0; i < commands.length; ) {
    if (progress?.signal.aborted) throw stop(MAP_BUILD_CANCELLED);
    // Another edit (a tool, Undo, the helper) came in between pieces: joining would swallow it. One still open (a
    // brush stroke, a drag) is closed first so it shows as a step.
    if (mark >= 0) closeOpenEdit(target);
    if (mark >= 0 && target.undoMark() !== mark) {
      mark = -1;
      throw new Error(MAP_BUILD_CHANGED);
    }
    const piece = commands.slice(i, i + size);
    progress?.report(i, commands.length, stage(piece[0]!.type));
    const before = target.undoMark();
    const started = now();
    const ok = target.applyBatch(piece);
    const took = Math.max(1, now() - started);
    size = Math.max(1, Math.min(MAP_BUILD_PIECE.max, Math.round((size * MAP_BUILD_PIECE_MS) / took)));
    i += piece.length;
    const grown = target.undoMark() - before;
    // More than one new step: applying closed an edit group the player had open (a brush stroke, a drag) below this
    // piece. On the first piece the build's step is still alone on top; later it would sit between the pieces.
    if (grown > 1 && mark >= 0) {
      mark = -1;
      throw new Error(MAP_BUILD_CHANGED);
    }
    if (grown > 0) {
      if (mark >= 0) target.mergeUndoSince(mark - 1);
      mark = target.undoMark();
    }
    if (!ok) throw stop(MAP_BUILD_FAILED);
    await pause();
  }
  // A Cancel pressed while the last piece was drawn still takes the build back.
  if (progress?.signal.aborted) throw stop(MAP_BUILD_CANCELLED);
  return mark >= 0 ? mark : null;
}
