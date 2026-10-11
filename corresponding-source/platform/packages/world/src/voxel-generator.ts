/**
 * Block ground generator, version 1 (P2-26, decision 98): rolling grass hills, a lake with sand
 * beaches in front of the spawn (+z, where the camera first looks), and stone mountains with snowy tops behind it, as in the owner's
 * Voxel picture (docs/reference/create-cards/01-style-voxel.webp). The seed changes the details.
 *
 * Only integer hashing, + - * /, Math.floor, and Math.sqrt are used (all exact in IEEE doubles),
 * so the browser, the server, and every JavaScript engine make the same blocks from the same seed.
 */

export const VOXEL_CHUNK = 32;
/** Lowest block layer (y) and one past the highest. */
export const VOXEL_MIN_Y = -16;
export const VOXEL_MAX_Y = 64;
export const VOXEL_LAYERS = VOXEL_MAX_Y - VOXEL_MIN_Y;
/** Top of the water: water blocks fill every column whose ground is lower, up to y = 0. */
export const VOXEL_WATER_LEVEL = 1;
/** Ground height at the place's border (the flat ground outside meets it). */
export const VOXEL_EDGE_HEIGHT = 3;

/** Block ids stored in chunks; new blocks are only ever added at the end. */
export const BLOCKS = [
  'air',
  'grass',
  'dirt',
  'sand',
  'stone',
  'snow',
  'gravel',
  'water',
  // Roads (P2-26 stage 2).
  'path',
  'paving',
  'brick',
  // Walls and floors (P2-26 stage 3).
  'planks',
  'cobble',
] as const;
export type BlockName = (typeof BLOCKS)[number];
export const Block: { readonly [K in BlockName]: number } = {
  air: 0,
  grass: 1,
  dirt: 2,
  sand: 3,
  stone: 4,
  snow: 5,
  gravel: 6,
  water: 7,
  path: 8,
  paving: 9,
  brick: 10,
  planks: 11,
  cobble: 12,
};

/** Blocks players stand on and that hide the faces behind them (water and air do not). */
export const isSolidBlock = (block: number) => block !== Block.air && block !== Block.water;

/** One chunk's columns: the ground height, the water top, and the blocks they are made of. */
export interface VoxelColumns {
  /** Surface height: the top face of the highest solid block (its layer is ground - 1). */
  ground: Int16Array;
  /** Water surface, or NO_WATER. */
  water: Int16Array;
  /** The top block and the block under it (a few layers deep, then stone). */
  top: Uint8Array;
  under: Uint8Array;
  /**
   * Walls (P2-26 stage 3): blocks from the ground up to `wallTop` (NO_WALL when none), with at
   * most one opening (door or window) from `holeLow` up to `holeHigh` (equal when none).
   */
  wallTop: Int16Array;
  wallBlock: Uint8Array;
  holeLow: Int16Array;
  holeHigh: Int16Array;
  /** 1 where the opening is a door (people stand in it). */
  door: Uint8Array;
}
export const NO_WALL = -32768;
export const NO_WATER = -32768;
/** Layers of `under` below the top block before stone. */
export const UNDER_DEPTH = 3;

const LAKE = { x: 0, z: 44, radius: 34 };

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

/** Four octaves of noise, normalized to [0, 1). */
function fbm(x: number, z: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let octave = 0; octave < 4; octave += 1) {
    sum += amp * noise(x * freq, z * freq, seed + octave * 101);
    amp *= 0.5;
    freq *= 2;
  }
  return sum / 0.9375;
}

/** The lake's shore distance: negative inside the water. */
function lakeShore(x: number, z: number, seed: number): number {
  const dx = x - LAKE.x;
  const dz = z - LAKE.z;
  const radius = LAKE.radius + (noise(x / 16, z / 16, seed + 6) - 0.5) * 14;
  return Math.sqrt(dx * dx + dz * dz) - radius;
}

/** Ground height before rounding to whole blocks. */
function rawHeight(x: number, z: number, seed: number, half: number): number {
  const land = 2 + 7 * fbm(x / 56, z / 56, seed) + 2 * noise(x / 14, z / 14, seed + 1);
  // Mountains: a range behind the lake (+z) and a few far peaks elsewhere.
  const range = smoothstep(112, 165, z) * (0.6 + 0.4 * noise(x / 110, z / 110, seed + 3));
  const spawnDistance = Math.sqrt(x * x + z * z);
  const patches =
    smoothstep(0.6, 0.78, noise(x / 170, z / 170, seed + 2)) * smoothstep(90, 140, spawnDistance);
  const mask = range > patches ? range : patches;
  const ridge = 1 - Math.abs(2 * noise(x / 46, z / 46, seed + 4) - 1);
  // Separate peaks with valleys between them (a flat base would read as one wall).
  const peaks = smoothstep(0.32, 0.82, fbm(x / 64, z / 64, seed + 5));
  let h = land + mask * (3 + 58 * peaks * (0.55 + 0.45 * ridge));
  // The lake with its beach, blending into the hills.
  const shore = lakeShore(x, z, seed);
  if (shore < 0) h = VOXEL_WATER_LEVEL - 1 - 5 * smoothstep(0, -14, shore);
  else h = lerp(VOXEL_WATER_LEVEL + 1, h, smoothstep(3, 18, shore));
  // Flat toward the border, where the outside ground begins.
  const edge = half - Math.max(Math.abs(x), Math.abs(z));
  return lerp(VOXEL_EDGE_HEIGHT, h, smoothstep(4, 28, edge));
}

function surfaceHeight(x: number, z: number, seed: number, half: number): number {
  const h = Math.floor(rawHeight(x + 0.5, z + 0.5, seed, half));
  return h < VOXEL_MIN_Y + 1 ? VOXEL_MIN_Y + 1 : h > VOXEL_MAX_Y - 2 ? VOXEL_MAX_Y - 2 : h;
}

/** Ground height of block column (x, z) as the generator makes it (before roads). */
export const generatedHeight = (seed: number, half: number, x: number, z: number) =>
  surfaceHeight(x, z, seed, half);

/** Columns of chunk (cx, cz); block (x, z) covers x..x+1, z..z+1 in meters. */
export function generateColumns(seed: number, half: number, cx: number, cz: number): VoxelColumns {
  const size = VOXEL_CHUNK;
  const pad = size + 2;
  const x0 = cx * size;
  const z0 = cz * size;
  // Heights with a one-block border for the steepness of the edge columns.
  const heights = new Int16Array(pad * pad);
  for (let pz = 0; pz < pad; pz += 1)
    for (let px = 0; px < pad; px += 1)
      heights[pz * pad + px] = surfaceHeight(x0 + px - 1, z0 + pz - 1, seed, half);
  const columns: VoxelColumns = {
    ground: new Int16Array(size * size),
    water: new Int16Array(size * size),
    top: new Uint8Array(size * size),
    under: new Uint8Array(size * size),
    wallTop: new Int16Array(size * size).fill(NO_WALL),
    wallBlock: new Uint8Array(size * size),
    holeLow: new Int16Array(size * size),
    holeHigh: new Int16Array(size * size),
    door: new Uint8Array(size * size),
  };
  for (let lz = 0; lz < size; lz += 1)
    for (let lx = 0; lx < size; lx += 1) {
      const x = x0 + lx;
      const z = z0 + lz;
      const p = (lz + 1) * pad + lx + 1;
      const h = heights[p]!;
      const i = lz * size + lx;
      columns.ground[i] = h;
      columns.water[i] = h < VOXEL_WATER_LEVEL ? VOXEL_WATER_LEVEL : NO_WATER;
      const steep = Math.max(
        Math.abs(h - heights[p - 1]!),
        Math.abs(h - heights[p + 1]!),
        Math.abs(h - heights[p - pad]!),
        Math.abs(h - heights[p + pad]!),
      );
      let top: number;
      let under: number;
      if (h < VOXEL_WATER_LEVEL) {
        top = noise(x / 9, z / 9, seed + 7) > 0.64 ? Block.gravel : Block.sand;
        under = top;
      } else if (h <= VOXEL_WATER_LEVEL + 1 && lakeShore(x + 0.5, z + 0.5, seed) < 7) {
        top = Block.sand;
        under = Block.sand;
      } else if (h >= 40 + 6 * noise(x / 30, z / 30, seed + 8)) {
        top = Block.snow;
        under = Block.stone;
      } else if (steep >= 3 || h >= 17 + 8 * noise(x / 24, z / 24, seed + 9)) {
        top = Block.stone;
        under = Block.stone;
      } else {
        top = Block.grass;
        under = Block.dirt;
      }
      columns.top[i] = top;
      columns.under[i] = under;
    }
  return columns;
}
