import type { SpawnSpot, TeamName } from './types.js';

/** The spot farthest from the nearest opponent; a team's own spots first, else the shared ones. */
export function pickSpawn(
  spots: SpawnSpot[], team: TeamName | null, opponents: Array<{ x: number; z: number }>,
): SpawnSpot | null {
  const own = team ? spots.filter((s) => s.team === team) : [];
  const pool = own.length > 0 ? own : spots.filter((s) => s.team === 'any');
  const candidates = pool.length > 0 ? pool : spots;
  let best: SpawnSpot | null = null;
  let bestDistance = -1;
  for (const spot of candidates) {
    const nearest = opponents.length === 0
      ? Number.POSITIVE_INFINITY
      : Math.min(...opponents.map((o) => Math.hypot(o.x - spot.x, o.z - spot.z)));
    if (nearest > bestDistance) { best = spot; bestDistance = nearest; }
  }
  return best;
}
