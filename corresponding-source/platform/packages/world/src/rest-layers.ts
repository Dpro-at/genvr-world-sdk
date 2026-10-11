import type { Road } from '@genvr/contracts';
import type { WorldState } from './apply.js';
import { bridgeDecks } from './bridges.js';
import { restWaterAt } from './rivers.js';
import { roomFloorLevel } from './walls.js';

/** A flat surface over the ground: a room floor or a bridge deck, as a polygon and a height. */
export interface RestLayer {
  points: Array<[number, number]>;
  level: number;
}

/**
 * What lies over the ground of a place as it stands now (P2-43 final review, I6): room floors,
 * bridge decks and water (lakes, the sea and rivers, the higher wins). The studio and the API
 * both build their rest law surface index from this one function, and build it again after the
 * ground under a room, a road or a river changed, so the two never disagree about fresh ground.
 */
export function restLayers(state: WorldState): {
  floors: RestLayer[];
  decks: RestLayer[];
  waterAt: (x: number, z: number) => number | null;
} {
  const { doc, terrain, voxels } = state;
  if (voxels)
    return {
      floors: voxels.roomFloors(doc.walls).map(({ points, level }) => ({ points: [...points], level })),
      decks: [],
      waterAt: (x, z) => voxels.waterSurface(x, z),
    };
  const heightAt = (x: number, z: number) => terrain.heightAt(x, z);
  return {
    floors: doc.walls.flatMap((wall) => {
      const level = roomFloorLevel(wall, heightAt);
      return level === null ? [] : [{ points: [...wall.points], level }];
    }),
    decks: bridgeDecks(doc.roads, terrain, doc.environment.water),
    waterAt: restWaterAt(doc, terrain),
  };
}

/**
 * True within half a metre of a road's edge (P2-43 final review): the woods keep off roads. The
 * studio's scatter and the server's check of it use this one test, so they grow the same trees.
 */
export function nearRoad(roads: readonly Pick<Road, 'points' | 'width'>[], x: number, z: number): boolean {
  return roads.some((road) =>
    road.points.some((point, i) => {
      const next = road.points[i + 1];
      if (!next) return false;
      const [ax, az] = point;
      const [bx, bz] = next;
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      return Math.hypot(x - (ax + dx * t), z - (az + dz * t)) < road.width / 2 + 0.5;
    }),
  );
}
