import type { GameEvent } from './types.js';

type Handler<T extends GameEvent['type']> = (event: Extract<GameEvent, { type: T }>) => void;

/**
 * Where an event comes from: the top-level event (raised outside any delivery, by a call into the
 * session) that led to it, and how many follow-up hops (see `EventBus.followUp`) lie between them.
 */
export interface EventTrace {
  readonly root: GameEvent;
  readonly depth: number;
}

/**
 * Components talk only through events (decision 117); scripts listen here too (P2-10, `ScriptHost`).
 * `emit` only queues: listeners hear an event after the change that raised it is complete
 * (`flush`), never in the middle of it. Events listeners raise meanwhile follow in order.
 */
export class EventBus {
  readonly #handlers = new Map<GameEvent['type'], Array<(event: GameEvent) => void>>();
  readonly #queue: GameEvent[] = [];
  readonly #traces = new WeakMap<GameEvent, EventTrace>();
  /** The trace of the event being delivered; null outside a delivery. */
  #current: EventTrace | null = null;
  #followUp = false;
  #flushing = false;

  on<T extends GameEvent['type']>(type: T, handler: Handler<T>): void {
    const list = this.#handlers.get(type) ?? [];
    list.push(handler as (event: GameEvent) => void);
    this.#handlers.set(type, list);
  }

  emit(event: GameEvent): void {
    const cause = this.#current;
    this.#traces.set(
      event,
      cause ? { root: cause.root, depth: cause.depth + (this.#followUp ? 1 : 0) } : { root: event, depth: 0 },
    );
    this.#queue.push(event);
  }

  /** The trace of the event being delivered now; null outside a delivery. */
  current(): EventTrace | null {
    return this.#current;
  }

  /** The top-level event behind `event` and its follow-up depth (itself and 0 when unknown). */
  traceOf(event: GameEvent): EventTrace {
    return this.#traces.get(event) ?? { root: event, depth: 0 };
  }

  /**
   * Runs `raise`; every event it emits (also through other components) counts one follow-up hop
   * deeper than the event being delivered. The rules interpreter uses it to bound its chains.
   */
  followUp(raise: () => void): void {
    const before = this.#followUp;
    this.#followUp = true;
    try {
      raise();
    } finally {
      this.#followUp = before;
    }
  }

  /** Delivers the queued events, oldest first, until none are left. */
  flush(): void {
    if (this.#flushing) return;
    this.#flushing = true;
    try {
      for (let event = this.#queue.shift(); event; event = this.#queue.shift()) {
        this.#current = this.traceOf(event);
        for (const handler of this.#handlers.get(event.type) ?? []) handler(event);
      }
    } finally {
      this.#current = null;
      this.#flushing = false;
    }
  }
}
