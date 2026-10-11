import { GameEventName, SCRIPT_LIMITS, type ScriptEvent, type ScriptRecording } from '@genvr/contracts';
import type { GameEvent } from '@genvr/game';
import type { Handles } from './handles.js';

/** The engine events a script may hear (the rules' vocabulary); `custom` carries the names raised by `emit`. */
export const ENGINE_EVENTS: ReadonlySet<string> = new Set([...GameEventName.options, 'product_purchased']);
export const SCRIPT_EVENT_TYPES: ReadonlyArray<GameEvent['type']> = Object.freeze([
  ...(GameEventName.options as ReadonlyArray<GameEvent['type']>),
  'custom',
]);

/**
 * An engine event as a script hears it (spec 4): plain JSON, every player id replaced by its handle, plus `actor`.
 * No positions, no names; `endsAt` on the script clock. Null for an internal event a script never hears.
 */
export function toScriptEvent(
  event: GameEvent,
  actorId: string | null,
  handles: Handles,
  matchStartedAt: number,
): ScriptEvent | null {
  const h = (id: string) => handles.handleOf(id);
  const hn = (id: string | null) => (id === null ? null : handles.handleOf(id));
  const actor = hn(actorId);
  switch (event.type) {
    case 'zone_entered':
    case 'zone_exited':
    case 'zone_crossed':
      return { type: event.type, actor, id: h(event.id), zone: event.zone, tag: event.tag };
    case 'player_joined':
      return { type: 'player_joined', actor, id: h(event.id), team: event.team, returning: event.returning };
    case 'player_left':
      return { type: 'player_left', actor, id: h(event.id) };
    case 'hit':
      return {
        type: 'hit',
        actor,
        victim: h(event.victim),
        by: hn(event.by),
        damage: event.damage,
        health: event.health,
      };
    case 'died':
      return { type: 'died', actor, victim: h(event.victim), by: hn(event.by) };
    case 'respawned':
      return { type: 'respawned', actor, id: h(event.id) };
    case 'phase_changed':
      return {
        type: 'phase_changed',
        actor,
        phase: event.phase,
        endsAt: event.endsAt === null ? null : event.endsAt - matchStartedAt,
      };
    case 'time_up':
      return { type: 'time_up', actor };
    case 'counter_changed':
      return { type: 'counter_changed', actor, name: event.name, value: event.value, id: hn(event.id) };
    case 'timer_fired':
      return { type: 'timer_fired', actor, name: event.name, id: hn(event.id) };
    case 'mounted':
      return { type: 'mounted', actor, id: h(event.id), item: event.item, tag: event.tag, seat: event.seat };
    case 'dismounted':
      return { type: 'dismounted', actor, id: h(event.id), item: event.item, tag: event.tag };
    case 'custom':
      return { type: 'custom', actor, name: event.name, id: hn(event.id) };
    default:
      return null;
  }
}

/** The name a handler registered with `genvr.on` must have to hear `event` (rules' matching, spec 4). */
export function scriptEventName(event: ScriptEvent): string | null {
  if (event.type !== 'custom') return event.type;
  // A custom event that reuses an engine name is never heard (the same as for rules).
  return ENGINE_EVENTS.has(event.name) ? null : event.name;
}

/** A recording as the runner gives it: every event with its time and whether it was a follow-up. */
export interface FullRecording extends ScriptRecording {
  at: number[];
  caused: boolean[];
}

/**
 * The last `SCRIPT_LIMITS.recordingEvents` script-visible events of a match, with its seed, when each happened (ms on
 * the script clock) and whether it was a follow-up (for dry runs, which raise follow-ups again instead of replaying).
 */
export class Recording {
  #events: ScriptEvent[] = [];
  #at: number[] = [];
  #caused: boolean[] = [];
  #seed: number;
  #last: FullRecording | null = null;

  constructor(seed: number) {
    this.#seed = seed;
  }

  push(event: ScriptEvent, at = 0, caused = false): void {
    this.#events.push(event);
    this.#at.push(at);
    this.#caused.push(caused);
    if (this.#events.length > SCRIPT_LIMITS.recordingEvents) {
      this.#events.shift();
      this.#at.shift();
      this.#caused.shift();
    }
  }

  /** A new match: the finished one stays readable until the new one has events. */
  restart(seed: number): void {
    if (this.#events.length > 0)
      this.#last = { seed: this.#seed, events: this.#events, at: this.#at, caused: this.#caused };
    this.#events = [];
    this.#at = [];
    this.#caused = [];
    this.#seed = seed;
  }

  /** The current match's events, or the last match's while the current one has none. */
  snapshot(): FullRecording {
    if (this.#events.length === 0 && this.#last)
      return {
        seed: this.#last.seed,
        events: [...this.#last.events],
        at: [...this.#last.at],
        caused: [...this.#last.caused],
      };
    return { seed: this.#seed, events: [...this.#events], at: [...this.#at], caused: [...this.#caused] };
  }
}
