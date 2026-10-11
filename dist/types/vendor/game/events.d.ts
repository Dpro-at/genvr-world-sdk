import type { GameEvent } from './types.js';
type Handler<T extends GameEvent['type']> = (event: Extract<GameEvent, {
    type: T;
}>) => void;
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
export declare class EventBus {
    #private;
    on<T extends GameEvent['type']>(type: T, handler: Handler<T>): void;
    emit(event: GameEvent): void;
    /** The trace of the event being delivered now; null outside a delivery. */
    current(): EventTrace | null;
    /** The top-level event behind `event` and its follow-up depth (itself and 0 when unknown). */
    traceOf(event: GameEvent): EventTrace;
    /**
     * Runs `raise`; every event it emits (also through other components) counts one follow-up hop
     * deeper than the event being delivered. The rules interpreter uses it to bound its chains.
     */
    followUp(raise: () => void): void;
    /** Delivers the queued events, oldest first, until none are left. */
    flush(): void;
}
export {};
