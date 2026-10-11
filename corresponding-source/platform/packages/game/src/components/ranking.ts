import type { Counter } from '@genvr/contracts';
import type { GameContext } from '../context.js';
import type { Winner } from '../types.js';

/** When a player's counter took the value it has now (-Infinity: they had it from the start). */
interface Reached {
  value: number;
  at: number;
}

/**
 * Ranking (`game.ranking`): orders every player, present or not (a leaver keeps their row until
 * the match ends), by a player counter the designer names, and fills `PlayerView.place` (1 is
 * first). Order: `by` (highest first for `order: 'high'`, lowest for `'low'`), then `then` in the
 * same direction, then who reached their current values first (session clock), then join order.
 * The component knows nothing about what the counters mean.
 *
 * A `by` that is not a declared player counter is logged once and ranks nobody (place stays 0);
 * a bad `then` is logged once and ignored.
 */
export class RankingComponent {
  readonly #ctx: GameContext;
  readonly #by: Counter | null;
  readonly #then: Counter | null;
  readonly #high: boolean;
  /** Per player, per counter name: when the current value was reached. */
  #reached = new Map<string, Map<string, Reached>>();
  /** Join order (first join only; a returning player keeps theirs). */
  readonly #joined = new Map<string, number>();
  #joinSeq = 0;

  constructor(ctx: GameContext) {
    this.#ctx = ctx;
    const ranking = ctx.game.ranking!;
    this.#high = ranking.order === 'high';
    this.#by = this.#playerCounter(ranking.by);
    this.#then = ranking.then === undefined ? null : this.#playerCounter(ranking.then);
    const { bus } = ctx;
    bus.on('player_joined', (event) => {
      if (!this.#joined.has(event.id)) this.#joined.set(event.id, this.#joinSeq++);
      // Joining during play: the start value is reached now, after those already standing at it.
      if (!event.returning && ctx.phase === 'playing') this.#stampJoin(event.id);
      this.#update();
    });
    bus.on('player_left', (event) => {
      if (!ctx.players.has(event.id)) this.#forget(event.id);
      this.#update();
    });
    bus.on('counter_changed', (event) => {
      if (event.id !== null && (event.name === this.#by?.name || event.name === this.#then?.name)) this.#update();
    });
    bus.on('phase_changed', (event) => {
      if (event.phase === 'playing') this.#update();
    });
    // Counters are back at their start values (the counters component resets them first).
    bus.on('match_reset', () => {
      this.#reached = new Map();
      for (const id of this.#joined.keys()) if (!ctx.players.has(id)) this.#forget(id);
      for (const row of ctx.players.values()) row.place = 0;
    });
  }

  /** Player ids best first (present and absent); empty when the ranking counter is unusable. */
  rankedPlayers(): string[] {
    const by = this.#by;
    if (!by) return [];
    const then = this.#then;
    const rows = [...this.#ctx.players.keys()].map((id) => {
      const byNow = this.#stamp(id, by);
      const thenNow = then ? this.#stamp(id, then) : null;
      return {
        id,
        by: byNow.value,
        then: thenNow?.value ?? 0,
        // The current pair of values was reached when the later of the two was.
        at: Math.max(byNow.at, thenNow?.at ?? -Infinity),
        joined: this.#joined.get(id) ?? Infinity,
      };
    });
    const sign = this.#high ? -1 : 1;
    rows.sort(
      (a, b) =>
        sign * (a.by - b.by) || sign * (a.then - b.then) || compare(a.at, b.at) || compare(a.joined, b.joined),
    );
    return rows.map((row) => row.id);
  }

  /**
   * The winner by this ranking (the clock's fallback, and `end_match` by the ranking's own counter
   * and order): the first-ranked player if anyone moved (any player's `by` or `then` value differs
   * from its start: `then` orders players too); else nobody.
   */
  leader(): Winner {
    const by = this.#by;
    const [first] = this.rankedPlayers();
    if (!by || first === undefined) return null;
    const used = this.#then ? [by, this.#then] : [by];
    const moved = [...this.#ctx.players.values()].some((row) =>
      used.some((counter) => (row.counters[counter.name] ?? counter.start) !== counter.start),
    );
    return moved ? { kind: 'player', id: first } : null;
  }

  /** Whether `end_match` by this counter and order should use this ranking's tie-breaks. */
  decides(counter: string, order: 'high' | 'low'): boolean {
    return this.#by !== null && this.#by.name === counter && this.#high === (order === 'high');
  }

  #update(): void {
    const ranked = this.rankedPlayers();
    ranked.forEach((id, index) => {
      this.#ctx.players.get(id)!.place = index + 1;
    });
  }

  /** The value a player has now and when they reached it (a change is stamped with the session clock). */
  #stamp(id: string, counter: Counter): Reached {
    const value = this.#ctx.players.get(id)?.counters[counter.name] ?? counter.start;
    let mine = this.#reached.get(id);
    if (!mine) this.#reached.set(id, (mine = new Map()));
    const known = mine.get(counter.name);
    if (known && known.value === value) return known;
    const fresh = { value, at: !known && value === counter.start ? -Infinity : this.#ctx.now };
    mine.set(counter.name, fresh);
    return fresh;
  }

  #stampJoin(id: string): void {
    const mine = new Map<string, Reached>();
    for (const counter of [this.#by, this.#then]) {
      if (!counter) continue;
      const value = this.#ctx.players.get(id)?.counters[counter.name] ?? counter.start;
      mine.set(counter.name, { value, at: this.#ctx.now });
    }
    this.#reached.set(id, mine);
  }

  #forget(id: string): void {
    this.#reached.delete(id);
    this.#joined.delete(id);
  }

  #playerCounter(name: string): Counter | null {
    const decl = (this.#ctx.game.counters ?? []).find((c) => c.name === name);
    if (decl?.scope === 'player') return decl;
    this.#ctx.log(
      decl
        ? `ranking: counter "${name}" has scope ${decl.scope}, a ranking needs a player counter`
        : `ranking: unknown counter "${name}"`,
    );
    return null;
  }
}

/** Ascending, safe for infinities (never NaN). */
function compare(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
