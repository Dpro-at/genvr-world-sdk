import type { Gate, Position } from './types.js';
/** How far above or below a gate a pass still counts, in metres (a bridge over it does not). */
export declare const GATE_HEIGHT = 8;
/**
 * Whether a move from `from` to `to` passes through `gate` in its direction of travel. The move is
 * the segment between two trusted positions, so a fast car cannot skip a gate, and a pass the wrong
 * way or beside the gate does not count. A move that starts behind the line and ends on or past it
 * counts once: standing on the line counts for the next move, not this one.
 */
export declare function crossesGate(from: Position, to: Position, gate: Gate): boolean;
