import {
  CommandPayload,
  GROUND_SLOTS,
  type GroundMaterialRef,
  MAX_TERRAIN_SLOPE,
  PAINT_RULE_MAX_BOX,
  RIVER_LIMITS,
  type River,
  SIZE_TIERS,
  type ItemInstance,
  type PlaceScriptBody,
  SCRIPT_LIMITS,
  scriptChars,
  type Wall,
  type WorldDocument,
} from '@genvr/contracts';
import { planRoadGrading, roadShapeError } from './roads.js';
import { planRiverCarving, riverProfile, riverShapeError } from './rivers.js';
import {
  chunkKey,
  COVERS,
  decodeChunk,
  encodeChunk,
  insidePolygon,
  MAX_HEIGHT,
  MIN_HEIGHT,
  SOILS,
  TerrainData,
  type ChunkData,
  type HeightUpdate,
  type Soil,
} from './terrain-data.js';
// Only called while applying a command, never while modules load, so the two may import each other.
import { starterGround } from './starter.js';
import { diffTerrain, revertTerrain, snapshotTerrain } from './terrain-edits.js';
import { decodeHeightTile } from './height-tiles.js';
import type { TerrainFieldStore } from './terrain-fields.js';
import {
  initializeTerrainFieldSets,
  loadTerrainFieldTile,
  isFieldCommand,
  applyFieldCommand,
  TerrainFieldStateError,
  encodeTerrainFieldRow,
  loadedTerrainFieldKeys,
} from './terrain-fields-state.js';
import {
  Block,
  BLOCKS,
  VOXEL_EDITS_KIND,
  VOXEL_LAYERS,
  VOXEL_MIN_Y,
  VOXEL_WATER_LEVEL,
  VoxelData,
  voxelEditsKey,
} from './voxel-data.js';
import { BUILDING_WALL_MATERIAL, openingError, planRoomGrading, sortOpenings, wallShapeError } from './walls.js';

/** A world being edited: the document plus its terrain heightfield (or block ground, P2-26). */
export interface WorldState {
  doc: WorldDocument;
  terrain: TerrainData;
  /** The block ground of Voxel places made with one (`doc.voxels`). */
  voxels?: VoxelData;
}

/** Soil of each palette slot from a document's ground materials (P2-37). */
function slotSoils(doc: WorldDocument): Soil[] {
  const soils: Soil[] = [...SOILS];
  for (const [slot, material] of Object.entries(doc.terrain.materials ?? {}))
    if (Number(slot) >= SOILS.length) soils[Number(slot)] = material.soil;
  return soils;
}

/**
 * The palette slot for a ground material (P2-37): the slot that already holds it, else the first
 * extra slot (6-15) that is unassigned or painted nowhere, else null (all 16 in use). The choice
 * depends only on the world, so every copy of the place picks the same slot.
 */
export function paletteSlot(state: WorldState, material: GroundMaterialRef): number | null {
  const materials = state.doc.terrain.materials ?? {};
  for (const [slot, held] of Object.entries(materials)) if (held.id === material.id) return Number(slot);
  const used = state.terrain.usedSlots();
  for (let slot = SOILS.length; slot < GROUND_SLOTS; slot += 1)
    if (!materials[String(slot)] || !used.has(slot)) return slot;
  return null;
}

/** Sets (or clears) what a palette slot shows and keeps the terrain's slot soils in step. */
function setGroundMaterial(state: WorldState, slot: number, material: GroundMaterialRef | null): void {
  const materials = { ...(state.doc.terrain.materials ?? {}) };
  if (material) materials[String(slot)] = material;
  else delete materials[String(slot)];
  if (Object.keys(materials).length) state.doc.terrain.materials = materials;
  else delete state.doc.terrain.materials;
  state.terrain.setSlotSoils(slotSoils(state.doc));
}

export function createWorldState(
  doc: WorldDocument,
  encodedChunks: Iterable<string> = [],
  options: { fieldStores?: ReadonlyMap<string, TerrainFieldStore> } = {},
): WorldState {
  const half = SIZE_TIERS[doc.sizeTier].sideMeters / 2;
  const terrain = new TerrainData(half, doc.terrain.chunkSizeMeters);
  // A place made from a starter world (P2-40) works its ground out from the seed wherever no
  // chunk is stored; a place without one is flat at 0, exactly as every place was before.
  terrain.world = doc.terrain.world ?? null;
  // Stored chunks: height field chunks, and the digging and stacking of block ground (P2-26).
  const edits: string[] = [];
  initializeTerrainFieldSets({ doc, terrain });
  for (const [id, store] of options.fieldStores ?? []) {
    const metadata = doc.terrain.fieldSets?.[id];
    if (
      !metadata ||
      !store.complete ||
      metadata.tiles.length !== store.tileCount ||
      JSON.stringify(metadata.descriptor) !== JSON.stringify(store.descriptor)
    )
      throw new CommandError('invalid', 'Provided field store does not match complete persisted metadata');
    terrain.fieldSets.set(id, store);
  }
  for (const encoded of encodedChunks) {
    const payload = JSON.parse(encoded) as { kind?: unknown };
    if (payload?.kind === 'terrain-fields-v1') {
      loadTerrainFieldTile({ doc, terrain }, payload);
      continue;
    }
    if (encoded.includes(`"kind":"${VOXEL_EDITS_KIND}"`)) {
      edits.push(encoded);
      continue;
    }
    const chunk = decodeChunk(encoded);
    terrain.chunks.set(chunkKey(chunk.cx, chunk.cz), chunk);
  }
  terrain.setSlotSoils(slotSoils(doc));
  if (doc.terrain.activeSurface) {
    if (
      doc.style.base !== 'realistic' ||
      doc.voxels ||
      doc.roads.length ||
      doc.walls.some((wall) => wall.closed)
    )
      throw new CommandError('invalid', 'Active raster terrain requires realistic ground without roads');
    terrain.bindSurface(doc.terrain.activeSurface);
  }
  if (!doc.voxels) return { doc, terrain };
  const voxels = new VoxelData(half, doc.voxels);
  voxels.setRoads(doc.roads);
  voxels.setWalls(doc.walls);
  for (const encoded of edits) voxels.loadEdits(encoded);
  voxels.takeChanged();
  return { doc, terrain, voxels };
}

/** Ground edits that need the height field (block ground gets its own later: digging, P2-26). */
const HEIGHT_FIELD_COMMANDS = new Set<CommandPayload['type']>([
  'sculpt_terrain',
  'set_heights',
  'paint_rule',
  'paint_terrain',
  'paint_cover',
  'generate_world',
  'add_water',
  'set_water_level',
  'draw_river',
  'edit_river',
  'remove_river',
  'set_sea',
]);
const ACTIVE_SURFACE_BLOCKED = new Set<CommandPayload['type']>([
  'sculpt_terrain',
  'set_heights',
  'paint_rule',
  'paint_terrain',
  'paint_cover',
  'generate_world',
  'set_ground_material',
  'revert_terrain',
  'restore_terrain',
  'set_blocks',
  'draw_road',
  'remove_road',
  'set_water_level',
  'draw_river',
  'edit_river',
  'remove_river',
]);

export class CommandError extends Error {
  constructor(
    readonly code: 'invalid' | 'not_found' | 'duplicate' | 'out_of_bounds',
    message: string,
  ) {
    super(message);
  }
}

export interface ApplyResult {
  /** Command that exactly undoes this one. */
  inverse: CommandPayload;
  /** Terrain chunk keys whose data changed (to rebuild meshes/colliders and to persist). */
  changedChunks: Set<string>;
}

/** Deep copy of plain JSON data (world documents contain only JSON values). */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Bounding box of a polygon on the ground plane. */
function areaBounds(area: ReadonlyArray<readonly [number, number]>) {
  const xs = area.map(([x]) => x);
  const zs = area.map(([, z]) => z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

/** True while a chunk holds exactly `ground`'s heights and nothing painted: ground nobody made. */
function holdsOnly(terrain: TerrainData, chunk: ChunkData, ground: TerrainData): boolean {
  if (!chunk.soils.every((v) => v === 0) || !chunk.cover.every((v) => v === 0)) return false;
  for (let iz = 0; iz < terrain.edge; iz += 1)
    for (let ix = 0; ix < terrain.edge; ix += 1) {
      const { x, z } = terrain.vertexPosition(chunk, ix, iz);
      if (Math.abs((chunk.heights[iz * terrain.edge + ix] ?? 0) - ground.vertexHeight(x, z)) > 1e-4)
        return false;
    }
  return true;
}

/**
 * Carves a river's bed (P2-39). The profile is derived from the terrain and the place's standing
 * water, so the river ends by itself where it reaches a lake or the sea.
 */
function carveRiver(state: WorldState, river: River): HeightUpdate[] {
  const samples = riverProfile(
    state.terrain,
    river.points,
    river.width,
    river.widen,
    state.doc.environment.water,
    state.doc.environment.sea?.level ?? null,
  );
  return planRiverCarving(state.terrain, samples, MAX_TERRAIN_SLOPE[state.doc.style.base]);
}

function assertInside(state: WorldState, points: ReadonlyArray<readonly [number, number]>) {
  const half = state.terrain.half;
  for (const [x, z] of points) {
    if (Math.abs(x) > half || Math.abs(z) > half) {
      throw new CommandError('out_of_bounds', `Point (${x}, ${z}) is outside the place.`);
    }
  }
}

function snapshotChunks(state: WorldState, keys: Iterable<string>): string[] {
  return [...keys].map((key) => {
    const [cx, cz] = key.split(',').map(Number) as [number, number];
    return encodeChunk(state.terrain.getChunk(cx, cz));
  });
}

/** Chunks an area can touch (bounding box), used to snapshot terrain before an edit. */
function chunksForArea(state: WorldState, area: ReadonlyArray<readonly [number, number]>): string[] {
  const t = state.terrain;
  const { min, max } = t.chunkRange;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of area) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const keys: string[] = [];
  for (
    let cz = Math.max(min, Math.floor(minZ / t.chunkSize));
    cz <= Math.min(max, Math.floor(maxZ / t.chunkSize));
    cz += 1
  ) {
    for (
      let cx = Math.max(min, Math.floor(minX / t.chunkSize));
      cx <= Math.min(max, Math.floor(maxX / t.chunkSize));
      cx += 1
    ) {
      keys.push(chunkKey(cx, cz));
    }
  }
  return keys;
}

const findIndex = <T>(list: T[], predicate: (item: T) => boolean, what: string) => {
  const index = list.findIndex(predicate);
  if (index < 0) throw new CommandError('not_found', `${what} not found.`);
  return index;
};

/** Sets chunks to exact encoded contents; returns snapshots of what they were and the keys. */
function restoreChunks(state: WorldState, encoded: readonly string[]) {
  const decoded = encoded.map(decodeChunk);
  const keys = decoded.map((chunk) => chunkKey(chunk.cx, chunk.cz));
  const { min, max } = state.terrain.chunkRange;
  for (const chunk of decoded) {
    if (chunk.heights.length !== state.terrain.edge ** 2 || chunk.soils.length !== state.terrain.edge ** 2)
      throw new CommandError('invalid', 'Chunk size mismatch.');
    if (chunk.cx < min || chunk.cx > max || chunk.cz < min || chunk.cz > max)
      throw new CommandError('out_of_bounds', 'Chunk is outside the place.');
  }
  const before = snapshotChunks(state, keys);
  for (const chunk of decoded) state.terrain.chunks.set(chunkKey(chunk.cx, chunk.cz), chunk);
  return { before, changed: new Set(keys) };
}

/**
 * Terrain step of a structure that reshapes the ground (roads, rooms): either sets exact stored
 * chunks (redo) or applies planned grading. Returns what to restore on undo.
 */
function shapeGround(
  state: WorldState,
  exact: readonly string[] | undefined,
  plan: (() => HeightUpdate[]) | null,
) {
  if (exact) return restoreChunks(state, exact);
  if (!plan) return { before: [] as string[], changed: new Set<string>() };
  const updates = plan();
  const keys = new Set(updates.map((u) => chunkKey(u.chunk.cx, u.chunk.cz)));
  const before = snapshotChunks(state, keys);
  return { before, changed: state.terrain.applyHeights(updates) };
}

const findGroup = (doc: WorldDocument, groupId: string) =>
  doc.groups[findIndex(doc.groups, (g) => g.id === groupId, 'Group')]!;

/** Explorer settings of an item (P3-26), keeping only the values that differ from the default. */
const itemExtras = (i: Pick<ItemInstance, 'name' | 'groupId' | 'locked' | 'anchored' | 'floats'>) => ({
  ...(i.name ? { name: i.name } : {}),
  ...(i.groupId ? { groupId: i.groupId } : {}),
  ...(i.locked ? { locked: true } : {}),
  ...(i.anchored === false ? { anchored: false } : {}),
  ...(i.floats !== undefined ? { floats: i.floats } : {}),
});

const findWall = (doc: WorldDocument, wallId: string): Wall =>
  doc.walls[findIndex(doc.walls, (w) => w.id === wallId, 'Wall')]!;

/**
 * Validates and applies one command to the world state, returning its exact inverse.
 * Deterministic and shared by the browser (instant feedback), the API (authoritative save),
 * and the realtime server. Throws CommandError when the command cannot apply.
 */
export function applyCommand(state: WorldState, input: CommandPayload): ApplyResult {
  const result = applyToDocument(state, input);
  // Block ground follows the document's roads and walls (cheap when they did not change).
  state.voxels?.setRoads(state.doc.roads);
  state.voxels?.setWalls(state.doc.walls);
  return result;
}

function applyToDocument(state: WorldState, input: CommandPayload): ApplyResult {
  const parsed = CommandPayload.safeParse(input);
  if (!parsed.success)
    throw new CommandError('invalid', parsed.error.issues[0]?.message ?? 'Invalid command.');
  const command = parsed.data;
  const doc = state.doc;
  const none = new Set<string>();
  if (doc.terrain.activeSurface) {
    if (
      ACTIVE_SURFACE_BLOCKED.has(command.type) ||
      (command.type === 'set_style' && command.params.base !== 'realistic') ||
      (command.type === 'draw_wall' && (command.params.terrain || command.params.closed)) ||
      (command.type === 'remove_wall' && command.params.terrain)
    )
      throw new CommandError(
        'invalid',
        'Deactivate raster terrain before legacy terrain or structural ground edits',
      );
    if (isFieldCommand(command)) {
      const setId =
        command.type === 'create_field_set'
          ? command.params.descriptor.id
          : command.type === 'set_field_tile'
            ? command.params.tile.setId
            : command.params.setId;
      if (setId === doc.terrain.activeSurface.setId)
        throw new CommandError('invalid', 'Deactivate raster terrain before changing its field set');
    }
  }
  if (state.voxels && HEIGHT_FIELD_COMMANDS.has(command.type))
    throw new CommandError('invalid', 'This place has block ground; this tool does not work on blocks yet.');

  if (isFieldCommand(command)) {
    try {
      return applyFieldCommand(state, command);
    } catch (error) {
      if (error instanceof TerrainFieldStateError) throw new CommandError(error.code, error.message);
      throw new CommandError('invalid', (error as Error).message);
    }
  }
  switch (command.type) {
    case 'add_paving': {
      const p = command.params;
      doc.pavings ??= [];
      if (doc.pavings.some((x) => x.id === p.pavingId)) throw new CommandError('duplicate', `Paving ${p.pavingId} exists.`);
      assertInside(state, p.area);
      let twice = 0;
      for (let i = 0; i < p.area.length; i += 1) {
        const [ax, az] = p.area[i]!;
        const [bx, bz] = p.area[(i + 1) % p.area.length]!;
        twice += ax * bz - bx * az;
      }
      if (Math.abs(twice) / 2 < 1) throw new CommandError('invalid', 'A paved area must cover at least 1 square metre.');
      doc.pavings.push({
        id: p.pavingId,
        area: clone(p.area),
        materialId: p.materialId,
        ...(p.name ? { name: p.name } : {}),
      });
      return { inverse: { type: 'remove_paving', params: { pavingId: p.pavingId } }, changedChunks: none };
    }
    case 'remove_paving': {
      const pavings = doc.pavings ?? [];
      const index = findIndex(pavings, (x) => x.id === command.params.pavingId, 'Paving');
      const [removed] = pavings.splice(index, 1);
      const r = removed!;
      return {
        inverse: {
          type: 'add_paving',
          params: { pavingId: r.id, area: r.area, materialId: r.materialId, ...(r.name ? { name: r.name } : {}) },
        },
        changedChunks: none,
      };
    }
    case 'set_size_tier': {
      const next = command.params.sizeTier;
      const previous = doc.sizeTier;
      if (next === previous) return { inverse: command, changedChunks: none };
      if (state.voxels || doc.terrain.world || doc.terrain.activeSurface)
        throw new CommandError('invalid', "This place's ground was made for its size; it cannot change size yet.");
      const half = SIZE_TIERS[next].sideMeters / 2;
      if (half < state.terrain.half) {
        // Smaller only when everything built still fits (an undone growth, an empty place).
        const inside = ([x, z]: readonly number[]) => Math.abs(x!) <= half && Math.abs(z!) <= half;
        const points = [
          [doc.spawn.position[0], doc.spawn.position[2]],
          ...doc.instances.map((i) => [i.transform.position[0], i.transform.position[2]]),
          ...doc.roads.flatMap((r) => r.points),
          ...doc.walls.flatMap((w) => w.points),
          ...(doc.pavings ?? []).flatMap((p) => p.area),
          ...doc.environment.water.flatMap((w) => w.area),
          ...doc.environment.rivers.flatMap((r) => r.points),
        ] as Array<readonly number[]>;
        const range = state.terrain.chunkRange;
        const size = state.terrain.chunkSize;
        let groundOutside = false;
        for (let cx = range.min; cx <= range.max && !groundOutside; cx += 1)
          for (let cz = range.min; cz <= range.max && !groundOutside; cz += 1) {
            if (cx * size >= -half && (cx + 1) * size <= half && cz * size >= -half && (cz + 1) * size <= half) continue;
            const chunk = state.terrain.chunks.get(`${cx},${cz}`);
            if (chunk && !state.terrain.isGenerated(chunk)) groundOutside = true;
          }
        if (!points.every(inside) || groundOutside)
          throw new CommandError('invalid', 'Something is built outside the smaller size; the place can only grow.');
      }
      doc.sizeTier = next;
      state.terrain.half = half;
      return { inverse: { type: 'set_size_tier', params: { sizeTier: previous } }, changedChunks: none };
    }
    case 'set_spawn': {
      const spawn = command.params.spawn;
      const half = SIZE_TIERS[doc.sizeTier].sideMeters / 2;
      if (Math.abs(spawn.position[0]) > half || Math.abs(spawn.position[2]) > half)
        throw new CommandError('invalid', 'Spawn position must be inside the place bounds.');
      const previous = clone(doc.spawn);
      doc.spawn = clone(spawn);
      return { inverse: { type: 'set_spawn', params: { spawn: previous } }, changedChunks: none };
    }
    case 'set_terrain_surface': {
      const surface = command.params.surface;
      if (
        surface &&
        (doc.style.base !== 'realistic' ||
          state.voxels ||
          doc.roads.length ||
          doc.walls.some((wall) => wall.closed))
      )
        throw new CommandError('invalid', 'Active raster terrain requires realistic ground without roads');
      const previous = doc.terrain.activeSurface ?? null;
      try {
        state.terrain.bindSurface(surface);
      } catch (error) {
        throw new CommandError('invalid', (error as Error).message);
      }
      if (surface) doc.terrain.activeSurface = clone(surface);
      else delete doc.terrain.activeSurface;
      return { inverse: { type: 'set_terrain_surface', params: { surface: previous } }, changedChunks: none };
    }
    case 'set_blocks': {
      const voxels = state.voxels;
      if (!voxels)
        throw new CommandError('invalid', 'Only places with block ground have blocks to dig and stack.');
      // The last change to a position wins; the undo puts back what was there before the command.
      const wanted = new Map<string, [number, number, number, number]>();
      for (const [x, y, z, block] of command.params.blocks) {
        if (!voxels.inside(x, z))
          throw new CommandError('out_of_bounds', `Block (${x}, ${z}) is outside the place.`);
        // The lowest layer stays, so nobody digs out of the world.
        if (y <= VOXEL_MIN_Y || y >= VOXEL_MIN_Y + VOXEL_LAYERS)
          throw new CommandError(
            'out_of_bounds',
            `Blocks go from ${VOXEL_MIN_Y + 1} to ${VOXEL_MIN_Y + VOXEL_LAYERS - 1} m.`,
          );
        if (block >= BLOCKS.length) throw new CommandError('invalid', `There is no block ${block}.`);
        // Digging next to or under water lets the water in (lake floors and shores).
        const flooded =
          block === Block.air &&
          y < VOXEL_WATER_LEVEL &&
          [
            voxels.block(x, y + 1, z),
            voxels.block(x + 1, y, z),
            voxels.block(x - 1, y, z),
            voxels.block(x, y, z + 1),
            voxels.block(x, y, z - 1),
          ].includes(Block.water);
        wanted.set(`${x},${y},${z}`, [x, y, z, flooded ? Block.water : block]);
      }
      const before = voxels.setBlocks([...wanted.values()]);
      const changed = new Set(
        before.map(([x, , z]) => {
          const { cx, cz } = voxels.chunkAt(x, z);
          return voxelEditsKey(cx, cz);
        }),
      );
      return { inverse: { type: 'set_blocks', params: { blocks: before } }, changedChunks: changed };
    }
    case 'place_item': {
      const p = command.params;
      if (doc.instances.some((i) => i.instanceId === p.instanceId)) {
        throw new CommandError('duplicate', `Instance ${p.instanceId} already exists.`);
      }
      assertInside(state, [[p.position[0], p.position[2]]]);
      const instance: ItemInstance = {
        instanceId: p.instanceId,
        itemId: p.itemId,
        transform: {
          position: p.position,
          rotation: p.rotation ?? [0, 0, 0, 1],
          scale: p.scale ?? [1, 1, 1],
        },
        params: p.itemParams ?? {},
        ...itemExtras(p),
      };
      if (p.groupId) findGroup(doc, p.groupId);
      doc.instances.push(instance);
      return { inverse: { type: 'remove_item', params: { instanceId: p.instanceId } }, changedChunks: none };
    }
    case 'remove_item': {
      const index = findIndex(doc.instances, (i) => i.instanceId === command.params.instanceId, 'Instance');
      const [removed] = doc.instances.splice(index, 1) as [ItemInstance];
      return {
        inverse: {
          type: 'place_item',
          params: {
            instanceId: removed.instanceId,
            itemId: removed.itemId,
            position: removed.transform.position,
            rotation: removed.transform.rotation,
            scale: removed.transform.scale,
            itemParams: removed.params,
            ...itemExtras(removed),
          },
        },
        changedChunks: none,
      };
    }
    case 'transform_item': {
      const p = command.params;
      const instance =
        doc.instances[findIndex(doc.instances, (i) => i.instanceId === p.instanceId, 'Instance')]!;
      const before = clone(instance.transform);
      if (p.position) {
        assertInside(state, [[p.position[0], p.position[2]]]);
        instance.transform.position = p.position;
      }
      if (p.rotation) instance.transform.rotation = p.rotation;
      if (p.scale) instance.transform.scale = p.scale;
      return {
        inverse: {
          type: 'transform_item',
          params: {
            instanceId: p.instanceId,
            position: before.position,
            rotation: before.rotation,
            scale: before.scale,
          },
        },
        changedChunks: none,
      };
    }
    case 'set_item_params': {
      const p = command.params;
      const instance =
        doc.instances[findIndex(doc.instances, (i) => i.instanceId === p.instanceId, 'Instance')]!;
      // The inverse puts back the old value of every key this command touched (null = unset).
      const before: Record<string, string | number | boolean | null> = {};
      for (const [key, value] of Object.entries(p.params)) {
        const old = instance.params[key];
        before[key] =
          typeof old === 'string' || typeof old === 'number' || typeof old === 'boolean' ? old : null;
        if (value === null) delete instance.params[key];
        else instance.params[key] = value;
      }
      return {
        inverse: { type: 'set_item_params', params: { instanceId: p.instanceId, params: before } },
        changedChunks: none,
      };
    }
    case 'rename': {
      const { kind, id, name } = command.params;
      const target: { name?: string | undefined } =
        kind === 'item'
          ? doc.instances[findIndex(doc.instances, (i) => i.instanceId === id, 'Instance')]!
          : kind === 'road'
            ? doc.roads[findIndex(doc.roads, (r) => r.id === id, 'Road')]!
            : kind === 'wall'
              ? findWall(doc, id)
              : kind === 'water'
                ? doc.environment.water[findIndex(doc.environment.water, (w) => w.id === id, 'Water')]!
                : kind === 'river'
                  ? doc.environment.rivers[findIndex(doc.environment.rivers, (r) => r.id === id, 'River')]!
                  : findGroup(doc, id);
      if (kind === 'group' && name === null) throw new CommandError('invalid', 'A group needs a name.');
      const before = target.name ?? null;
      if (name === null) delete target.name;
      else target.name = name;
      return { inverse: { type: 'rename', params: { kind, id, name: before } }, changedChunks: none };
    }
    case 'set_item_flags': {
      const p = command.params;
      const instance =
        doc.instances[findIndex(doc.instances, (i) => i.instanceId === p.instanceId, 'Instance')]!;
      const before = {
        locked: instance.locked === true,
        anchored: instance.anchored !== false,
        floats: instance.floats ?? null,
      };
      // Only the non-default value is stored: locked true, anchored false.
      if (p.locked !== undefined) {
        if (p.locked) instance.locked = true;
        else delete instance.locked;
      }
      if (p.anchored !== undefined) {
        if (p.anchored) delete instance.anchored;
        else instance.anchored = false;
      }
      // Floats is stored either way (an item type that floats can be told to rest, and back).
      if (p.floats !== undefined) {
        if (p.floats === null) delete instance.floats;
        else instance.floats = p.floats;
      }
      return {
        inverse: {
          type: 'set_item_flags',
          params: {
            instanceId: p.instanceId,
            ...(p.locked !== undefined ? { locked: before.locked } : {}),
            ...(p.anchored !== undefined ? { anchored: before.anchored } : {}),
            ...(p.floats !== undefined ? { floats: before.floats } : {}),
          },
        },
        changedChunks: none,
      };
    }
    case 'group_items': {
      const { groupId, name, instanceIds } = command.params;
      if (doc.groups.some((g) => g.id === groupId))
        throw new CommandError('duplicate', `Group ${groupId} exists.`);
      if (new Set(instanceIds).size !== instanceIds.length)
        throw new CommandError('invalid', 'An item is listed twice.');
      const members = instanceIds.map(
        (id) => doc.instances[findIndex(doc.instances, (i) => i.instanceId === id, 'Instance')]!,
      );
      if (members.some((m) => m.groupId)) throw new CommandError('invalid', 'An item is already in a group.');
      doc.groups.push({ id: groupId, name });
      for (const member of members) member.groupId = groupId;
      return { inverse: { type: 'ungroup_items', params: { groupId } }, changedChunks: none };
    }
    case 'ungroup_items': {
      const { groupId } = command.params;
      const index = findIndex(doc.groups, (g) => g.id === groupId, 'Group');
      const [group] = doc.groups.splice(index, 1);
      const instanceIds: string[] = [];
      for (const instance of doc.instances) {
        if (instance.groupId !== groupId) continue;
        delete instance.groupId;
        instanceIds.push(instance.instanceId);
      }
      return {
        inverse: { type: 'group_items', params: { groupId, name: group!.name, instanceIds } },
        changedChunks: none,
      };
    }
    case 'set_style': {
      const before = clone(doc.style);
      doc.style = clone(command.params);
      return { inverse: { type: 'set_style', params: before }, changedChunks: none };
    }
    case 'set_sky': {
      const before = clone(doc.environment.sky);
      doc.environment.sky = { preset: command.params.preset, params: command.params.params ?? {} };
      return { inverse: { type: 'set_sky', params: before }, changedChunks: none };
    }
    case 'set_weather': {
      const before = clone(doc.environment.weather);
      doc.environment.weather = { preset: command.params.preset, params: command.params.params ?? {} };
      return { inverse: { type: 'set_weather', params: before }, changedChunks: none };
    }
    case 'add_water': {
      if (doc.environment.water.some((w) => w.id === command.params.id)) {
        throw new CommandError('duplicate', `Water ${command.params.id} already exists.`);
      }
      assertInside(state, command.params.area);
      doc.environment.water.push(clone(command.params));
      return {
        inverse: { type: 'remove_water', params: { waterId: command.params.id } },
        changedChunks: none,
      };
    }
    case 'remove_water': {
      const list = doc.environment.water;
      const index = findIndex(list, (w) => w.id === command.params.waterId, 'Water');
      const [removed] = list.splice(index, 1);
      return { inverse: { type: 'add_water', params: removed! }, changedChunks: none };
    }
    case 'set_water_level': {
      const p = command.params;
      const body =
        doc.environment.water[findIndex(doc.environment.water, (w) => w.id === p.waterId, 'Water')]!;
      const before = body.level;
      // Raising a lake digs its basin deeper where the ground would stick out of the new level.
      const ground = shapeGround(state, p.terrain, () =>
        state.terrain.planHeights(areaBounds(body.area), (x, z, current) =>
          current > p.level - 0.05 && insidePolygon(x, z, body.area) ? p.level - 0.05 : undefined,
        ),
      );
      body.level = p.level;
      return {
        inverse: {
          type: 'set_water_level',
          params: {
            waterId: p.waterId,
            level: before,
            ...(ground.before.length ? { terrain: ground.before } : {}),
          },
        },
        changedChunks: ground.changed,
      };
    }
    case 'draw_river': {
      const p = command.params;
      if (doc.environment.rivers.some((r) => r.id === p.riverId))
        throw new CommandError('duplicate', `River ${p.riverId} exists.`);
      if (doc.environment.rivers.length >= RIVER_LIMITS.maxPerPlace)
        throw new CommandError('invalid', `A place can have at most ${RIVER_LIMITS.maxPerPlace} rivers.`);
      assertInside(state, p.points);
      const shapeError = riverShapeError(p.points);
      if (shapeError) throw new CommandError('invalid', shapeError);
      const river: River = {
        id: p.riverId,
        points: clone(p.points),
        width: p.width ?? 6,
        widen: p.widen ?? 1.3,
        flow: p.flow ?? 1.5,
        params: {},
        ...(p.name ? { name: p.name } : {}),
      };
      const ground = shapeGround(state, p.terrain, p.carve === false ? null : () => carveRiver(state, river));
      doc.environment.rivers.push(river);
      return {
        inverse: {
          type: 'remove_river',
          params: { riverId: p.riverId, ...(ground.before.length ? { terrain: ground.before } : {}) },
        },
        changedChunks: ground.changed,
      };
    }
    case 'edit_river': {
      const p = command.params;
      const river =
        doc.environment.rivers[findIndex(doc.environment.rivers, (r) => r.id === p.riverId, 'River')]!;
      const before = clone(river);
      if (p.points) {
        assertInside(state, p.points);
        const shapeError = riverShapeError(p.points);
        if (shapeError) throw new CommandError('invalid', shapeError);
        river.points = clone(p.points);
      }
      if (p.width !== undefined) river.width = p.width;
      if (p.widen !== undefined) river.widen = p.widen;
      if (p.flow !== undefined) river.flow = p.flow;
      // The bed follows the new shape; the ground before the edit is what undo restores. An edit
      // that only changes the flow never touches the ground, and neither may its inverse.
      const reshapes = p.points !== undefined || p.width !== undefined || p.widen !== undefined;
      const ground = shapeGround(
        state,
        p.terrain,
        reshapes && p.carve !== false ? () => carveRiver(state, river) : null,
      );
      return {
        inverse: {
          type: 'edit_river',
          params: {
            riverId: p.riverId,
            ...(p.points !== undefined ? { points: before.points } : {}),
            ...(p.width !== undefined ? { width: before.width } : {}),
            ...(p.widen !== undefined ? { widen: before.widen } : {}),
            ...(p.flow !== undefined ? { flow: before.flow } : {}),
            // Put back exactly the ground this edit replaced; never carve again on the way back.
            ...(ground.before.length ? { terrain: ground.before } : reshapes ? { carve: false } : {}),
          },
        },
        changedChunks: ground.changed,
      };
    }
    case 'remove_river': {
      const list = doc.environment.rivers;
      const index = findIndex(list, (r) => r.id === command.params.riverId, 'River');
      const restored = command.params.terrain ? restoreChunks(state, command.params.terrain) : null;
      const [removed] = list.splice(index, 1);
      const r = removed!;
      return {
        inverse: {
          type: 'draw_river',
          params: {
            riverId: r.id,
            points: r.points,
            width: r.width,
            widen: r.widen,
            flow: r.flow,
            ...(r.name ? { name: r.name } : {}),
            // Put back exactly the ground this removal replaced (no re-carving).
            ...(restored ? { terrain: restored.before } : { carve: false }),
          },
        },
        changedChunks: restored?.changed ?? none,
      };
    }
    case 'set_sea': {
      const before = doc.environment.sea ? clone(doc.environment.sea) : null;
      if (command.params.level === null) delete doc.environment.sea;
      else {
        // A swell left out keeps the one the sea has; null clears it (Tidewater sea, plan task 3).
        const swell =
          command.params.swell === undefined ? before?.swell : (command.params.swell ?? undefined);
        const resourceId =
          command.params.resourceId === undefined
            ? before?.resourceId
            : (command.params.resourceId ?? undefined);
        doc.environment.sea = {
          level: command.params.level,
          ...(resourceId ? { resourceId } : {}),
          ...(swell ? { swell: clone(swell) } : {}),
          params: clone(command.params.params ?? before?.params ?? {}),
        };
      }
      return {
        inverse: {
          type: 'set_sea',
          params: before
            ? {
                level: before.level,
                resourceId: before.resourceId ?? null,
                swell: before.swell ? clone(before.swell) : null,
                params: before.params,
              }
            : { level: null },
        },
        changedChunks: none,
      };
    }
    case 'set_game': {
      const before = doc.game ? clone(doc.game) : null;
      if (command.params.game === null) delete doc.game;
      else doc.game = clone(command.params.game);
      return { inverse: { type: 'set_game', params: { game: before } }, changedChunks: none };
    }
    case 'set_story': {
      const before = doc.story ? clone(doc.story) : null;
      if (command.params.story === null) delete doc.story;
      else doc.story = clone(command.params.story);
      return { inverse: { type: 'set_story', params: { story: before } }, changedChunks: none };
    }
    case 'set_script': {
      const { scriptId, script, index } = command.params;
      const scripts = doc.scripts ?? [];
      const at = scripts.findIndex((s) => s.id === scriptId);
      const before = at >= 0 ? clone(scripts[at]!) : null;
      const next = [...scripts];
      if (script === null) {
        if (at < 0) throw new CommandError('not_found', `Script ${scriptId} not found.`);
        next.splice(at, 1);
      } else {
        const entry = { id: scriptId, ...clone(script) };
        if (at >= 0) next[at] = entry;
        else next.splice(Math.min(index ?? next.length, next.length), 0, entry);
        if (next.length > SCRIPT_LIMITS.scripts)
          throw new CommandError('invalid', `A place has at most ${SCRIPT_LIMITS.scripts} scripts.`);
        if (scriptChars(next) > SCRIPT_LIMITS.totalChars)
          throw new CommandError(
            'invalid',
            `A place has at most ${SCRIPT_LIMITS.totalChars} characters of scripts.`,
          );
      }
      if (next.length) doc.scripts = next;
      else delete doc.scripts;
      const { id: _id, ...beforeBody } = before ?? { id: '' };
      void _id;
      return {
        inverse: {
          type: 'set_script',
          params: before
            ? { scriptId, script: beforeBody as PlaceScriptBody, ...(script === null ? { index: at } : {}) }
            : { scriptId, script: null },
        },
        changedChunks: none,
      };
    }
    case 'draw_road': {
      const p = command.params;
      if (doc.roads.some((r) => r.id === p.roadId))
        throw new CommandError('duplicate', `Road ${p.roadId} exists.`);
      assertInside(state, p.points);
      const shapeError = roadShapeError(p.points);
      if (shapeError) throw new CommandError('invalid', shapeError);
      const width = p.width ?? 6;
      // Block ground follows the road's line itself (VoxelData.setRoads): no grading here.
      const ground = shapeGround(
        state,
        p.terrain,
        p.grade === false || state.voxels
          ? null
          : () => planRoadGrading(state.terrain, p.points, width, doc.environment.water),
      );
      doc.roads.push({
        id: p.roadId,
        points: clone(p.points),
        width,
        ...(p.materialId ? { materialId: p.materialId } : {}),
        ...(p.name ? { name: p.name } : {}),
        ...(p.lanes ? { lanes: p.lanes } : {}),
        ...(p.oneway ? { oneway: true } : {}),
        ...(p.sidewalk ? { sidewalk: p.sidewalk } : {}),
        ...(p.sidewalkSide && p.sidewalkSide !== 'both' ? { sidewalkSide: p.sidewalkSide } : {}),
      });
      return {
        inverse: {
          type: 'remove_road',
          params: { roadId: p.roadId, ...(ground.before.length ? { terrain: ground.before } : {}) },
        },
        changedChunks: ground.changed,
      };
    }
    case 'remove_road': {
      const index = findIndex(doc.roads, (r) => r.id === command.params.roadId, 'Road');
      const restored = command.params.terrain ? restoreChunks(state, command.params.terrain) : null;
      const [removed] = doc.roads.splice(index, 1);
      const r = removed!;
      return {
        inverse: {
          type: 'draw_road',
          params: {
            roadId: r.id,
            points: r.points,
            width: r.width,
            ...(r.materialId ? { materialId: r.materialId } : {}),
            ...(r.name ? { name: r.name } : {}),
            ...(r.lanes ? { lanes: r.lanes } : {}),
            ...(r.oneway ? { oneway: true } : {}),
            ...(r.sidewalk ? { sidewalk: r.sidewalk } : {}),
            ...(r.sidewalkSide ? { sidewalkSide: r.sidewalkSide } : {}),
            // Put back exactly the graded ground this removal replaced (no re-grading).
            ...(restored ? { terrain: restored.before } : { grade: false }),
          },
        },
        changedChunks: restored?.changed ?? none,
      };
    }
    case 'draw_wall': {
      const p = command.params;
      if (doc.walls.some((w) => w.id === p.wallId))
        throw new CommandError('duplicate', `Wall ${p.wallId} exists.`);
      assertInside(state, p.points);
      const closed = p.closed ?? false;
      const shapeError = wallShapeError(p.points, closed);
      if (shapeError) throw new CommandError('invalid', shapeError);
      if (p.building && (!closed || p.materialId !== BUILDING_WALL_MATERIAL))
        throw new CommandError('invalid', 'A building look needs a closed wall with the building material.');
      const wall: Wall = {
        id: p.wallId,
        points: clone(p.points),
        height: p.height ?? 3,
        closed,
        ...(p.materialId ? { materialId: p.materialId } : {}),
        ...(p.name ? { name: p.name } : {}),
        openings: [],
        ...(p.building ? { building: clone(p.building) } : {}),
      };
      for (const opening of p.openings ?? []) {
        if (wall.openings.some((o) => o.id === opening.id))
          throw new CommandError('duplicate', `Opening ${opening.id} exists.`);
        const error = openingError(wall, opening);
        if (error) throw new CommandError('invalid', error);
        wall.openings.push(clone(opening));
      }
      sortOpenings(wall.openings);
      const ground = shapeGround(
        state,
        p.terrain,
        // Block ground follows the wall's line itself (VoxelData.setWalls): no grading here.
        closed && p.grade !== false && !state.voxels ? () => planRoomGrading(state.terrain, p.points) : null,
      );
      doc.walls.push(wall);
      return {
        inverse: {
          type: 'remove_wall',
          params: { wallId: p.wallId, ...(ground.before.length ? { terrain: ground.before } : {}) },
        },
        changedChunks: ground.changed,
      };
    }
    case 'remove_wall': {
      const index = findIndex(doc.walls, (w) => w.id === command.params.wallId, 'Wall');
      const restored = command.params.terrain ? restoreChunks(state, command.params.terrain) : null;
      const [removed] = doc.walls.splice(index, 1);
      const w = removed!;
      return {
        inverse: {
          type: 'draw_wall',
          params: {
            wallId: w.id,
            points: w.points,
            height: w.height,
            closed: w.closed,
            ...(w.materialId ? { materialId: w.materialId } : {}),
            ...(w.openings.length ? { openings: w.openings } : {}),
            ...(w.name ? { name: w.name } : {}),
            // Put back exactly the graded ground this removal replaced (no re-grading).
            ...(restored ? { terrain: restored.before } : { grade: false }),
          },
        },
        changedChunks: restored?.changed ?? none,
      };
    }
    case 'add_wall_opening': {
      const { wallId, opening } = command.params;
      const wall = findWall(doc, wallId);
      if (wall.openings.some((o) => o.id === opening.id))
        throw new CommandError('duplicate', `Opening ${opening.id} exists.`);
      const error = openingError(wall, opening);
      if (error) throw new CommandError('invalid', error);
      wall.openings.push(clone(opening));
      sortOpenings(wall.openings);
      return {
        inverse: { type: 'remove_wall_opening', params: { wallId, openingId: opening.id } },
        changedChunks: none,
      };
    }
    case 'remove_wall_opening': {
      const { wallId, openingId } = command.params;
      const wall = findWall(doc, wallId);
      const index = findIndex(wall.openings, (o) => o.id === openingId, 'Opening');
      const [removed] = wall.openings.splice(index, 1);
      return {
        inverse: { type: 'add_wall_opening', params: { wallId, opening: removed! } },
        changedChunks: none,
      };
    }
    case 'sculpt_terrain': {
      const { area, operation, strength, targetHeight, soft } = command.params;
      const before = snapshotTerrain(state.terrain, chunksForArea(state, area));
      // The style's maximum slope (P2-11) as a height step between neighboring vertices.
      const maxStep =
        state.terrain.spacing * Math.tan((MAX_TERRAIN_SLOPE[state.doc.style.base] * Math.PI) / 180);
      const changed = state.terrain.sculpt(area, operation, strength, targetHeight, soft, maxStep);
      if (changed.size === 0) throw new CommandError('out_of_bounds', 'The area is outside the place.');
      // Undo reverts only the points this edit changed (others may edit the same chunk later).
      return {
        inverse: { type: 'revert_terrain', params: { edits: diffTerrain(state.terrain, before) } },
        changedChunks: changed,
      };
    }
    case 'generate_world': {
      const before = doc.terrain.world ? clone(doc.terrain.world) : null;
      const spawnBefore = clone(doc.spawn);
      // A chunk that only holds what the old world gave (streaming the ground creates one for
      // every chunk it draws) is not the creator's; kept, it would hide the new world and be saved
      // as if they had shaped it. It goes, and is reported so the views rebuild it.
      const changed = new Set<string>();
      // The old world's own water left stored chunks too (a river's carved bed, a dug lake). They
      // are the starter's, not the creator's, so they go as well: compared against the old world's
      // starter ground exactly as it was made, so anything the creator changed there stays.
      const starter = before ? starterGround(before, doc.sizeTier, doc.style.base) : null;
      // The starter's own chunks are kept for undo; plain generated ones come back by themselves.
      const starterChunks: string[] = [];
      for (const [key, chunk] of state.terrain.chunks) {
        if (state.terrain.isGenerated(chunk)) changed.add(key);
        else if (starter && holdsOnly(state.terrain, chunk, starter)) {
          changed.add(key);
          starterChunks.push(encodeChunk(chunk));
        }
      }
      for (const key of changed) state.terrain.chunks.delete(key);
      if (command.params.world === null) delete doc.terrain.world;
      else doc.terrain.world = clone(command.params.world);
      // Nothing is overwritten: a stored chunk always beats the generator, so ground the creator
      // shaped simply stays and the new world shows through everywhere else (design 3.6).
      state.terrain.world = doc.terrain.world ?? null;
      // The spawn moves onto the new ground. Without this the player arrives at the old height,
      // which after a valley is generated means either falling or standing inside a hill.
      // Undo puts the old world's starter ground back exactly.
      if (command.params.terrain)
        for (const key of restoreChunks(state, command.params.terrain).changed) changed.add(key);
      if (command.params.spawn) doc.spawn = clone(command.params.spawn);
      else if (doc.terrain.world) {
        const [, , z] = doc.spawn.position;
        const x = doc.spawn.position[0];
        doc.spawn = { ...doc.spawn, position: [x, state.terrain.heightAt(x, z) + 1, z] };
      }
      return {
        inverse: {
          type: 'generate_world',
          params: {
            world: before,
            spawn: spawnBefore,
            ...(starterChunks.length ? { terrain: starterChunks } : {}),
          },
        },
        changedChunks: changed,
      };
    }
    case 'set_heights': {
      const { x0, z0, cols, rows, step, base, heights } = command.params;
      const t = state.terrain;
      if (Math.abs(step - t.spacing) > 1e-6)
        throw new CommandError('invalid', `step must be the ground spacing (${t.spacing} m).`);
      let metres: number[];
      try {
        metres = decodeHeightTile(heights, cols * rows, base);
      } catch (error) {
        throw new CommandError('invalid', (error as Error).message);
      }
      // The corner snaps onto the ground grid; every point of the tile is then exactly a ground point.
      const gx = Math.round(x0 / t.spacing) * t.spacing;
      const gz = Math.round(z0 / t.spacing) * t.spacing;
      const box = {
        minX: gx,
        maxX: gx + (cols - 1) * t.spacing,
        minZ: gz,
        maxZ: gz + (rows - 1) * t.spacing,
      };
      if (box.maxX < -t.half || box.minX > t.half || box.maxZ < -t.half || box.minZ > t.half)
        throw new CommandError('out_of_bounds', 'The tile is outside the place.');
      const corners: Array<[number, number]> = [
        [box.minX, box.minZ],
        [box.maxX, box.minZ],
        [box.maxX, box.maxZ],
        [box.minX, box.maxZ],
      ];
      const before = snapshotTerrain(t, chunksForArea(state, corners));
      const changed = t.applyHeights(
        t.planHeights(box, (x, z) => {
          const i = Math.round((x - gx) / t.spacing);
          const j = Math.round((z - gz) / t.spacing);
          return i >= 0 && i < cols && j >= 0 && j < rows ? metres[j * cols + i] : undefined;
        }),
      );
      return {
        inverse: { type: 'revert_terrain', params: { edits: diffTerrain(t, before) } },
        changedChunks: changed,
      };
    }
    case 'paint_rule': {
      const {
        box: [minX, minZ, maxX, maxZ],
        soilId,
        material,
        cover,
        height,
        slope,
        depth,
      } = command.params;
      const t = state.terrain;
      if (maxX - minX > PAINT_RULE_MAX_BOX || maxZ - minZ > PAINT_RULE_MAX_BOX || maxX < minX || maxZ < minZ)
        throw new CommandError('invalid', `The box must be at most ${PAINT_RULE_MAX_BOX} m on each side.`);
      const sea = doc.environment.sea?.level;
      if (depth && sea === undefined) throw new CommandError('invalid', 'A depth rule needs a sea.');
      let slot: number | null = null;
      if (soilId !== undefined) {
        slot = material ? paletteSlot(state, material) : SOILS.indexOf(soilId);
        if (slot === null) throw new CommandError('invalid', 'This place already uses 16 ground materials.');
      }
      const coverValue = cover === undefined ? null : COVERS.indexOf(cover);
      const inRange = (value: number, range: readonly [number, number] | undefined) =>
        !range || (value >= Math.min(range[0], range[1]) && value <= Math.max(range[0], range[1]));
      const box = { minX, maxX, minZ, maxZ };
      const corners: Array<[number, number]> = [
        [minX, minZ],
        [maxX, minZ],
        [maxX, maxZ],
        [minX, maxZ],
      ];
      const before = snapshotTerrain(t, chunksForArea(state, corners));
      // Decide every point first (heights do not change here), then paint.
      const picked: Array<[ChunkData, number]> = [];
      t.visitBox(box, (chunk, index, x, z) => {
        const h = chunk.heights[index] ?? 0;
        if (!inRange(h, height)) return false;
        if (depth && !inRange(sea! - h, depth)) return false;
        if (slope && !inRange(t.slopeAt(x, z), slope)) return false;
        picked.push([chunk, index]);
        return false;
      });
      const changed = new Set<string>();
      for (const [chunk, index] of picked) {
        if (slot !== null) chunk.soils[index] = slot;
        if (coverValue !== null) chunk.cover[index] = coverValue;
        changed.add(chunkKey(chunk.cx, chunk.cz));
      }
      if (material && slot !== null && slot >= SOILS.length && picked.length)
        setGroundMaterial(state, slot, material);
      return {
        inverse: { type: 'revert_terrain', params: { edits: diffTerrain(t, before) } },
        changedChunks: changed,
      };
    }
    case 'paint_cover': {
      const before = snapshotTerrain(state.terrain, chunksForArea(state, command.params.area));
      const changed = state.terrain.paintCover(command.params.area, command.params.cover);
      if (changed.size === 0) throw new CommandError('out_of_bounds', 'The area is outside the place.');
      return {
        inverse: { type: 'revert_terrain', params: { edits: diffTerrain(state.terrain, before) } },
        changedChunks: changed,
      };
    }
    case 'paint_terrain': {
      const soil = command.params.soilId as Soil;
      if (!SOILS.includes(soil)) throw new CommandError('invalid', `Unknown soil: ${command.params.soilId}`);
      const material = command.params.material;
      // A library ground material takes a palette slot (P2-37); a plain soil paints its own slot.
      const slot = material ? paletteSlot(state, material) : SOILS.indexOf(soil);
      if (slot === null) throw new CommandError('invalid', 'This place already uses 16 ground materials.');
      const before = snapshotTerrain(state.terrain, chunksForArea(state, command.params.area));
      const changed = state.terrain.paintSlot(command.params.area, slot);
      if (changed.size === 0) throw new CommandError('out_of_bounds', 'The area is outside the place.');
      if (material && slot >= SOILS.length) setGroundMaterial(state, slot, material);
      return {
        inverse: { type: 'revert_terrain', params: { edits: diffTerrain(state.terrain, before) } },
        changedChunks: changed,
      };
    }
    case 'set_ground_material': {
      const { slot, material } = command.params;
      const before = state.doc.terrain.materials?.[String(slot)] ?? null;
      setGroundMaterial(state, slot, material);
      return {
        inverse: { type: 'set_ground_material', params: { slot, material: before } },
        changedChunks: none,
      };
    }
    case 'revert_terrain': {
      try {
        const { inverse, changed } = revertTerrain(state.terrain, command.params.edits, (h) =>
          Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, h)),
        );
        return { inverse: { type: 'revert_terrain', params: { edits: inverse } }, changedChunks: changed };
      } catch (error) {
        if (error instanceof CommandError) throw error;
        throw new CommandError('invalid', (error as Error).message);
      }
    }
    case 'restore_terrain': {
      const { before, changed } = restoreChunks(state, command.params.chunks);
      return { inverse: { type: 'restore_terrain', params: { chunks: before } }, changedChunks: changed };
    }
  }
}

/** True for a chunk that is still flat grass (the default; never needs saving). */
export function isDefaultChunk(chunk: {
  heights: Float32Array;
  soils: Uint8Array;
  cover: Uint8Array;
}): boolean {
  // Cover counts (P2-40). Without it a chunk whose only change is painted plants, or a cleared
  // spot where a scattered tree was taken away, would be treated as untouched and never saved.
  return (
    chunk.heights.every((h) => h === 0) &&
    chunk.soils.every((s) => s === 0) &&
    chunk.cover.every((c) => c === 0)
  );
}

/**
 * Terrain chunks encoded for saving. Without `keys`, returns every non-default chunk.
 * With `keys`, returns exactly those chunks (a default chunk means "reset to flat").
 */
export function encodeTerrain(
  state: WorldState,
  keys?: Iterable<string>,
): Array<{ key: string; data: string }> {
  const selected = keys
    ? [...keys]
    : [...state.terrain.chunks.entries()]
        // A chunk that still holds what the world would give anyway is not worth storing, so a
        // place made from a seed costs nothing until somebody builds in it (P2-40).
        .filter(([, chunk]) => !state.terrain.isGenerated(chunk))
        .map(([key]) => key);
  if (!keys) {
    selected.push(...(state.voxels?.editedChunks() ?? []).map((k) => `v:${k}`));
    selected.push(...loadedTerrainFieldKeys(state));
  }
  return selected.sort().map((key) => {
    if (key.startsWith('f:')) return { key, data: encodeTerrainFieldRow(state, key) };
    // Block edits (P2-26): empty data means the chunk has none left (delete its stored row).
    if (key.startsWith('v:')) {
      const [cx, cz] = key.slice(2).split(',').map(Number) as [number, number];
      return { key, data: state.voxels?.encodeEdits(cx, cz) ?? '' };
    }
    const [cx, cz] = key.split(',').map(Number) as [number, number];
    return { key, data: encodeChunk(state.terrain.getChunk(cx, cz)) };
  });
}
