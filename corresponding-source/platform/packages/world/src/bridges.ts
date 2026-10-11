import type { Road, WaterBody } from '@genvr/contracts';
import { roadProfile } from './roads.js';
import type { TerrainData } from './terrain-data.js';

/**
 * Bridge decks as flat pieces the rest law can stand things on (P2-43): one quad per step of a
 * road's profile where it is a bridge, at that step's deck height. Roads off water are graded
 * into the ground itself, so only decks need a surface of their own.
 */
export function bridgeDecks(
  roads: readonly Road[],
  terrain: Pick<TerrainData, 'heightAt'>,
  water: readonly WaterBody[],
): Array<{ points: Array<[number, number]>; level: number }> {
  const decks: Array<{ points: Array<[number, number]>; level: number }> = [];
  if (water.length === 0) return decks;
  for (const road of roads) {
    const half = road.width / 2;
    const samples = roadProfile(terrain, road.points, water);
    for (let i = 1; i < samples.length; i += 1) {
      const a = samples[i - 1]!;
      const b = samples[i]!;
      if (!a.bridge || !b.bridge) continue;
      const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const nx = (-(b.z - a.z) / length) * half;
      const nz = ((b.x - a.x) / length) * half;
      decks.push({
        points: [
          [a.x + nx, a.z + nz],
          [b.x + nx, b.z + nz],
          [b.x - nx, b.z - nz],
          [a.x - nx, a.z - nz],
        ],
        level: Math.max(a.height, b.height),
      });
    }
  }
  return decks;
}
