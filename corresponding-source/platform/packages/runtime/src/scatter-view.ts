import type { CommandPayload, ItemInstance, WorldDocument } from '@genvr/contracts';
import { REBUILDS_SURFACES, type SurfaceIndex } from '@genvr/validator';
import {
  COVER_LAYERS,
  scatterInChunk,
  woodsOf,
  type ScatterGround,
  type ScatterLayer,
  type ScatterOptions,
  type TerrainData,
} from '@genvr/world';

/**
 * The woods and the painted cover, drawn around the player (P2-40).
 *
 * Nothing here decides where anything stands: `@genvr/world` does that from the seed, so the
 * browser and the server agree. This only decides **which ground is worth working out right now**
 * and turns the result into ordinary item instances, which `ItemsView` then draws with the
 * instancing, LOD and colliders it already has.
 *
 * Chunks are kept once they are worked out, so walking back and forth does not redo them, and a
 * chunk is thrown away when the ground under it changes.
 */

/**
 * How far from the player things are drawn, in meters.
 *
 * This was three chunks, which is the mistake worth keeping a note about: a chunk is 64 m, not the
 * 32 m I measured with, so three of them reached 224 m in every direction and filled a small place
 * end to end. 1,140 trees drew at once for 53 million triangles and 19 fps. Distance in meters
 * cannot drift when the chunk size changes, which is the whole reason it is written this way.
 */
export const DRAW_DISTANCE = 128;

/**
 * How far the player walks before the drawn part of the scatter is chosen again (P2-43 final
 * review, I4), in meters. What is drawn is chosen within `DRAW_DISTANCE - RESELECT` of where the
 * choice was made, so nothing drawn is ever farther than `DRAW_DISTANCE` from the player: that is
 * where the ground is drawn at full detail, and past it a tree would stand over coarser ground.
 */
export const RESELECT = 8;

/** Instances within `radius` meters of a point across the ground, in their order. */
function within(instances: readonly ItemInstance[], x: number, z: number, radius: number): ItemInstance[] {
  const r2 = radius * radius;
  return instances.filter((instance) => {
    const [ix, , iz] = instance.transform.position;
    return (ix - x) ** 2 + (iz - z) ** 2 <= r2;
  });
}

/**
 * The part of the worked-out scatter to draw around a point (P2-43 final review, I4): the ring of
 * chunks `ScatterView` keeps reaches much farther than the draw distance (it is a cache), so only
 * what stands within it, less the reselect step, goes to `ItemsView`.
 */
export function drawnScatter(instances: readonly ItemInstance[], x: number, z: number): ItemInstance[] {
  return within(instances, x, z, DRAW_DISTANCE - RESELECT);
}

/** Whether the player walked far enough from where the drawn scatter was chosen to choose again. */
export function needsReselect(last: { x: number; z: number } | null, x: number, z: number): boolean {
  return !last || Math.hypot(x - last.x, z - last.z) > RESELECT;
}

/**
 * True where something built stands over the ground at x, z (P2-43): a room floor, a bridge deck
 * or the top of a solid item, taken from the rest law's surface index. Water is not "built": the
 * index counts it as a surface, so what is under the point is compared with the higher of the
 * ground and the water, and a lake never blocks its own shore (scatter keeps out of water itself).
 */
export function builtOver(surfaces: Pick<SurfaceIndex, 'below' | 'options'>, x: number, z: number): boolean {
  const { groundAt, waterAt } = surfaces.options;
  const base = Math.max(groundAt(x, z), waterAt?.(x, z) ?? -Infinity);
  return surfaces.below(x, z, Infinity) > base + 0.05;
}

/**
 * Where an item stands before `command` moves or removes it, as a `place_item` of its current
 * transform, read from `doc` before the command is applied (P2-43). Remote commands come without
 * an inverse; this stands in for it so `scatterChunksAfter` also regrows the spot the item left.
 * Any other command is its own stand-in (it adds no old spot).
 */
export function preImage(doc: WorldDocument, command: CommandPayload): CommandPayload {
  if (command.type !== 'transform_item' && command.type !== 'remove_item') return command;
  const before = doc.instances.find((i) => i.instanceId === command.params.instanceId);
  if (!before) return command;
  return {
    type: 'place_item',
    params: {
      instanceId: before.instanceId,
      itemId: before.itemId,
      position: [...before.transform.position],
      rotation: [...before.transform.rotation],
      scale: [...before.transform.scale],
    },
  };
}

/**
 * The chunks whose scatter must be worked out again after these commands (P2-43): where an item
 * stood before and stands now, as far as it reaches, or `'all'` after a change to floors, decks
 * or water. `reach` is how far an item reaches from its pivot across the ground, in meters.
 */
export function scatterChunksAfter(
  steps: ReadonlyArray<{ applied: CommandPayload; result: { inverse: CommandPayload } }>,
  doc: WorldDocument,
  chunkSize: number,
  reach: (itemId: string, scale: readonly number[]) => number,
): Set<string> | 'all' {
  const keys = new Set<string>();
  const cover = (itemId: string, position: readonly number[], scale: readonly number[]) => {
    const r = reach(itemId, scale);
    const [x, , z] = position as [number, number, number];
    for (let cx = Math.floor((x - r) / chunkSize); cx <= Math.floor((x + r) / chunkSize); cx += 1)
      for (let cz = Math.floor((z - r) / chunkSize); cz <= Math.floor((z + r) / chunkSize); cz += 1)
        keys.add(`${cx},${cz}`);
  };
  for (const { applied, result } of steps) {
    if (REBUILDS_SURFACES.has(applied.type)) return 'all';
    for (const command of [applied, result.inverse]) {
      if (command.type === 'place_item')
        cover(command.params.itemId, command.params.position, command.params.scale ?? [1, 1, 1]);
      else if (command.type === 'transform_item') {
        const now = doc.instances.find((i) => i.instanceId === command.params.instanceId);
        if (now)
          cover(
            now.itemId,
            command.params.position ?? now.transform.position,
            command.params.scale ?? now.transform.scale,
          );
      }
    }
  }
  return keys;
}

export class ScatterView {
  readonly #byChunk = new Map<string, ItemInstance[]>();
  #layers: ScatterLayer[] = [];
  #near: string | null = null;
  #settings = '';
  #flat: ItemInstance[] = [];
  #on = true;

  constructor(
    private readonly terrain: TerrainData,
    private readonly ground: ScatterGround,
    /** `blocked(x, z)`: spots where something is built over the ground (P2-43). */
    private readonly options: ScatterOptions = {},
  ) {}

  /** Everything standing around the player now. */
  get instances(): readonly ItemInstance[] {
    return this.#flat;
  }

  /**
   * What is already worked out (`update`) within `radius` meters of a point, read-only (P2-43):
   * the world checks ask this for the woods and painted cover near the player, without triggering
   * more chunks to be built.
   */
  instancesNear(x: number, z: number, radius = DRAW_DISTANCE): readonly ItemInstance[] {
    return within(this.#flat, x, z, radius);
  }

  /** Off for places with no starter world, and on phones that cannot afford it. */
  setEnabled(on: boolean): void {
    if (this.#on === on) return;
    this.#on = on;
    this.#byChunk.clear();
    this.#near = null;
    this.#flat = [];
  }

  /** The ground changed here, so whatever stood on it is worked out again. */
  groundChanged(keys: Iterable<string>): void {
    for (const key of keys) this.#byChunk.delete(key);
    this.#near = null;
  }

  /** Everything is worked out again: a new world, or the World tab's settings changed. */
  clear(): void {
    this.#byChunk.clear();
    this.#near = null;
    this.#flat = [];
  }

  /**
   * Fills in the ground around a point. Returns true when what stands there changed, so the
   * caller only hands `ItemsView` a new list when there is a new one.
   */
  update(doc: WorldDocument, x: number, z: number): boolean {
    const world = doc.terrain.world;
    if (!this.#on || !world) {
      if (this.#flat.length === 0) return false;
      this.clear();
      return true;
    }
    // The World tab's woods switch and density (P2-40 task 5). Painted cover is not touched by it:
    // turning the woods off must not rub out what the creator painted by hand.
    const woods = doc.style.woods ?? { on: true, density: 1 };
    const layer = woodsOf(world.kind);
    this.#layers = [
      ...(woods.on ? [{ ...layer, density: layer.density * woods.density }] : []),
      COVER_LAYERS.plants,
      COVER_LAYERS.pebbles,
    ];
    // A changed setting, or a different world, means everything standing has to be worked out
    // again; without this the ring only rebuilds when the player walks into another chunk.
    const settings = `${world.seed},${world.kind},${woods.on},${woods.density}`;
    if (settings !== this.#settings) {
      this.#settings = settings;
      this.clear();
    }
    const size = this.terrain.chunkSize;
    // Floor, not round: 160/64 rounds back up to the three chunks this was meant to replace,
    // which is how the first attempt at this changed nothing at all.
    const radius = Math.max(1, Math.floor(DRAW_DISTANCE / size));
    const cx = Math.floor(x / size);
    const cz = Math.floor(z / size);
    const near = `${cx},${cz}`;
    if (near === this.#near) return false;
    this.#near = near;

    const wanted: string[] = [];
    for (let dz = -radius; dz <= radius; dz += 1)
      for (let dx = -radius; dx <= radius; dx += 1) {
        const key = `${cx + dx},${cz + dz}`;
        wanted.push(key);
        if (!this.#byChunk.has(key)) this.#byChunk.set(key, this.#build(doc, cx + dx, cz + dz));
      }
    // Ground the player has walked away from is dropped, so this never grows without bound.
    const keep = new Set(wanted);
    for (const key of [...this.#byChunk.keys()]) if (!keep.has(key)) this.#byChunk.delete(key);

    this.#flat = wanted.flatMap((key) => this.#byChunk.get(key) ?? []);
    return true;
  }

  #build(doc: WorldDocument, cx: number, cz: number): ItemInstance[] {
    const world = doc.terrain.world!;
    const out: ItemInstance[] = [];
    for (const layer of this.#layers) {
      for (const thing of scatterInChunk(this.ground, world, layer, this.terrain, cx, cz, this.options)) {
        // The id says where it came from, so it is stable between frames and can never be
        // mistaken for something the creator placed.
        const id = `scatter:${layer.id}:${thing.x.toFixed(2)},${thing.z.toFixed(2)}`;
        out.push({
          instanceId: id,
          itemId: thing.itemId,
          transform: {
            position: [thing.x, thing.y, thing.z],
            rotation: [0, Math.sin(thing.yaw / 2), 0, Math.cos(thing.yaw / 2)],
            scale: [thing.scale, thing.scale, thing.scale],
          },
          params: {},
          locked: true,
        });
      }
    }
    return out;
  }
}
