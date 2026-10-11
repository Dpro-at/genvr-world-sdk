import type { WorldSeed } from '@genvr/contracts';
import { CLEARING_RADIUS } from './world-generator.js';
import type { Cover, Soil, TerrainData } from './terrain-data.js';

/**
 * Everything that stands on the ground without being placed one by one (P2-40): the woods a
 * starter world comes with, and the plants and pebbles a creator paints. Grass (P2-38) already
 * works this way; this is the same idea written once, so a layer is described rather than coded.
 *
 * It is worked out from the world's seed, so every device and the server get the same trees from
 * the same place with nothing sent between them, and it is read per patch of ground so it streams
 * with the chunks instead of being built up front.
 *
 * A creator takes one away by clearing the ground under it: the cover byte on the chunk (P2-40) is
 * what a rule uses instead of a row it could delete.
 */

/** How the ground under a candidate is judged, supplied by whoever knows about that place. */
export interface ScatterGround {
  /** Height of the ground, which is also where the thing stands. */
  heightAt: (x: number, z: number) => number;
  /** The water surface here, or null where there is none: nothing grows under water. */
  waterAt?: (x: number, z: number) => number | null;
  /** True where a road, a floor or anything else built covers the ground. */
  builtAt?: (x: number, z: number) => boolean;
  /** What the creator painted here. */
  coverAt: (x: number, z: number) => Cover;
  /** The soil here, for layers that only stand on some of them. */
  soilAt: (x: number, z: number) => Soil;
}

/** One kind of thing that scatters. */
export interface ScatterLayer {
  id: string;
  /** Core Library items to choose between; each spot picks one from its own hash. */
  items: readonly string[];
  /** Things per 100 square meters. */
  density: number;
  /** Soils it may stand on. */
  soils: readonly Soil[];
  /** Steepest ground it accepts, in degrees. */
  maxSlope: number;
  /**
   * The painted cover this layer belongs to, or absent for the world's own woods. A painted layer
   * grows only where that cover was painted; the woods grow only where nothing was painted at all.
   */
  cover?: Cover;
  /** Smallest and largest size, so a wood is not made of identical trees. */
  scale?: readonly [number, number];
}

/** What the caller knows about a spot that the ground does not (P2-43). */
export interface ScatterOptions {
  /** True where something is built over the ground (a floor, a deck, a placed item). */
  blocked?(x: number, z: number): boolean;
}

/** One thing standing somewhere. */
export interface Scattered {
  x: number;
  z: number;
  y: number;
  itemId: string;
  /** Turn around the upright axis, in radians. */
  yaw: number;
  scale: number;
}

function hash(x: number, z: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x3c6ef372);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Slope in degrees, from the ground a step either side. */
function slopeDegrees(ground: ScatterGround, x: number, z: number, step = 1): number {
  const dx = ground.heightAt(x + step, z) - ground.heightAt(x - step, z);
  const dz = ground.heightAt(x, z + step) - ground.heightAt(x, z - step);
  return (Math.atan(Math.hypot(dx, dz) / (2 * step)) * 180) / Math.PI;
}

/**
 * Everything of one layer standing inside a box. Candidates come from a jittered grid keyed by the
 * seed, so the same ground always grows the same things and a patch can be worked out on its own.
 *
 * The rules are checked cheapest first, because most candidates fail: what the creator painted,
 * then the spawn clearing, then the soil, then water and anything built, and the slope last since
 * it reads the ground four more times.
 */
export function scatterIn(
  ground: ScatterGround,
  world: WorldSeed,
  layer: ScatterLayer,
  box: { minX: number; maxX: number; minZ: number; maxZ: number },
  options?: ScatterOptions,
): Scattered[] {
  if (layer.density <= 0 || layer.items.length === 0) return [];
  // One candidate per cell of this size, jittered inside it.
  const spacing = Math.sqrt(100 / layer.density);
  const seed = world.seed ^ hashText(layer.id);
  const out: Scattered[] = [];
  const from = (v: number) => Math.floor(v / spacing);
  for (let cz = from(box.minZ); cz <= from(box.maxZ); cz += 1) {
    for (let cx = from(box.minX); cx <= from(box.maxX); cx += 1) {
      const jitterX = hash(cx, cz, seed);
      const jitterZ = hash(cx, cz, seed + 1);
      const x = (cx + jitterX) * spacing;
      const z = (cz + jitterZ) * spacing;
      if (x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ) continue;

      // What the creator said about this ground comes first: it is one lookup and it is the whole
      // point of the cover layer.
      const cover = ground.coverAt(x, z);
      if (cover === 'cleared') continue;
      if (layer.cover ? cover !== layer.cover : cover !== 'default') continue;

      // Nobody arrives inside a tree.
      if (Math.hypot(x, z) < CLEARING_RADIUS) continue;

      if (!layer.soils.includes(ground.soilAt(x, z))) continue;

      const height = ground.heightAt(x, z);
      const water = ground.waterAt?.(x, z) ?? null;
      if (water !== null && water > height) continue;
      if (ground.builtAt?.(x, z)) continue;
      if (options?.blocked?.(x, z)) continue;

      if (slopeDegrees(ground, x, z) > layer.maxSlope) continue;

      const pick = hash(cx, cz, seed + 2);
      const [low, high] = layer.scale ?? [0.85, 1.25];
      out.push({
        x,
        z,
        y: height,
        itemId: layer.items[Math.floor(pick * layer.items.length)] ?? layer.items[0]!,
        yaw: hash(cx, cz, seed + 3) * Math.PI * 2,
        scale: low + hash(cx, cz, seed + 4) * (high - low),
      });
    }
  }
  return out;
}

/** A small stable number from a layer's name, so two layers never scatter alike. */
function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Everything of one layer in the patch of ground a chunk covers. */
export function scatterInChunk(
  ground: ScatterGround,
  world: WorldSeed,
  layer: ScatterLayer,
  terrain: Pick<TerrainData, 'chunkSize'>,
  cx: number,
  cz: number,
  options?: ScatterOptions,
): Scattered[] {
  const size = terrain.chunkSize;
  return scatterIn(
    ground,
    world,
    layer,
    { minX: cx * size, maxX: (cx + 1) * size, minZ: cz * size, maxZ: (cz + 1) * size },
    options,
  );
}

/**
 * The woods a kind of starter world comes with (P2-40).
 *
 * The densities are in things per 100 square meters. 0.6 is 60 trees a hectare, which is a real
 * mature broadleaf wood, and it holds 52 fps on a desktop at 25.9 million triangles. A phone will
 * not, and task 8 is where these start following the graphics setting; they are not lowered here,
 * because what they are for is how a wood looks.
 *
 * They were cut to a third for a while during task 4, on the strength of a frame rate of 1 that
 * turned out to be a dev server left running too long: a flat place with twelve items measured 0.7
 * on the same machine at the same moment. Restarting it gave 60. The cut was undone.
 */
export function woodsOf(kind: WorldSeed['kind']): ScatterLayer {
  const common = {
    id: 'woods',
    soils: ['grass', 'dirt'] as const,
    maxSlope: 28,
    scale: [0.8, 1.35] as const,
  };
  switch (kind) {
    case 'island':
      return { ...common, items: ['genvr.core.island-tree-02', 'genvr.core.round-bush'], density: 0.5 };
    case 'mountains':
      return {
        ...common,
        items: ['genvr.core.fir-tree-01', 'genvr.core.forest-pine-large'],
        density: 0.35,
        maxSlope: 34,
      };
    case 'plain':
      return { ...common, items: ['genvr.core.oak-tree', 'genvr.core.round-bush'], density: 0.15 };
    case 'valley':
    default:
      return {
        ...common,
        items: ['genvr.core.oak-tree', 'genvr.core.ash-tree', 'genvr.core.aspen-tree'],
        density: 0.6,
      };
  }
}

/** What the cover brush paints (P2-40, owner choice 4). */
export const COVER_LAYERS: Record<'plants' | 'pebbles', ScatterLayer> = {
  plants: {
    id: 'cover-plants',
    items: ['genvr.core.flower', 'genvr.core.nettle-plant', 'genvr.core.fern-02', 'genvr.core.shrub-03'],
    density: 4,
    soils: ['grass', 'dirt', 'mud'],
    maxSlope: 40,
    cover: 'plants',
    scale: [0.7, 1.2],
  },
  pebbles: {
    id: 'cover-pebbles',
    items: ['genvr.core.rock', 'genvr.core.rock-07'],
    density: 6,
    soils: ['grass', 'dirt', 'sand', 'rock'],
    maxSlope: 45,
    cover: 'pebbles',
    scale: [0.3, 0.8],
  },
};

/**
 * What stands at the spawn of a new starter world (P2-40 task 4, design 3.5).
 *
 * A place must never open onto an empty field, so a dozen real trees and rocks are placed as
 * ordinary items the creator owns and can move or delete, not as a rule. They stand inside the
 * flattened clearing, where the scatter's rules refuse to put anything, so a rule and a placed item
 * can never end up in the same spot.
 *
 * A wedge toward +z is left open, because that is the way the camera first looks and the kind's
 * water lies that way: arriving should show the place, not a trunk.
 */
export interface SpawnThing {
  itemId: string;
  position: [number, number, number];
  /** Turn about the upright axis, in radians. */
  yaw: number;
  scale: number;
}

/** How wide the open wedge toward +z is, in radians either side. */
const VIEW_WEDGE = Math.PI / 4;
/** Room kept between two things of the ring, and around the spot the player arrives on (m). */
const RING_GAP = 0.5;
const SPAWN_ROOM = 1.5;

/**
 * Where an item blocks, seen from above, at size 1 and not turned: the middle of the part a player
 * bumps into (a tree's trunk, which is often not at the model's origin) and a circle around it.
 */
export interface Footprint {
  x: number;
  z: number;
  radius: number;
}

export function spawnRing(
  ground: Pick<ScatterGround, 'heightAt'>,
  world: WorldSeed,
  /**
   * Places around the circle, not things placed: the open wedge is a quarter of it, so 16 leaves
   * the dozen the place actually gets.
   */
  count = 16,
  /**
   * The item's footprint (2026-09-29). With it, a spot that would put one thing inside another, or
   * on the player, is left empty, as the wedge is: the ring was laid out by angle alone, and with
   * trees at life size the owner's first look at a new world showed them inside each other.
   */
  footprint?: (itemId: string) => Footprint | null,
): SpawnThing[] {
  const woods = woodsOf(world.kind);
  const rocks = ['genvr.core.rock', 'genvr.core.rock-07'];
  const out: SpawnThing[] = [];
  const kept: Array<{ x: number; z: number; radius: number }> = [];
  const seed = world.seed ^ hashText('spawn-ring');
  for (let i = 0; i < count; i += 1) {
    // Spread around the circle, then jittered, so the ring never looks laid out by hand.
    const turn = ((i + 0.5) / count) * Math.PI * 2 + (hash(i, 0, seed) - 0.5) * (Math.PI / count);
    // The view stays open: an angle inside the wedge is simply skipped, leaving a gap rather than
    // being pushed aside, which would crowd the two items either side of it.
    const toward = Math.atan2(Math.sin(turn), Math.cos(turn));
    if (Math.abs(toward - Math.PI / 2) < VIEW_WEDGE) continue;
    const away = CLEARING_RADIUS * (0.62 + hash(i, 1, seed) * 0.3);
    const x = Math.cos(turn) * away;
    const z = Math.sin(turn) * away;
    // Every fourth thing is a rock, so the clearing is not a ring of identical trunks.
    const stone = hash(i, 2, seed) < 0.28;
    const list = stone ? rocks : woods.items;
    const itemId = list[Math.floor(hash(i, 3, seed) * list.length)] ?? list[0]!;
    const yaw = hash(i, 4, seed) * Math.PI * 2;
    const scale = stone ? 0.6 + hash(i, 5, seed) * 0.8 : 0.9 + hash(i, 5, seed) * 0.45;
    const foot = footprint?.(itemId);
    if (foot) {
      // Turned the way the item is (the collider's own convention), then sized.
      const body = {
        x: x + (foot.x * Math.cos(yaw) + foot.z * Math.sin(yaw)) * scale,
        z: z + (-foot.x * Math.sin(yaw) + foot.z * Math.cos(yaw)) * scale,
        radius: foot.radius * scale,
      };
      if (Math.hypot(body.x, body.z) < body.radius + SPAWN_ROOM) continue;
      if (kept.some((o) => Math.hypot(o.x - body.x, o.z - body.z) < o.radius + body.radius + RING_GAP))
        continue;
      kept.push(body);
    }
    out.push({ itemId, position: [x, ground.heightAt(x, z), z], yaw, scale });
  }
  return out;
}
