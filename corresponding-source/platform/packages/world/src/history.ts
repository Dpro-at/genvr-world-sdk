import type { CommandPayload } from '@genvr/contracts';
import { applyCommand, type ApplyResult, type WorldState } from './apply.js';

interface Step {
  command: CommandPayload;
  inverse: CommandPayload;
}

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
export class CommandHistory {
  readonly #undo: Step[][] = [];
  readonly #redo: Step[][] = [];
  #group: Step[] | null = null;
  #groups = 0;
  // Oldest steps dropped because the history was full: keeps `size` a stable mark (REAL-06).
  #dropped = 0;

  constructor(
    private readonly state: WorldState,
    private readonly limit = 200,
  ) {}

  get canUndo(): boolean {
    return this.#undo.length > 0;
  }

  get canRedo(): boolean {
    return this.#redo.length > 0;
  }

  /**
   * A mark for `mergeSince`: the undo steps so far, counting the oldest ones a full history dropped.
   * It grows by one for every new step even when the history is full (REAL-06: a map build applied
   * piece by piece tells from it whether a piece added a step), and shrinks by one on undo.
   */
  get size(): number {
    return this.#dropped + this.#undo.length;
  }

  /**
   * Joins every undo step made since `mark` (a `size` read earlier) into one, e.g. all the edits
   * of one assistant reply, so a single Undo takes them all back. Steps the full history dropped
   * since the mark are gone; the rest are joined. Returns true when it merged.
   */
  mergeSince(mark: number): boolean {
    this.endGroup();
    const from = Math.max(0, mark - this.#dropped);
    if (mark < 0 || this.#undo.length - from < 2) return false;
    const merged = this.#undo.splice(from).flat();
    this.#undo.push(merged);
    return true;
  }

  /** True while a group is open (between beginGroup() and endGroup()). */
  get grouping(): boolean {
    return this.#group !== null;
  }

  /**
   * Takes back the newest `count` commands of the open group, newest first, and forgets them, so a
   * composite edit that fails half way (P2-43: a grade applied, then its building refused) leaves
   * neither the world nor the undo step changed. Does nothing when no group is open. The redo
   * stack the discarded commands cleared is not restored.
   */
  discardFromGroup(count: number): void {
    const group = this.#group;
    if (!group || count <= 0) return;
    for (const step of group.splice(Math.max(0, group.length - count)).reverse())
      applyCommand(this.state, step.inverse);
  }

  /**
   * Counts the groups begun so far, so a helper can tell one open group from the next (P2-43: the
   * rest law keeps what a drag deferred per group). Changes only in `beginGroup`.
   */
  get groupNumber(): number {
    return this.#groups;
  }

  /** Starts collecting commands into one undo step (ends any open group first). */
  beginGroup(): void {
    this.endGroup();
    this.#group = [];
    this.#groups += 1;
  }

  endGroup(): void {
    const group = this.#group;
    this.#group = null;
    if (group && group.length > 0) this.#push(group);
  }

  #push(entry: Step[]): void {
    this.#undo.push(entry);
    if (this.#undo.length > this.limit) {
      this.#undo.shift();
      this.#dropped += 1;
    }
    this.#redo.length = 0;
  }

  /** Applies a new command; clears the redo stack. Returns the applied command and its result. */
  execute(command: CommandPayload): AppliedStep {
    const result = applyCommand(this.state, command);
    const step = { command, inverse: result.inverse };
    if (this.#group) {
      this.#group.push(step);
      this.#redo.length = 0;
    } else {
      this.#push([step]);
    }
    return { applied: command, result };
  }

  /** Undoes the last step (all commands of a group, newest first). Returns what was applied. */
  undo(): AppliedStep[] {
    this.endGroup();
    const entry = this.#undo.pop();
    if (!entry) return [];
    const applied: AppliedStep[] = [];
    const redo: Step[] = [];
    for (const step of [...entry].reverse()) {
      const result = applyCommand(this.state, step.inverse);
      applied.push({ applied: step.inverse, result });
      redo.unshift({ command: step.command, inverse: result.inverse });
    }
    this.#redo.push(redo);
    return applied;
  }

  redo(): AppliedStep[] {
    this.endGroup();
    const entry = this.#redo.pop();
    if (!entry) return [];
    const applied: AppliedStep[] = [];
    const undo: Step[] = [];
    for (const step of entry) {
      const result = applyCommand(this.state, step.command);
      applied.push({ applied: step.command, result });
      undo.push({ command: step.command, inverse: result.inverse });
    }
    this.#undo.push(undo);
    return applied;
  }
}
