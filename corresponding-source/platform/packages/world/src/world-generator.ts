import type { WorldSeed } from '@genvr/contracts';

/**
 * The realistic starter world, version 1 (P2-40, decision 113, owner choice 1 of 2026-09-28).
 *
 * A Realistic place is worked out from a seed rather than stored, the way block places already are
 * (P2-26). The document keeps the seed and the kind of world, and this says how high the ground is
 * anywhere in it. A chunk the creator has sculpted is stored and always wins, so the first edit
 * near a spot bakes these heights into that chunk and the creator's version is the truth from then
 * on. A place with no seed is flat at 0, exactly as every place was before this.
 *
 * Only integer hashing, + - * /, Math.floor and Math.sqrt are used, all exact in IEEE doubles, so
 * the browser, the server and every JavaScript engine make the same ground from the same seed.
 */

/** Ground this far from the middle of the place, and beyond, is left flat for the outer ground. */
const EDGE_FADE = 0.86;
/**
 * Generator 2 fades to the outer ground over a much wider band: 1's band was 35 m in a small place,
 * and dropping a valley's 35 m sides to 0 over it made 57° cliffs at the corners.
 */
const EDGE_FADE_2 = 0.55;
/** How high generator 2's mountains rise above the pass, in meters. */
const MOUNTAIN_HEIGHT_2 = 50;
/** The spawn stands in a clearing this wide (m), flattened so arriving is never on a slope. */
export const CLEARING_RADIUS = 14;
/**
 * The island's sea (P2-40 task 7): the land's shore is below 0 all round and the edge of the place
 * fades back up to 0, so water at this height rings the land and stops short of the outer ground.
 */
export const ISLAND_SEA_LEVEL = -1;

function hash(x: number, z: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x3c6ef372);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const ease = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** 0 at `from`, 1 at `to` (either direction), eased. */
const smoothstep = (from: number, to: number, v: number) => ease(clamp01((v - from) / (to - from)));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Smooth value noise in [0, 1). */
function noise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = ease(x - ix);
  const fz = ease(z - iz);
  const a = hash(ix, iz, seed);
  const b = hash(ix + 1, iz, seed);
  const c = hash(ix, iz + 1, seed);
  const d = hash(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
}

/** Two octaves of noise: broad shape with a little detail on it. */
function hills(x: number, z: number, seed: number, scale: number): number {
  return (
    noise(x / scale, z / scale, seed) * 0.72 + noise(x / (scale * 0.35), z / (scale * 0.35), seed + 1) * 0.28
  );
}

/**
 * How high the ground is at a point, in meters, for a place of this size. `half` is half the side
 * of the playable area, so the world fits whatever size tier the place has.
 */
export function worldHeightAt(world: WorldSeed, x: number, z: number, half: number): number {
  // The clearing where the player arrives is flat, so nobody spawns on a slope (design 3.5). Its
  // level is the shape at the middle, which never changes for a world, so it is worked out once:
  // doing it on every call doubled the cost of the hottest function in the runtime.
  const level = clearingLevel(world, half);
  const fromSpawn = Math.sqrt(x * x + z * z);
  const flat = smoothstep(CLEARING_RADIUS, CLEARING_RADIUS * 2.2, fromSpawn);
  if (flat === 0) return level;
  return lerp(level, shapeOf(world, x, z, half), flat);
}

/** The height of the spawn clearing, remembered per world so it is worked out once. */
const levels = new WeakMap<WorldSeed, { half: number; level: number }>();
function clearingLevel(world: WorldSeed, half: number): number {
  const known = levels.get(world);
  if (known && known.half === half) return known.level;
  const level = shapeOf(world, 0, 0, half);
  levels.set(world, { half, level });
  return level;
}

/** The kind's own shape, before the clearing is flattened into it. */
function shapeOf(world: WorldSeed, x: number, z: number, half: number): number {
  const seed = world.seed;
  // Everything fades to the flat outer ground at the edge of the place.
  const fromMiddle = Math.max(Math.abs(x), Math.abs(z)) / half;
  const second = world.generator === 2;
  const inside = 1 - smoothstep(second ? EDGE_FADE_2 : EDGE_FADE, 1, fromMiddle);
  switch (world.kind) {
    case 'valley': {
      // Hills either side and a fall down the middle, so a river drawn along it runs downhill and
      // the lake sits at the far end (+z, where the camera first looks).
      const across = Math.abs(x) / half;
      const sides = smoothstep(0.08, 0.62, across) * 26;
      const fall = (-z / half) * 9;
      return (sides + fall + hills(x, z, seed, 90) * 7 - 3) * inside;
    }
    case 'island': {
      // Land in the middle, sea all round: the sea is a level, so the shape is what makes the coast.
      const fromCentre = Math.sqrt(x * x + z * z) / half;
      const land = 1 - smoothstep(0.12, 0.66, fromCentre);
      return (land * 30 - 7 + hills(x, z, seed, 70) * 9 * land) * inside;
    }
    case 'plain': {
      // Gentle and open, with a dip off to one side for a lake.
      const dip = 1 - smoothstep(0, 0.3, Math.sqrt((x + half * 0.42) ** 2 + (z - half * 0.2) ** 2) / half);
      return (hills(x, z, seed, 130) * 6 - dip * 9) * inside;
    }
    case 'mountains': {
      // High ground with a way through it, for a river to fall down.
      const ridge = hills(x, z, seed, 150);
      if (second) {
        // 1 rose 70 m inside a 40 m wide pass and reached 67°. The pass here is five times wider
        // and the peaks lower, so every slope stays walkable (the Realistic limit is 40°).
        const pass = smoothstep(0, 0.8, Math.abs(x) / half);
        return (ridge * MOUNTAIN_HEIGHT_2 * pass + hills(x, z, seed + 7, 60) * 5 - 10) * inside;
      }
      const pass = smoothstep(0, 0.16, Math.abs(x) / half);
      return (ridge * 70 * pass + hills(x, z, seed + 7, 45) * 12 - 10) * inside;
    }
  }
}
