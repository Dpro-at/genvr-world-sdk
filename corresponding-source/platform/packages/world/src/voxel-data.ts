/**
 * Block ground of Voxel places (P2-26, decision 98): a grid of 1 m blocks in chunks of 32 x 32
 * columns and VOXEL_LAYERS layers. Pure data with no three.js, so the same blocks exist in the
 * browser, on the server, and in tests.
 *
 * Columns (ground height, water, top block) come from the seeded generator and are cheap; the
 * full block array of a chunk is made only when something needs it (drawing and physics near the
 * player) and can be released again.
 */
import type { Road, VoxelGround, Wall } from '@genvr/contracts';
import {
  Block,
  BLOCKS,
  generateColumns,
  generatedHeight,
  isSolidBlock,
  NO_WALL,
  NO_WATER,
  UNDER_DEPTH,
  VOXEL_CHUNK,
  VOXEL_EDGE_HEIGHT,
  VOXEL_LAYERS,
  VOXEL_MIN_Y,
  type BlockName,
  type VoxelColumns,
} from './voxel-generator.js';

import { fromBase64, toBase64, type Soil } from './terrain-data.js';
import {
  onVoxelRoad,
  planVoxelRoad,
  stampVoxelRoads,
  voxelRoadChunks,
  type VoxelRoadPlan,
} from './voxel-roads.js';
import {
  onVoxelWall,
  planVoxelWall,
  stampVoxelWalls,
  voxelWallChunks,
  type VoxelWallPlan,
} from './voxel-walls.js';

export * from './voxel-generator.js';
export * from './voxel-roads.js';
export * from './voxel-walls.js';

/**
 * The soil each block counts as (placement rules and footstep sounds read soils).
 */
export const BLOCK_SOILS: Readonly<Record<BlockName, Soil>> = {
  air: 'grass',
  grass: 'grass',
  dirt: 'dirt',
  sand: 'sand',
  stone: 'rock',
  snow: 'snow',
  gravel: 'rock',
  water: 'mud',
  path: 'dirt',
  paving: 'rock',
  brick: 'rock',
  planks: 'dirt',
  cobble: 'rock',
};

const key = (cx: number, cz: number) => `${cx},${cz}`;

/** Marks stored block edits among a place's stored chunks. */
export const VOXEL_EDITS_KIND = 'voxel-edits';
/** Storage key of a chunk's block edits (height field chunks use "cx,cz"). */
export const voxelEditsKey = (cx: number, cz: number) => `v:${cx},${cz}`;
/** Stored player blocks of a chunk (decision 109), with the account of each block's author. */
export const PLAYER_BLOCKS_KIND = 'player-blocks';

/** A block a player placed or dug with the avatar's hands, and who did it. */
export interface PlayerCell {
  block: number;
  author: string;
}

/** A player block with its position. */
export interface PlayerBlockAt extends PlayerCell {
  x: number;
  y: number;
  z: number;
}

interface StoredPlayerBlocks {
  kind: string;
  v: number;
  cx: number;
  cz: number;
  a: string[];
  e: string;
}

function readStoredPlayerBlocks(text: string): StoredPlayerBlocks {
  const data = JSON.parse(text) as StoredPlayerBlocks;
  if (data.kind !== PLAYER_BLOCKS_KIND || data.v !== 1) throw new Error('Not stored player blocks.');
  return data;
}

/** How many blocks each author has in a stored chunk (see `VoxelData.encodePlayerBlocks`). */
export function storedPlayerAuthors(text: string): Map<string, number> {
  const data = readStoredPlayerBlocks(text);
  const bytes = fromBase64(data.e);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const counts = new Map<string, number>();
  for (let n = 0; n + 6 <= bytes.length; n += 6) {
    const author = data.a[view.getUint16(n + 4, true)] ?? '';
    counts.set(author, (counts.get(author) ?? 0) + 1);
  }
  return counts;
}

/**
 * A stored chunk without one author's blocks (the owner removes a player's building while no room
 * is open): the new text, or null when no block is left, and how many blocks remain.
 */
export function withoutPlayerAuthor(text: string, author: string): { data: string | null; blocks: number } {
  const data = readStoredPlayerBlocks(text);
  const place = data.a.indexOf(author);
  const bytes = fromBase64(data.e);
  if (place < 0) return { data: text, blocks: Math.floor(bytes.length / 6) };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept: number[] = [];
  for (let n = 0; n + 6 <= bytes.length; n += 6) if (view.getUint16(n + 4, true) !== place) kept.push(n);
  if (kept.length === 0) return { data: null, blocks: 0 };
  // Author places above the removed one move down by one, so the list keeps no gap.
  const names = data.a.filter((_, n) => n !== place);
  const out = new Uint8Array(kept.length * 6);
  const outView = new DataView(out.buffer);
  kept.forEach((n, m) => {
    outView.setUint32(m * 6, view.getUint32(n, true), true);
    const who = view.getUint16(n + 4, true);
    outView.setUint16(m * 6 + 4, who > place ? who - 1 : who, true);
  });
  return { data: JSON.stringify({ ...data, a: names, e: toBase64(out) }), blocks: kept.length };
}

/**
 * The block a column makes at layer y before any digging or stacking: stone, the block under the
 * top, the top, water, and walls with their openings.
 */
function columnBlock(columns: VoxelColumns, i: number, y: number): number {
  const ground = columns.ground[i]!;
  const wallTop = columns.wallTop[i]!;
  if (wallTop !== NO_WALL && y >= ground && y < wallTop) {
    if (y >= columns.holeLow[i]! && y < columns.holeHigh[i]!) return Block.air;
    return y === ground ? Block.cobble : columns.wallBlock[i]!;
  }
  const top = ground - 1;
  if (y < top - UNDER_DEPTH) return Block.stone;
  if (y < top) return columns.under[i]!;
  if (y === top) return columns.top[i]!;
  const water = columns.water[i]!;
  return water !== NO_WATER && y < water ? Block.water : Block.air;
}

/** What a column looks like after digging and stacking, read from its blocks. */
interface ScannedColumn {
  /** One above the highest solid block. */
  surface: number;
  /** One above the highest block of any kind (water too). */
  top: number;
  water: number | null;
  topBlock: number;
}

/** Index of block (lx, y, lz) in a chunk's block array: layer by layer from VOXEL_MIN_Y. */
export const voxelIndex = (lx: number, y: number, lz: number) =>
  ((y - VOXEL_MIN_Y) * VOXEL_CHUNK + lz) * VOXEL_CHUNK + lx;

export class VoxelData {
  readonly #columns = new Map<string, VoxelColumns>();
  readonly #blocks = new Map<string, Uint8Array>();
  /** Roads stamped into the blocks, by road id (P2-26 stage 2). */
  readonly #roads = new Map<string, { signature: string; plan: VoxelRoadPlan }>();
  /** Walls stamped into the blocks, by wall id (P2-26 stage 3). */
  readonly #walls = new Map<string, { signature: string; plan: VoxelWallPlan }>();
  /** Chunks whose blocks changed since the last `takeChanged`. */
  readonly #changed = new Set<string>();
  /** Digging and stacking: per chunk, block index to block (only where it differs). */
  readonly #edits = new Map<string, Map<number, number>>();
  /** Edited block columns ("x,z") and how many edited blocks each has. */
  readonly #editedColumns = new Map<string, number>();
  /**
   * Player blocks (decision 109): a layer over the owner's blocks, per chunk, block index to the
   * block and its author. Never part of the world document.
   */
  readonly #player = new Map<string, Map<number, PlayerCell>>();
  /** Columns ("x,z") with player blocks, and how many each has. */
  readonly #playerColumns = new Map<string, number>();
  /** Player blocks per author. */
  readonly #playerCounts = new Map<string, number>();
  #playerTotal = 0;
  /** Chunks whose player blocks changed since the last `takePlayerDirty`. */
  readonly #playerDirty = new Set<string>();
  /** Columns as the generator makes them, for chunks with roads or walls (see `natural`). */
  readonly #generated = new Map<string, VoxelColumns>();

  constructor(
    /** Half the side length of the playable area. */
    readonly half: number,
    readonly settings: VoxelGround,
  ) {}

  /** Inclusive chunk index range covering the playable area. */
  get chunkRange() {
    return {
      min: Math.floor(-this.half / VOXEL_CHUNK),
      max: Math.ceil(this.half / VOXEL_CHUNK) - 1,
    };
  }

  chunkAt(x: number, z: number) {
    return { cx: Math.floor(x / VOXEL_CHUNK), cz: Math.floor(z / VOXEL_CHUNK) };
  }

  /** Inside the playable area (a whole block column). */
  inside(bx: number, bz: number): boolean {
    return bx >= -this.half && bx + 1 <= this.half && bz >= -this.half && bz + 1 <= this.half;
  }

  columns(cx: number, cz: number): VoxelColumns {
    const k = key(cx, cz);
    let columns = this.#columns.get(k);
    if (!columns) {
      columns = generateColumns(this.settings.seed, this.half, cx, cz);
      const plans = [...this.#roads.values()]
        .map(({ plan }) => plan)
        .filter(({ bounds }) => this.#touches(bounds, cx, cz));
      if (plans.length) stampVoxelRoads(columns, cx, cz, plans);
      const walls = [...this.#walls.values()]
        .map(({ plan }) => plan)
        .filter(({ bounds }) => this.#touches(bounds, cx, cz));
      if (walls.length) stampVoxelWalls(columns, cx, cz, walls);
      this.#columns.set(k, columns);
    }
    return columns;
  }

  #touches(bounds: VoxelRoadPlan['bounds'], cx: number, cz: number): boolean {
    const x0 = cx * VOXEL_CHUNK;
    const z0 = cz * VOXEL_CHUNK;
    return (
      bounds.maxX >= x0 &&
      bounds.minX <= x0 + VOXEL_CHUNK &&
      bounds.maxZ >= z0 &&
      bounds.minZ <= z0 + VOXEL_CHUNK
    );
  }

  /**
   * Follows the world's roads: new, changed, and removed roads remake the blocks of the chunks
   * they cross (see `takeChanged`). Cheap when nothing changed.
   */
  setRoads(roads: readonly Road[]): void {
    const seen = new Set<string>();
    const touched: VoxelRoadPlan[] = [];
    for (const road of roads) {
      seen.add(road.id);
      const signature = JSON.stringify([road.points, road.width, road.materialId ?? null]);
      const existing = this.#roads.get(road.id);
      if (existing?.signature === signature) continue;
      if (existing) touched.push(existing.plan);
      const plan = planVoxelRoad(road, (x, z) =>
        generatedHeight(this.settings.seed, this.half, Math.floor(x), Math.floor(z)),
      );
      this.#roads.set(road.id, { signature, plan });
      touched.push(plan);
    }
    for (const [id, { plan }] of [...this.#roads])
      if (!seen.has(id)) {
        this.#roads.delete(id);
        touched.push(plan);
      }
    for (const plan of touched)
      for (const k of voxelRoadChunks(plan)) {
        this.#columns.delete(k);
        this.#blocks.delete(k);
        this.#changed.add(k);
      }
  }

  /**
   * Follows the world's walls like `setRoads`: a wall's base is the highest generated ground
   * under it, so walls and room floors do not depend on roads or on the order they were drawn.
   */
  setWalls(walls: readonly Wall[]): void {
    const seen = new Set<string>();
    const touched: VoxelWallPlan[] = [];
    for (const wall of walls) {
      seen.add(wall.id);
      const signature = JSON.stringify([wall.points, wall.height, wall.closed, wall.openings]);
      const existing = this.#walls.get(wall.id);
      if (existing?.signature === signature) continue;
      if (existing) touched.push(existing.plan);
      const plan = planVoxelWall(wall, (x, z) => generatedHeight(this.settings.seed, this.half, x, z));
      this.#walls.set(wall.id, { signature, plan });
      touched.push(plan);
    }
    for (const [id, { plan }] of [...this.#walls])
      if (!seen.has(id)) {
        this.#walls.delete(id);
        touched.push(plan);
      }
    for (const plan of touched)
      for (const k of voxelWallChunks(plan)) {
        this.#columns.delete(k);
        this.#blocks.delete(k);
        this.#changed.add(k);
      }
  }

  /** The wall whose blocks stand at (x, z), the newest first, or null. */
  wallAt(x: number, z: number): string | null {
    for (const [id, { plan }] of [...this.#walls].reverse()) if (onVoxelWall(plan, x, z)) return id;
    return null;
  }

  /** Room floors of closed walls: the outline and the level of the plank floor. */
  roomFloors(walls: readonly Wall[]): Array<{ points: Wall['points']; level: number }> {
    return walls.flatMap((wall) => {
      const plan = this.#walls.get(wall.id)?.plan;
      return wall.closed && plan ? [{ points: wall.points, level: plan.base }] : [];
    });
  }

  /** The road whose bed covers (x, z), the newest first, or null. */
  roadAt(x: number, z: number): string | null {
    for (const [id, { plan }] of [...this.#roads].reverse()) if (onVoxelRoad(plan, x, z)) return id;
    return null;
  }

  /** Chunk keys whose blocks changed since the last call (to redraw them and their colliders). */
  takeChanged(): string[] {
    const keys = [...this.#changed];
    this.#changed.clear();
    return keys;
  }

  #column(x: number, z: number): { columns: VoxelColumns; i: number } | null {
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    if (!this.inside(bx, bz)) return null;
    const { cx, cz } = this.chunkAt(bx, bz);
    const columns = this.columns(cx, cz);
    return { columns, i: (bz - cz * VOXEL_CHUNK) * VOXEL_CHUNK + (bx - cx * VOXEL_CHUNK) };
  }

  /** An edited column read from its blocks, or null for columns nobody dug or stacked on. */
  #scan(x: number, z: number): ScannedColumn | null {
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    if (!this.#editedColumns.has(`${bx},${bz}`) && !this.#playerColumns.has(`${bx},${bz}`)) return null;
    let top = VOXEL_MIN_Y;
    let surface = VOXEL_MIN_Y;
    let topBlock: number = Block.stone;
    let water: number | null = null;
    for (let y = VOXEL_MIN_Y + VOXEL_LAYERS - 1; y >= VOXEL_MIN_Y; y -= 1) {
      const block = this.block(bx, y, bz);
      if (block === Block.air) continue;
      if (top === VOXEL_MIN_Y) top = y + 1;
      if (block === Block.water) {
        water ??= y + 1;
        continue;
      }
      surface = y + 1;
      topBlock = block;
      break;
    }
    // Water under a block someone put on top is not open water.
    if (water !== null && top > water) water = null;
    return { surface, top, water, topBlock };
  }

  /**
   * Where things stand at (x, z): the ground's top face, the top of a wall, or the sill of a door
   * in a wall; outside the place, the border height.
   */
  surfaceHeight(x: number, z: number): number {
    const scanned = this.#scan(x, z);
    if (scanned) return scanned.surface;
    const column = this.#column(x, z);
    if (!column) return VOXEL_EDGE_HEIGHT;
    const { columns, i } = column;
    const ground = columns.ground[i]!;
    const wallTop = columns.wallTop[i]!;
    if (wallTop === NO_WALL) return ground;
    // People stand in a door (on its sill); on other wall columns they stand on the top.
    return columns.door[i] ? columns.holeLow[i]! : wallTop;
  }

  /**
   * Where a player stands at (x, z) near the height `near` (exit spots, movement modes): of the
   * places to stand in the column (a block or open water with two free blocks above) at most
   * `climb` above `near`, the one closest to it, higher on a tie; so the floor under a roof or an
   * overhang, not its top. The column's surface when there is none (a wall higher than the climb).
   */
  standHeight(x: number, z: number, near: number, climb: number): number {
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    if (!this.inside(bx, bz)) return this.surfaceHeight(x, z);
    const high = Math.min(VOXEL_MIN_Y + VOXEL_LAYERS, Math.floor(near + climb));
    let best: number | null = null;
    for (let y = high - 1; y >= VOXEL_MIN_Y; y -= 1) {
      const block = this.block(bx, y, bz);
      if (block === Block.air) continue;
      if (this.block(bx, y + 1, bz) !== Block.air || this.block(bx, y + 2, bz) !== Block.air) continue;
      const level = y + 1;
      if (best === null || Math.abs(level - near) < Math.abs(best - near)) best = level;
      // Every level further down is further from `near`.
      if (level <= near) break;
    }
    return best ?? this.surfaceHeight(x, z);
  }

  /** The ground under walls (room floors and wall footings read it), or the border height. */
  floorHeight(x: number, z: number): number {
    const scanned = this.#scan(x, z);
    if (scanned) return scanned.surface;
    const column = this.#column(x, z);
    return column ? column.columns.ground[column.i]! : VOXEL_EDGE_HEIGHT;
  }

  /** One above the highest block of column (x, z): ground, water, or wall. */
  columnTop(x: number, z: number): number {
    const scanned = this.#scan(x, z);
    if (scanned) return scanned.top;
    const column = this.#column(x, z);
    if (!column) return VOXEL_EDGE_HEIGHT;
    const { columns, i } = column;
    const water = columns.water[i]!;
    return Math.max(columns.ground[i]!, water === NO_WATER ? -Infinity : water, columns.wallTop[i]!);
  }

  /** Top of the water at (x, z), or null on dry ground. */
  waterSurface(x: number, z: number): number | null {
    const scanned = this.#scan(x, z);
    if (scanned) return scanned.water;
    const column = this.#column(x, z);
    if (!column) return null;
    const water = column.columns.water[column.i]!;
    return water === NO_WATER ? null : water;
  }

  /** The block players see from above at (x, z). */
  topBlock(x: number, z: number): BlockName {
    const scanned = this.#scan(x, z);
    if (scanned) return BLOCKS[scanned.topBlock] ?? 'stone';
    const column = this.#column(x, z);
    return BLOCKS[column ? column.columns.top[column.i]! : Block.grass]!;
  }

  /** Every block of a chunk (see `voxelIndex`), made on first use. */
  blocks(cx: number, cz: number): Uint8Array {
    const k = key(cx, cz);
    let blocks = this.#blocks.get(k);
    if (blocks) return blocks;
    blocks = new Uint8Array(VOXEL_CHUNK * VOXEL_CHUNK * VOXEL_LAYERS);
    const columns = this.columns(cx, cz);
    for (let lz = 0; lz < VOXEL_CHUNK; lz += 1)
      for (let lx = 0; lx < VOXEL_CHUNK; lx += 1) {
        if (!this.inside(cx * VOXEL_CHUNK + lx, cz * VOXEL_CHUNK + lz)) continue;
        const i = lz * VOXEL_CHUNK + lx;
        const high = Math.min(
          VOXEL_MIN_Y + VOXEL_LAYERS,
          Math.max(columns.ground[i]!, columns.water[i]!, columns.wallTop[i]!),
        );
        for (let y = VOXEL_MIN_Y; y < high; y += 1)
          blocks[voxelIndex(lx, y, lz)] = columnBlock(columns, i, y);
      }
    // Digging and stacking go on top of what the ground, roads, and walls make; player blocks
    // on top of that.
    for (const [index, block] of this.#edits.get(k) ?? []) blocks[index] = block;
    for (const [index, cell] of this.#player.get(k) ?? []) blocks[index] = cell.block;
    this.#blocks.set(k, blocks);
    return blocks;
  }

  /** The block at (x, y, z) before anyone dug or stacked there. */
  baseBlock(x: number, y: number, z: number): number {
    if (y < VOXEL_MIN_Y) return Block.stone;
    if (y >= VOXEL_MIN_Y + VOXEL_LAYERS || !this.inside(x, z)) return Block.air;
    const { cx, cz } = this.chunkAt(x, z);
    return columnBlock(
      this.columns(cx, cz),
      (z - cz * VOXEL_CHUNK) * VOXEL_CHUNK + (x - cx * VOXEL_CHUNK),
      y,
    );
  }

  /**
   * Digging and stacking (P2-26): sets blocks at whole-meter positions (inside the place and the
   * layers) and returns the blocks that were there, in the same order (the undo). Only blocks
   * that differ from the generated ground are kept.
   */
  setBlocks(
    list: ReadonlyArray<readonly [number, number, number, number]>,
  ): Array<[number, number, number, number]> {
    const before = list.map(([x, y, z]): [number, number, number, number] => [
      x,
      y,
      z,
      this.ownerBlock(x, y, z),
    ]);
    for (const [x, y, z, block] of list) {
      // The owner's building wins over a player block in the same place.
      this.#setPlayerCell(x, y, z, null);
      const { cx, cz } = this.chunkAt(x, z);
      const k = key(cx, cz);
      const index = voxelIndex(x - cx * VOXEL_CHUNK, y, z - cz * VOXEL_CHUNK);
      let edits = this.#edits.get(k);
      const had = edits?.has(index) ?? false;
      const column = `${x},${z}`;
      if (block === this.baseBlock(x, y, z)) {
        if (had) {
          edits!.delete(index);
          if (edits!.size === 0) this.#edits.delete(k);
          const count = (this.#editedColumns.get(column) ?? 1) - 1;
          if (count > 0) this.#editedColumns.set(column, count);
          else this.#editedColumns.delete(column);
        }
      } else {
        if (!edits) {
          edits = new Map();
          this.#edits.set(k, edits);
        }
        edits.set(index, block);
        if (!had) this.#editedColumns.set(column, (this.#editedColumns.get(column) ?? 0) + 1);
      }
      const blocks = this.#blocks.get(k);
      if (blocks) blocks[index] = block;
      this.#changed.add(k);
    }
    return before;
  }

  /**
   * Lowest edited layer in chunk (cx, cz), by the owner or players, or null: tunnels reach below
   * the ground's top.
   */
  editedLow(cx: number, cz: number): number | null {
    const k = key(cx, cz);
    let low = Infinity;
    for (const index of [...(this.#edits.get(k)?.keys() ?? []), ...(this.#player.get(k)?.keys() ?? [])])
      low = Math.min(low, Math.floor(index / (VOXEL_CHUNK * VOXEL_CHUNK)) + VOXEL_MIN_Y);
    return low === Infinity ? null : low;
  }

  /** Chunks with digging or stacking in them ("cx,cz"). */
  editedChunks(): string[] {
    return [...this.#edits.keys()];
  }

  /** A chunk's digging and stacking for storage, or null when it has none. */
  encodeEdits(cx: number, cz: number): string | null {
    const edits = this.#edits.get(key(cx, cz));
    if (!edits?.size) return null;
    // Each edit as 4 bytes, little-endian: block index in the upper 24 bits, block in the lower 8.
    const bytes = new Uint8Array(edits.size * 4);
    const view = new DataView(bytes.buffer);
    [...edits]
      .sort((a, b) => a[0] - b[0])
      .forEach(([index, block], n) => view.setUint32(n * 4, ((index << 8) | block) >>> 0, true));
    return JSON.stringify({ kind: VOXEL_EDITS_KIND, v: 1, cx, cz, e: toBase64(bytes) });
  }

  /** Loads stored digging and stacking (see `encodeEdits`). */
  loadEdits(text: string): void {
    const data = JSON.parse(text) as { kind: string; v: number; cx: number; cz: number; e: string };
    if (data.kind !== VOXEL_EDITS_KIND || data.v !== 1) throw new Error('Not stored block edits.');
    const bytes = fromBase64(data.e);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const list: Array<[number, number, number, number]> = [];
    for (let n = 0; n + 4 <= bytes.length; n += 4) {
      const value = view.getUint32(n, true);
      const index = value >>> 8;
      const lx = index % VOXEL_CHUNK;
      const lz = Math.floor(index / VOXEL_CHUNK) % VOXEL_CHUNK;
      const y = Math.floor(index / (VOXEL_CHUNK * VOXEL_CHUNK)) + VOXEL_MIN_Y;
      list.push([data.cx * VOXEL_CHUNK + lx, y, data.cz * VOXEL_CHUNK + lz, value & 0xff]);
    }
    this.setBlocks(list);
  }

  /** The block at whole-meter position (x, y, z): air above the layers and outside the place. */
  block(x: number, y: number, z: number): number {
    if (y < VOXEL_MIN_Y) return Block.stone;
    if (y >= VOXEL_MIN_Y + VOXEL_LAYERS || !this.inside(x, z)) return Block.air;
    const { cx, cz } = this.chunkAt(x, z);
    return this.blocks(cx, cz)[voxelIndex(x - cx * VOXEL_CHUNK, y, z - cz * VOXEL_CHUNK)]!;
  }

  /** The block at (x, y, z) as the owner made it: generated ground, roads, walls, their edits. */
  ownerBlock(x: number, y: number, z: number): number {
    if (y < VOXEL_MIN_Y) return Block.stone;
    if (y >= VOXEL_MIN_Y + VOXEL_LAYERS || !this.inside(x, z)) return Block.air;
    const { cx, cz } = this.chunkAt(x, z);
    const edit = this.#edits.get(key(cx, cz))?.get(voxelIndex(x - cx * VOXEL_CHUNK, y, z - cz * VOXEL_CHUNK));
    return edit ?? this.baseBlock(x, y, z);
  }

  /**
   * Whether (x, y, z) holds what the generator made there: no road, wall, or owner's edit
   * (players may dig natural ground, never the owner's building).
   */
  natural(x: number, y: number, z: number): boolean {
    if (!this.inside(x, z) || y < VOXEL_MIN_Y || y >= VOXEL_MIN_Y + VOXEL_LAYERS) return false;
    const { cx, cz } = this.chunkAt(x, z);
    const k = key(cx, cz);
    const lx = x - cx * VOXEL_CHUNK;
    const lz = z - cz * VOXEL_CHUNK;
    if (this.#edits.get(k)?.has(voxelIndex(lx, y, lz))) return false;
    const stamped = [...this.#roads.values(), ...this.#walls.values()].some(({ plan }) =>
      this.#touches(plan.bounds, cx, cz),
    );
    if (!stamped) return true;
    let generated = this.#generated.get(k);
    if (!generated) {
      generated = generateColumns(this.settings.seed, this.half, cx, cz);
      this.#generated.set(k, generated);
    }
    const i = lz * VOXEL_CHUNK + lx;
    return columnBlock(generated, i, y) === columnBlock(this.columns(cx, cz), i, y);
  }

  /** The player block at (x, y, z), or null where the owner's block shows. */
  playerCell(x: number, y: number, z: number): PlayerCell | null {
    if (!this.inside(x, z)) return null;
    const { cx, cz } = this.chunkAt(x, z);
    return (
      this.#player.get(key(cx, cz))?.get(voxelIndex(x - cx * VOXEL_CHUNK, y, z - cz * VOXEL_CHUNK)) ?? null
    );
  }

  /**
   * A player places or digs blocks (decision 109; the caller checks the rules): each position
   * shows the block, remembered as the author's; a block equal to the owner's removes the player
   * block there.
   */
  setPlayerBlocks(list: ReadonlyArray<readonly [number, number, number, number]>, author: string): void {
    for (const [x, y, z, block] of list)
      this.#setPlayerCell(x, y, z, block === this.ownerBlock(x, y, z) ? null : { block, author });
  }

  #setPlayerCell(x: number, y: number, z: number, cell: PlayerCell | null): void {
    if (!this.inside(x, z) || y < VOXEL_MIN_Y || y >= VOXEL_MIN_Y + VOXEL_LAYERS) return;
    const { cx, cz } = this.chunkAt(x, z);
    const k = key(cx, cz);
    const index = voxelIndex(x - cx * VOXEL_CHUNK, y, z - cz * VOXEL_CHUNK);
    let cells = this.#player.get(k);
    const had = cells?.get(index);
    if (!had && !cell) return;
    const column = `${x},${z}`;
    const count = (map: Map<string, number>, name: string, by: number) => {
      const next = (map.get(name) ?? 0) + by;
      if (next > 0) map.set(name, next);
      else map.delete(name);
    };
    if (had) {
      count(this.#playerCounts, had.author, -1);
      count(this.#playerColumns, column, -1);
      this.#playerTotal -= 1;
    }
    if (cell) {
      if (!cells) {
        cells = new Map();
        this.#player.set(k, cells);
      }
      cells.set(index, { ...cell });
      count(this.#playerCounts, cell.author, 1);
      count(this.#playerColumns, column, 1);
      this.#playerTotal += 1;
    } else {
      cells!.delete(index);
      if (cells!.size === 0) this.#player.delete(k);
    }
    const blocks = this.#blocks.get(k);
    if (blocks) blocks[index] = cell ? cell.block : this.ownerBlock(x, y, z);
    this.#changed.add(k);
    this.#playerDirty.add(k);
  }

  /** Player blocks of one author, or of everyone. */
  playerBlockCount(author?: string): number {
    return author === undefined ? this.#playerTotal : (this.#playerCounts.get(author) ?? 0);
  }

  /** Every player block of the chunks in `keys` (all chunks without), with its position. */
  #playerCells(keys: Iterable<string> = this.#player.keys()): PlayerBlockAt[] {
    const found: PlayerBlockAt[] = [];
    for (const k of keys) {
      const cells = this.#player.get(k);
      if (!cells) continue;
      const [cx, cz] = k.split(',').map(Number) as [number, number];
      for (const [index, cell] of cells) {
        const lx = index % VOXEL_CHUNK;
        const lz = Math.floor(index / VOXEL_CHUNK) % VOXEL_CHUNK;
        const y = Math.floor(index / (VOXEL_CHUNK * VOXEL_CHUNK)) + VOXEL_MIN_Y;
        found.push({ x: cx * VOXEL_CHUNK + lx, y, z: cz * VOXEL_CHUNK + lz, ...cell });
      }
    }
    return found;
  }

  /** Takes every player block away (a client loading the room's blocks again). */
  clearPlayerBlocks(): void {
    for (const cell of this.#playerCells()) this.#setPlayerCell(cell.x, cell.y, cell.z, null);
  }

  /** Who built with their hands here and how many blocks each has, most first. */
  playerAuthors(): Array<{ author: string; blocks: number }> {
    return [...this.#playerCounts]
      .map(([author, blocks]) => ({ author, blocks }))
      .sort((a, b) => b.blocks - a.blocks || a.author.localeCompare(b.author));
  }

  /**
   * The owner removes one player's building in one step (decision 109): every block of the
   * author goes back to the owner's block. Returns how many were removed.
   */
  removePlayerBlocksBy(author: string): number {
    let removed = 0;
    for (const cell of this.#playerCells())
      if (cell.author === author) {
        this.#setPlayerCell(cell.x, cell.y, cell.z, null);
        removed += 1;
      }
    return removed;
  }

  /** Player blocks within `radius` meters of (x, y, z), block centers measured (a report of a build). */
  playerBlocksNear(x: number, y: number, z: number, radius: number): PlayerBlockAt[] {
    const keys: string[] = [];
    for (
      let cx = Math.floor((x - radius) / VOXEL_CHUNK);
      cx <= Math.floor((x + radius) / VOXEL_CHUNK);
      cx += 1
    )
      for (
        let cz = Math.floor((z - radius) / VOXEL_CHUNK);
        cz <= Math.floor((z + radius) / VOXEL_CHUNK);
        cz += 1
      )
        keys.push(key(cx, cz));
    return this.#playerCells(keys).filter(
      (cell) => Math.hypot(cell.x + 0.5 - x, cell.y + 0.5 - y, cell.z + 0.5 - z) <= radius,
    );
  }

  /** Player blocks in chunk (cx, cz). */
  playerBlockCountIn(cx: number, cz: number): number {
    return this.#player.get(key(cx, cz))?.size ?? 0;
  }

  /** Chunks ("cx,cz") with player blocks in them. */
  playerChunks(): string[] {
    return [...this.#player.keys()];
  }

  /** Chunks ("cx,cz") whose player blocks changed since the last call (to save them). */
  takePlayerDirty(): string[] {
    const keys = [...this.#playerDirty];
    this.#playerDirty.clear();
    return keys;
  }

  /**
   * A chunk's player blocks for storage, or null when it has none. Without `authors` (for
   * clients) every block's author is left out.
   */
  encodePlayerBlocks(cx: number, cz: number, authors = true): string | null {
    const cells = this.#player.get(key(cx, cz));
    if (!cells?.size) return null;
    const names = authors ? [...new Set([...cells.values()].map((cell) => cell.author))] : [];
    const place = new Map(names.map((name, n) => [name, n]));
    // Each block as 6 bytes, little-endian: block index and block as in `encodeEdits`, then the
    // author's place in the list.
    const bytes = new Uint8Array(cells.size * 6);
    const view = new DataView(bytes.buffer);
    [...cells]
      .sort((a, b) => a[0] - b[0])
      .forEach(([index, cell], n) => {
        view.setUint32(n * 6, ((index << 8) | cell.block) >>> 0, true);
        view.setUint16(n * 6 + 4, place.get(cell.author) ?? 0, true);
      });
    return JSON.stringify({ kind: PLAYER_BLOCKS_KIND, v: 1, cx, cz, a: names, e: toBase64(bytes) });
  }

  /**
   * Loads stored player blocks (see `encodePlayerBlocks`); without authors they are ''. With
   * `keep`, they only fill free cells: blocks already there stay, and the chunk stays changed so
   * the merged result is saved (a room that starts keeping player blocks, decision 109).
   */
  loadPlayerBlocks(text: string, options: { keep?: boolean } = {}): void {
    const data = readStoredPlayerBlocks(text);
    const bytes = fromBase64(data.e);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let n = 0; n + 6 <= bytes.length; n += 6) {
      const value = view.getUint32(n, true);
      const index = value >>> 8;
      const lx = index % VOXEL_CHUNK;
      const lz = Math.floor(index / VOXEL_CHUNK) % VOXEL_CHUNK;
      const y = Math.floor(index / (VOXEL_CHUNK * VOXEL_CHUNK)) + VOXEL_MIN_Y;
      const x = data.cx * VOXEL_CHUNK + lx;
      const z = data.cz * VOXEL_CHUNK + lz;
      if (options.keep && this.playerCell(x, y, z)) continue;
      this.#setPlayerCell(x, y, z, {
        block: value & 0xff,
        author: data.a[view.getUint16(n + 4, true)] ?? '',
      });
    }
    if (!options.keep) this.#playerDirty.delete(key(data.cx, data.cz));
  }

  /** Drops a chunk's block array (it is made again on the next use). */
  release(cx: number, cz: number): void {
    this.#blocks.delete(key(cx, cz));
  }

  /** The soil of the top block at (x, z). */
  soilAt(x: number, z: number): Soil {
    return BLOCK_SOILS[this.topBlock(x, z)];
  }

  /** Whether the block at (x, y, z) is ground to stand on. */
  solidAt(x: number, y: number, z: number): boolean {
    return isSolidBlock(this.block(x, y, z));
  }
}
