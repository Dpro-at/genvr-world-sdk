import { GameMadeMove, GameMadeMoves, MadeMotionEntry, madeMoveProblem, type GameBaseMove, type LabRun, type MotionVersion } from '@genvr/contracts';
import { labMadeMotionPace } from '@genvr/runtime';

/**
 * Motions made in the Lab used in the game (board M19). Saving a version of a made motion puts it in My motions (a
 * private store on this device); a project uses one on a key 1–8 (once or loop) or instead of a base move of this
 * project's avatar. The Avatar tab and the `avatar_studio` tool (moves_mine, move_use, move_unuse) go through this one
 * controller with the same checks: Walk and Run take only a travelling loop that passes the course.
 */
export interface MadeMotionStore {
  list(): Promise<MadeMotionEntry[]>;
  put(entry: MadeMotionEntry): Promise<void>;
  subscribe?(listener: () => void): () => void;
}

/** What the game does with the project's made moves (the live runtime). */
export interface MadeMovesPlayer {
  setMadeMoves(moves: ReadonlyArray<{ id: string; motion: GameMadeMove['motion']; once: boolean; slot?: number | undefined; replaces?: string | undefined }>): void;
  playAnimation(id: string): boolean;
}

/** The My motions entry for a saved version of a made motion (null when the version is not one). */
export function madeEntry(version: MotionVersion, run: LabRun | undefined, rights: { shareable: boolean; reasons: string[] }): MadeMotionEntry | null {
  if (!version.made) return null;
  const passes = version.score.finished && !version.score.fell && !version.score.car_hit;
  return MadeMotionEntry.parse({
    id: version.id, name: version.made.name, n: version.n, score: version.score.total, passes_course: passes,
    pace: run?.move ?? labMadeMotionPace(version.made), character: version.settings.character,
    rights, motion: version.made, saved_at: version.at || new Date().toISOString(),
  });
}

/** An in-memory store (tests; hosts without a device store). */
export function memoryMadeMotionStore(): MadeMotionStore {
  const rows = new Map<string, MadeMotionEntry>(), listeners = new Set<() => void>();
  return {
    list: async () => [...rows.values()],
    put: async (entry) => { rows.set(entry.id, MadeMotionEntry.parse(entry)); for (const l of listeners) l(); },
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

export type MadeMoveUse = { slot: number; replaces?: undefined } | { replaces: GameBaseMove; slot?: undefined };

export class MadeMovesController {
  #moves: GameMadeMove[];
  #listeners = new Set<() => void>();
  #player: MadeMovesPlayer | null = null;
  #version = 0;
  constructor(readonly store: MadeMotionStore, moves: readonly GameMadeMove[], private readonly onChange: (moves: GameMadeMove[]) => void = () => {}) {
    this.#moves = GameMadeMoves.parse(moves);
  }
  get moves(): readonly GameMadeMove[] { return this.#moves; }
  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  getVersion = () => this.#version;
  /** The live game; it gets the project's moves at once and after every change. */
  setPlayer(player: MadeMovesPlayer | null) { this.#player = player; this.#apply(); }
  #apply() { this.#player?.setMadeMoves(this.#moves.map((m) => ({ id: m.id, motion: m.motion, once: m.once, slot: m.slot, replaces: m.replaces }))); }
  #set(moves: GameMadeMove[]) {
    this.#moves = GameMadeMoves.parse(moves);
    this.#version++;
    this.onChange(this.#moves);
    this.#apply();
    for (const l of this.#listeners) l();
  }
  /** My motions (newest version of each made motion first) and where this project uses each. */
  async mine() {
    const rows = (await this.store.list()).sort((a, b) => b.saved_at.localeCompare(a.saved_at));
    return rows.map((e) => {
      const use = this.#moves.find((m) => m.id === e.id);
      return { id: e.id, name: e.name, version: e.n, score: e.score, passes_course: e.passes_course, travels: e.pace.speed, loop: e.motion.loop,
        shareable: e.rights.shareable, used: use ? (use.slot !== undefined ? { slot: use.slot, once: use.once } : { replaces: use.replaces!, once: use.once }) : null };
    });
  }
  async #entry(id: string): Promise<MadeMotionEntry> {
    const rows = await this.store.list();
    const entry = rows.find((e) => e.id === id) ?? rows.filter((e) => e.name.toLowerCase() === id.toLowerCase()).sort((a, b) => b.n - a.n)[0];
    if (!entry) throw new Error(`No made motion "${id}" in My motions. Save a version in the Lab first (moves_mine lists them).`);
    return entry;
  }
  /** Use a made motion on a key 1–8, or instead of a base move (Walk and Run: a travelling loop that passes the course). */
  async use(id: string, where: MadeMoveUse, once = true): Promise<GameMadeMove> {
    const e = await this.#entry(id);
    const move = { id: e.id, name: e.name, ...(where.slot !== undefined ? { slot: where.slot } : { replaces: where.replaces }), once: where.replaces ? false : once,
      passes_course: e.passes_course, pace: e.pace, rights: e.rights, motion: e.motion };
    const why = madeMoveProblem(move);
    if (why) throw new Error(why);
    const next = GameMadeMove.parse(move);
    const clash = (m: GameMadeMove) => m.id === next.id || (next.slot !== undefined && m.slot === next.slot) || (next.replaces !== undefined && m.replaces === next.replaces);
    this.#set([...this.#moves.filter((m) => !clash(m)), next]);
    return next;
  }
  unuse(id: string) {
    if (!this.#moves.some((m) => m.id === id || m.name.toLowerCase() === id.toLowerCase())) throw new Error(`"${id}" is not used in this project.`);
    this.#set(this.#moves.filter((m) => m.id !== id && m.name.toLowerCase() !== id.toLowerCase()));
  }
  /** Preview: plays it on this project's avatar (it is added to the game only for the preview). */
  async preview(id: string): Promise<void> {
    const e = await this.#entry(id);
    if (!this.#player) throw new Error('The game view is not ready.');
    const used = this.#moves.some((m) => m.id === e.id);
    if (!used) this.#player.setMadeMoves([...this.#moves.map((m) => ({ id: m.id, motion: m.motion, once: m.once, slot: m.slot, replaces: m.replaces })), { id: e.id, motion: e.motion, once: true }]);
    if (!this.#player.playAnimation(`motion:made-${e.id}`)) throw new Error('The motion could not play.');
  }
}

/** The open project's made moves, for the live bridge and the in-app assistant. */
export const madeMovesBridge = (() => {
  let current: MadeMovesController | null = null;
  return { register(c: MadeMovesController | null) { current = c; return () => { if (current === c) current = null; }; }, get: () => current };
})();
