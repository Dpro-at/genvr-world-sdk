import type { Game } from '@genvr/contracts';
import { presentIds, type GameContext } from '../context.js';
import type { Phase, Winner } from '../types.js';

/** One phase of a match, in the order a game runs them. */
export interface PhaseStep {
  phase: Phase;
  /** How long it lasts (ms); null: until enough players are here. */
  ms: number | null;
  /** Before play: losing players below the minimum goes back to the first step. */
  gathering: boolean;
  /** When its time runs out: go on to the next step, or tell the others time is up (play). */
  end: 'next' | 'time_up';
}

/**
 * The phases of a game, in order; after the last one a new match starts from the first. A later
 * game (a buy phase before play, a warm-up) adds its own steps here.
 */
export function phaseSteps(game: Game): PhaseStep[] {
  const { match } = game;
  return [
    { phase: 'waiting', ms: null, gathering: true, end: 'next' },
    { phase: 'countdown', ms: match.countdownSec * 1000, gathering: true, end: 'next' },
    { phase: 'playing', ms: match.durationSec * 1000, gathering: false, end: 'time_up' },
    { phase: 'results', ms: match.resultsSec * 1000, gathering: false, end: 'next' },
  ];
}

/**
 * The match (`game.match`): walks the phase list. Gathering phases follow the number of players,
 * the others follow the clock; play ends when a component names a winner (`match_won`), or one
 * tick after the clock ran out (or everyone left) when none did: with the clock's fallback winner
 * (the ranking's, when the game has one), or with no winner.
 */
export class MatchComponent {
  readonly #ctx: GameContext;
  readonly #steps: PhaseStep[];
  #index = 0;
  /**
   * Play must end but nobody named a winner yet (the clock ran out, or everyone left). Checked on
   * the next tick, so the components and rule chains that decide on it finish their own flush first.
   */
  #undecided: 'clock' | 'empty' | null = null;
  /** Who wins a match the clock ended when nothing named a winner (nobody by default). */
  readonly #clockWinner: () => Winner;

  constructor(ctx: GameContext, clockWinner: () => Winner = () => null) {
    this.#ctx = ctx;
    this.#clockWinner = clockWinner;
    this.#steps = phaseSteps(ctx.game);
    ctx.phase = this.#steps[0]!.phase;
    ctx.endsAt = null;
    const { bus } = ctx;
    bus.on('player_joined', () => this.#evaluate());
    bus.on('player_left', () => {
      this.#evaluate();
      if (this.#step.end === 'time_up' && presentIds(ctx).length === 0) this.#undecided ??= 'empty';
    });
    bus.on('solo_changed', () => this.#evaluate());
    bus.on('match_won', () => {
      if (this.#step.end === 'time_up') this.#next();
    });
  }

  get #step(): PhaseStep {
    return this.#steps[this.#index]!;
  }

  get #minPlayers(): number {
    return this.#ctx.solo ? 1 : this.#ctx.game.match.minPlayers;
  }

  /** Called once the session exists (and on every tick): moves on when the phase's time is up. */
  start(): void {
    this.#evaluate();
  }

  tick(): void {
    const { endsAt, now } = this.#ctx;
    // Someone who came back meanwhile keeps an emptied match going.
    if (this.#undecided === 'empty' && presentIds(this.#ctx).length > 0) this.#undecided = null;
    if (this.#undecided !== null && this.#step.end === 'time_up' && !this.#ctx.decided) {
      // Nothing ended play when it had to: the clock's fallback decides, an emptied match has no winner.
      const winner = this.#undecided === 'clock' ? this.#clockWinner() : null;
      this.#undecided = null;
      this.#ctx.decided = true;
      this.#ctx.bus.emit({ type: 'match_won', winner });
      return;
    }
    if (endsAt === null || now < endsAt) return;
    if (this.#step.end === 'time_up') {
      // Stays in play until the winner is named (match_won moves on).
      this.#ctx.endsAt = null;
      this.#undecided = 'clock';
      this.#ctx.bus.emit({ type: 'time_up' });
    } else this.#next();
  }

  /** Gathering phases follow the number of players: enough moves on, too few goes back to the start. */
  #evaluate(): void {
    if (!this.#step.gathering) return;
    const enough = presentIds(this.#ctx).length >= this.#minPlayers;
    if (!enough) {
      if (this.#index !== 0) this.#enter(0);
    } else if (this.#step.ms === null) this.#next();
  }

  #next(): void {
    if (this.#index + 1 < this.#steps.length) {
      this.#enter(this.#index + 1);
      return;
    }
    // The last phase is over: a new match with the players who are here.
    this.#ctx.bus.emit({ type: 'match_reset' });
    this.#enter(0);
    this.#evaluate();
  }

  #enter(index: number): void {
    this.#index = index;
    this.#undecided = null;
    const step = this.#step;
    this.#ctx.phase = step.phase;
    this.#ctx.endsAt = step.ms === null ? null : this.#ctx.now + step.ms;
    this.#ctx.bus.emit({ type: 'phase_changed', phase: step.phase, endsAt: this.#ctx.endsAt });
  }
}
