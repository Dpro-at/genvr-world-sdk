import type { ItemInstance, WorldDocument } from '@genvr/contracts';
import { insidePolygon, worldBox, type FloorSurface, type Vec3 } from '../geometry.js';
import type { WorldEnvironment } from '../world-checks.js';
import type { RestShape } from './rest.js';

/** What lies over the ground apart from items: room floors, bridge decks and water. */
export interface SurfaceLayers {
  waterAt?(x: number, z: number): number | null;
  floors?: readonly FloorSurface[];
  decks?: readonly FloorSurface[];
}

export interface SurfaceOptions extends SurfaceLayers {
  groundAt(x: number, z: number): number;
  itemShape: WorldEnvironment['itemShape'];
  /**
   * The rest law's shape of an item type (P2-43 final review): when it gives a `base` (a tree's
   * trunk), only the base carries things, so a canopy is never a floor and never keeps scatter out.
   */
  restShape?(itemId: string): RestShape | null;
}

interface Box {
  id: string;
  min: readonly number[];
  max: readonly number[];
  cells: string[];
}

/** Grid cell size for finding items under a point (meters). */
const CELL = 4;

/**
 * What is under a point, from the world document alone (P2-43): ground, water, room floors,
 * bridge decks and the tops of solid items. The server, the studio and the validator all ask this
 * one index, so they always agree about where a thing rests.
 */
export class SurfaceIndex {
  readonly #cells = new Map<string, Box[]>();
  readonly #boxes = new Map<string, Box>();
  /** Floors and decks together, built once per layer change rather than on every `below`. */
  #flat: readonly FloorSurface[] = [];
  readonly options: SurfaceOptions;

  constructor(doc: WorldDocument, options: SurfaceOptions) {
    this.options = { ...options };
    this.#flat = [...(options.floors ?? []), ...(options.decks ?? [])];
    for (const instance of doc.instances) this.update(instance, instance.instanceId);
  }

  /**
   * New floors, decks or water (P2-43 final review, I6): the ground under a room, a bridge or a
   * river changed, so what stands on it changed too, but no item moved, so the item grid stays.
   */
  setLayers(layers: SurfaceLayers): void {
    const options = this.options as { -readonly [K in keyof SurfaceOptions]: SurfaceOptions[K] };
    if ('floors' in layers) options.floors = layers.floors;
    if ('decks' in layers) options.decks = layers.decks;
    if ('waterAt' in layers) options.waterAt = layers.waterAt;
    this.#flat = [...(options.floors ?? []), ...(options.decks ?? [])];
  }

  update(instance: ItemInstance | null, instanceId: string): void {
    const old = this.#boxes.get(instanceId);
    if (old)
      for (const key of old.cells) {
        const list = this.#cells.get(key)!;
        list.splice(list.indexOf(old), 1);
      }
    this.#boxes.delete(instanceId);
    const shape = instance && this.options.itemShape(instance.itemId);
    if (!instance || !shape?.solid) return;
    // Only the base carries things when the law gives one (a tree's trunk, not its canopy).
    const base = this.options.restShape?.(instance.itemId)?.rule.base;
    const footprint = base
      ? {
          ...shape,
          min: [base.min[0], shape.min[1], base.min[1]] as Vec3,
          max: [base.max[0], shape.max[1], base.max[1]] as Vec3,
        }
      : shape;
    const { min, max } = worldBox(instance, footprint);
    const cells: string[] = [];
    for (let x = Math.floor(min[0] / CELL); x <= Math.floor(max[0] / CELL); x++)
      for (let z = Math.floor(min[2] / CELL); z <= Math.floor(max[2] / CELL); z++) cells.push(`${x},${z}`);
    const box: Box = { id: instanceId, min, max, cells };
    this.#boxes.set(instanceId, box);
    for (const key of cells) {
      const list = this.#cells.get(key) ?? [];
      list.push(box);
      this.#cells.set(key, list);
    }
  }

  /**
   * The highest surface under x, z at or below `fromY`. `bed` skips the water surface, so an item
   * that belongs under water (sea life) finds the seabed, floors and items below the water.
   */
  below(x: number, z: number, fromY: number, ignore?: string, bed = false): number {
    const o = this.options;
    let best = bed ? o.groundAt(x, z) : Math.max(o.groundAt(x, z), o.waterAt?.(x, z) ?? -Infinity);
    for (const surface of this.#flat)
      if (surface.level <= fromY && surface.level > best && insidePolygon(x, z, surface.points))
        best = surface.level;
    for (const box of this.#cells.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) ?? []) {
      if (box.id === ignore || box.max[1]! > fromY || box.max[1]! <= best) continue;
      if (x >= box.min[0]! && x <= box.max[0]! && z >= box.min[2]! && z <= box.max[2]!) best = box.max[1]!;
    }
    return best;
  }
}
