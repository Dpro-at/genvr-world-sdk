import { type GameContext } from '../context.js';
import type { Position, ZoneSpec } from '../types.js';
/** How far above or below a zone a sample still counts, in metres. */
export declare const ZONE_HEIGHT = 8;
/**
 * Whether a move from `from` to `to` passes through a gate zone in its direction of travel. The
 * move is the segment between two trusted positions, so a fast pass cannot skip the gate, and a
 * pass the wrong way or beside it does not count. A move that starts behind the line and ends on
 * or past it counts once: standing on the line counts for the next move, not this one.
 */
export declare function crossesZoneGate(from: Position, to: Position, zone: ZoneSpec): boolean;
/** Whether a point is inside an area zone (its box, plus the height tolerance). */
export declare function insideZoneArea(p: Position, zone: ZoneSpec): boolean;
/** Whether the segment from `from` to `to` touches an area zone's box (slab test in the zone's frame). */
export declare function segmentTouchesArea(from: Position, to: Position, zone: ZoneSpec): boolean;
/**
 * Zones: named areas and directional gates in the world, judged from the server's own positions
 * (never the client's). They raise `zone_entered`, `zone_exited` and `zone_crossed` for the rules
 * to use; the component knows nothing about what a zone means. Inert outside play.
 */
export declare class ZonesComponent {
    #private;
    constructor(ctx: GameContext);
    /** Judges every present player's move since the last tick against every zone. */
    tick(): void;
}
