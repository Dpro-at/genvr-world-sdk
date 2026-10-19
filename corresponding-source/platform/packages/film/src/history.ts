import type { FilmProject } from './model.js';

export const HISTORY_STEPS = 200;
/** One undo step; `by` says who made it (the person, or an agent through MCP) and `at` when (FILM history board 24). */
export interface HistoryStep { label: string; before: FilmProject; after: FilmProject; by?: string; at?: number }

/** Labelled undo and redo. Edits never change a project in place, so steps share nothing that changes later. */
export class History {
  past: HistoryStep[] = [];
  future: HistoryStep[] = [];
  record(step: HistoryStep) {
    this.past.push(step);
    if (this.past.length > HISTORY_STEPS) this.past.splice(0, this.past.length - HISTORY_STEPS);
    this.future = [];
  }
  undo(): HistoryStep | undefined { const step = this.past.pop(); if (step) this.future.push(step); return step; }
  redo(): HistoryStep | undefined { const step = this.future.pop(); if (step) this.past.push(step); return step; }
  get undoLabel() { return this.past.at(-1)?.label; }
  get redoLabel() { return this.future.at(-1)?.label; }
  /** Oldest first, with the step that undo would reverse last. */
  labels() { return { done: this.past.map((s) => s.label), undone: [...this.future].reverse().map((s) => s.label) }; }
  clear() { this.past = []; this.future = []; }
}
