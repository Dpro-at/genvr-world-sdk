import { presentIds, type GameContext } from '../context.js';
import type { Position, ZoneSpec } from '../types.js';

/** How far above or below a zone a sample still counts, in metres. */
export const ZONE_HEIGHT = 8;

/** A point relative to a zone: `across` is along its width, `along` along its facing (sin yaw, cos yaw). */
function local(zone: ZoneSpec, p: Position): { across: number; along: number; dy: number } {
  const dx = p.x - zone.x;
  const dz = p.z - zone.z;
  return {
    across: dx * Math.cos(zone.yaw) - dz * Math.sin(zone.yaw),
    along: dx * Math.sin(zone.yaw) + dz * Math.cos(zone.yaw),
    dy: p.y - zone.y,
  };
}

/**
 * Whether a move from `from` to `to` passes through a gate zone in its direction of travel. The
 * move is the segment between two trusted positions, so a fast pass cannot skip the gate, and a
 * pass the wrong way or beside it does not count. A move that starts behind the line and ends on
 * or past it counts once: standing on the line counts for the next move, not this one.
 */
export function crossesZoneGate(from: Position, to: Position, zone: ZoneSpec): boolean {
  const a = local(zone, from);
  const b = local(zone, to);
  if (a.along >= 0 || b.along < 0) return false;
  const t = a.along / (a.along - b.along);
  if (Math.abs(a.dy + (b.dy - a.dy) * t) > ZONE_HEIGHT) return false;
  return Math.abs(a.across + (b.across - a.across) * t) <= zone.width / 2;
}

/** Whether a point is inside an area zone (its box, plus the height tolerance). */
export function insideZoneArea(p: Position, zone: ZoneSpec): boolean {
  const l = local(zone, p);
  return Math.abs(l.across) <= zone.width / 2 && Math.abs(l.along) <= zone.depth / 2 && Math.abs(l.dy) <= ZONE_HEIGHT;
}

/** Whether the segment from `from` to `to` touches an area zone's box (slab test in the zone's frame). */
export function segmentTouchesArea(from: Position, to: Position, zone: ZoneSpec): boolean {
  const a = local(zone, from);
  const b = local(zone, to);
  let t0 = 0;
  let t1 = 1;
  const slabs: Array<[number, number, number]> = [
    [a.across, b.across, zone.width / 2],
    [a.along, b.along, zone.depth / 2],
    [a.dy, b.dy, ZONE_HEIGHT],
  ];
  for (const [start, end, half] of slabs) {
    const delta = end - start;
    if (delta === 0) {
      if (Math.abs(start) > half) return false;
      continue;
    }
    let near = (-half - start) / delta;
    let far = (half - start) / delta;
    if (near > far) [near, far] = [far, near];
    t0 = Math.max(t0, near);
    t1 = Math.min(t1, far);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * Zones: named areas and directional gates in the world, judged from the server's own positions
 * (never the client's). They raise `zone_entered`, `zone_exited` and `zone_crossed` for the rules
 * to use; the component knows nothing about what a zone means. Inert outside play.
 */
export class ZonesComponent {
  readonly #ctx: GameContext;
  /** The last trusted position per player; absent right after a jump (no event is judged across it). */
  readonly #last = new Map<string, Position>();

  constructor(ctx: GameContext) {
    this.#ctx = ctx;
    const { bus } = ctx;
    bus.on('phase_changed', () => this.#last.clear());
    bus.on('player_joined', (event) => {
      if (event.returning) this.#last.delete(event.id);
    });
    bus.on('player_left', (event) => this.#last.delete(event.id));
    bus.on('placed', (event) => this.#last.delete(event.id));
    bus.on('respawned', (event) => this.#last.delete(event.id));
    // Any other move by the room (a seat, an exit spot, a correction) is a jump, never a pass.
    bus.on('relocated', (event) => this.#last.delete(event.id));
    bus.on('match_reset', () => this.#last.clear());
  }

  /** Judges every present player's move since the last tick against every zone. */
  tick(): void {
    const ctx = this.#ctx;
    if (ctx.phase !== 'playing' || ctx.zones.length === 0) return;
    for (const id of presentIds(ctx)) {
      const at = ctx.positions(id);
      if (!at) {
        this.#last.delete(id);
        continue;
      }
      const from = this.#last.get(id);
      this.#last.set(id, at);
      if (from) for (const zone of ctx.zones) this.#judge(id, zone, from, at);
    }
  }

  #judge(id: string, zone: ZoneSpec, from: Position, to: Position): void {
    const bus = this.#ctx.bus;
    const base = { id, zone: zone.id, tag: zone.tag };
    if (zone.shape === 'gate') {
      if (crossesZoneGate(from, to, zone)) bus.emit({ type: 'zone_crossed', ...base });
      return;
    }
    const wasIn = insideZoneArea(from, zone);
    const isIn = insideZoneArea(to, zone);
    // A pass right through a thin area starts and ends outside but touches it: both events fire.
    const touches = !wasIn && !isIn && segmentTouchesArea(from, to, zone);
    if (!wasIn && (isIn || touches)) bus.emit({ type: 'zone_entered', ...base });
    if (!isIn && (wasIn || touches)) bus.emit({ type: 'zone_exited', ...base });
  }
}
