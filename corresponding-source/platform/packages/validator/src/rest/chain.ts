import type { CommandPayload, ItemInstance, WorldDocument } from '@genvr/contracts';
import { worldBox } from '../geometry.js';
import { asBoxShape } from './box-shape.js';
import type { Rect } from './region.js';
import { defaultFromY, followsSupport, rest, type RestShape } from './rest.js';
import type { SurfaceIndex } from './surface-index.js';

export interface ChainResult {
  commands: CommandPayload[];
  truncated: boolean;
}

/** Below this, a move is rounding noise, not a real change (meters). */
const MOVE = 0.01;
/** How far below a mover's old top a candidate's base may sit and still count as "on it" (meters). */
const LIFT_TOLERANCE = 0.05;

type Box3 = { min: readonly number[]; max: readonly number[] };

/**
 * The world box, with a fast path for the common case of no rotation (P2-43 task 6 performance):
 * `worldBox` turns 8 local corners through the quaternion and takes their min/max, which is exact
 * for a tilted item but needless arithmetic for an upright one, and settling a whole neighbourhood
 * calls this for every instance in it.
 */
function boxOf(instance: ItemInstance, shape: RestShape): Box3 {
  const { position, rotation, scale } = instance.transform;
  if (rotation[0] === 0 && rotation[1] === 0 && rotation[2] === 0 && rotation[3] === 1)
    return {
      min: [
        position[0] + shape.min[0]! * scale[0]!,
        position[1] + shape.min[1]! * scale[1]!,
        position[2] + shape.min[2]! * scale[2]!,
      ],
      max: [
        position[0] + shape.max[0]! * scale[0]!,
        position[1] + shape.max[1]! * scale[1]!,
        position[2] + shape.max[2]! * scale[2]!,
      ],
    };
  return worldBox(instance, asBoxShape(shape));
}

function rectOf(box: Box3): Rect {
  return [box.min[0]!, box.min[2]!, box.max[0]!, box.max[2]!];
}

function rectOfPoints(points: ReadonlyArray<readonly [number, number]>): Rect {
  return [
    Math.min(...points.map((p) => p[0])),
    Math.min(...points.map((p) => p[1])),
    Math.max(...points.map((p) => p[0])),
    Math.max(...points.map((p) => p[1])),
  ];
}

const overlaps = (a: Rect, b: Rect) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

/** Where two lines (point + direction) cross; falls back to `p1` for parallel lines (shouldn't occur here). */
function intersectLines(
  p1: readonly [number, number],
  d1: readonly [number, number],
  p2: readonly [number, number],
  d2: readonly [number, number],
): [number, number] {
  const denom = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(denom) < 1e-9) return [p1[0], p1[1]];
  const t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / denom;
  return [p1[0] + d1[0] * t, p1[1] + d1[1] * t];
}

/**
 * Grows a convex polygon outward by `distance` measured perpendicular to each edge (review round
 * 1, MINOR: the old code moved each vertex outward from the centroid by `distance`, which for a
 * rectangle grows the corners more than the edges — this is a proper offset: each edge's own line
 * is pushed out along its outward normal, and the new vertices are where consecutive pushed edges
 * cross, so every edge really does move out by exactly `distance`).
 */
function offsetPolygon(
  points: ReadonlyArray<readonly [number, number]>,
  distance: number,
): Array<[number, number]> {
  const n = points.length;
  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const [x1, z1] = points[i]!;
    const [x2, z2] = points[(i + 1) % n]!;
    area2 += x1 * z2 - x2 * z1;
  }
  const ccw = area2 > 0;
  const edges: Array<{ p: [number, number]; d: [number, number] }> = [];
  for (let i = 0; i < n; i++) {
    const [x1, z1] = points[i]!;
    const [x2, z2] = points[(i + 1) % n]!;
    const len = Math.hypot(x2 - x1, z2 - z1) || 1;
    const ux = (x2 - x1) / len;
    const uz = (z2 - z1) / len;
    const [nx, nz] = ccw ? [uz, -ux] : [-uz, ux];
    edges.push({ p: [x1 + nx * distance, z1 + nz * distance], d: [ux, uz] });
  }
  return points.map((_, i) => {
    const a = edges[(i - 1 + n) % n]!;
    const b = edges[i]!;
    return intersectLines(a.p, a.d, b.p, b.d);
  });
}

/** Grid cell size for finding what overlaps an item's old footprint (meters; matches SurfaceIndex). */
const CELL = 4;

const cellsOf = (rect: Rect): string[] => {
  const cells: string[] = [];
  for (let x = Math.floor(rect[0] / CELL); x <= Math.floor(rect[2] / CELL); x++)
    for (let z = Math.floor(rect[1] / CELL); z <= Math.floor(rect[3] / CELL); z++) cells.push(`${x},${z}`);
  return cells;
};

/**
 * Which instances could overlap a rect, without scanning every instance in the document (P2-43
 * task 6 performance): a grid keyed the same way as `SurfaceIndex`, rebuilt lazily as items move.
 */
class SpatialGrid {
  readonly #cells = new Map<string, string[]>();
  readonly #cellsOfId = new Map<string, string[]>();

  set(id: string, rect: Rect): void {
    this.delete(id);
    const cells = cellsOf(rect);
    this.#cellsOfId.set(id, cells);
    for (const key of cells) {
      const list = this.#cells.get(key);
      if (list) list.push(id);
      else this.#cells.set(key, [id]);
    }
  }

  delete(id: string): void {
    const cells = this.#cellsOfId.get(id);
    if (!cells) return;
    for (const key of cells) {
      const list = this.#cells.get(key);
      const i = list?.indexOf(id) ?? -1;
      if (list && i >= 0) list.splice(i, 1);
    }
    this.#cellsOfId.delete(id);
  }

  /** Ids near a rect, deduplicated only when the rect spans more than one cell (the common case). */
  near(rect: Rect): readonly string[] {
    const cells = cellsOf(rect);
    if (cells.length === 1) return this.#cells.get(cells[0]!) ?? [];
    const seen = new Set<string>();
    const found: string[] = [];
    for (const key of cells)
      for (const id of this.#cells.get(key) ?? []) {
        if (seen.has(id)) continue;
        seen.add(id);
        found.push(id);
      }
    return found;
  }
}

const normalizeQuat = (q: readonly number[]): [number, number, number, number] => {
  const len = Math.hypot(q[0]!, q[1]!, q[2]!, q[3]!) || 1;
  return [q[0]! / len, q[1]! / len, q[2]! / len, q[3]! / len];
};

/**
 * Whether two rotations are the same one, up to the 1e-6 rounding `rest` does and the q/-q sign
 * ambiguity of a quaternion: not the human resting tolerance in `isResting` (half a degree — far
 * looser than intended here). Review round 1 tried `|dot| > 1 - 1e-9` on the raw components, which
 * was still too tight: rounding each of the four components independently to 1e-6 (what `rest`
 * does) makes the stored quaternion slightly non-unit, and comparing an un-normalized dot product
 * against a threshold this tight is really measuring that quantization noise, not the angle
 * between the rotations — it flipped 107 of 199 unmoved yawed lamps to a spurious
 * `transform_item`. Review round 2: normalize both quaternions first (removing the magnitude
 * noise the rounding introduced), then the *real* remaining noise — from `yawOf` reading an angle
 * back out via `atan2` and rebuilding sin/cos from it — is small enough that `1 - |dot| < 1e-9` is
 * both safe and tight again.
 */
function sameRotation(a: readonly number[], b: readonly number[]): boolean {
  const na = normalizeQuat(a);
  const nb = normalizeQuat(b);
  const dot = Math.abs(na[0] * nb[0] + na[1] * nb[1] + na[2] * nb[2] + na[3] * nb[3]);
  return 1 - dot < 1e-9;
}

/** Which items in a region rest by the law now, before a change (P2-43). */
export function restingBefore(
  doc: WorldDocument,
  region: Rect[] | 'all',
  shapeOf: (itemId: string) => RestShape | null,
  surfaces: SurfaceIndex,
): Map<string, boolean> {
  const resting = new Map<string, boolean>();
  for (const instance of doc.instances) {
    const shape = shapeOf(instance.itemId);
    if (!shape) continue;
    if (region !== 'all' && !region.some((r) => overlaps(r, rectOf(boxOf(instance, shape))))) continue;
    resting.set(instance.instanceId, followsSupport(instance, shape, surfaces));
  }
  return resting;
}

/** Ascending by height, then instance id, so the order is deterministic (small binary heap). */
class Frontier {
  readonly #heap: Array<{ id: string; y: number }> = [];

  #less(a: { id: string; y: number }, b: { id: string; y: number }): boolean {
    return a.y < b.y || (a.y === b.y && a.id < b.id);
  }

  push(id: string, y: number): void {
    const heap = this.#heap;
    heap.push({ id, y });
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.#less(heap[i]!, heap[parent]!)) break;
      [heap[i], heap[parent]] = [heap[parent]!, heap[i]!];
      i = parent;
    }
  }

  pop(): string | undefined {
    const heap = this.#heap;
    if (heap.length === 0) return undefined;
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = i * 2 + 2;
        let smallest = i;
        if (l < heap.length && this.#less(heap[l]!, heap[smallest]!)) smallest = l;
        if (r < heap.length && this.#less(heap[r]!, heap[smallest]!)) smallest = r;
        if (smallest === i) break;
        [heap[smallest], heap[i]] = [heap[i]!, heap[smallest]!];
        i = smallest;
      }
    }
    return top.id;
  }
}

/**
 * Rests again, lowest first, every item that rested before the change (P2-43). When an item
 * moves, the items over its old place are checked first (while it is still where it was), so a
 * lamp on a table on a platform follows all of them: each candidate resting on something that
 * rose gets a `lift` added to the height `rest` searches down from (controller ruling, amended in
 * review round 1: `lift[c] = max(lift[c], dy)` — `dy` alone, since a level's own `dy` already
 * reflects every lift below it through the search it did with its own already-lifted `fromY`;
 * adding the mover's `lift` again double-counted and could search past a real, lower support all
 * the way up to something merely floating above). Items placed in the air on purpose, and
 * floating ones, are never touched (their `resting` entry is false). A `grade` item also re-queues
 * whatever rested, before the grade, in the blended ring around its base (review round 1,
 * IMPORTANT 1), even if that neighbour was outside the region the caller judged `resting` from,
 * because the grade's own blend can move ground under it that the triggering command never
 * touched.
 */
export function settleChain(
  doc: WorldDocument,
  shapeOf: (itemId: string) => RestShape | null,
  surfaces: SurfaceIndex,
  resting: Map<string, boolean>,
  apply: (command: CommandPayload) => void,
  limits = { levels: 16, items: 2000 },
  options?: {
    /**
     * Asked before a re-rested `grade` item levels its ground (P2-43 final review): true means the
     * caller grades it later (once, when a sculpt drag ends), so this pass only rests it on the
     * ground as it is and neither levels nor re-queues its blend ring.
     */
    deferGrade?: (instanceId: string) => boolean;
  },
): ChainResult {
  const commands: CommandPayload[] = [];
  const instanceById = new Map(doc.instances.map((i) => [i.instanceId, i] as const));
  const depth = new Map<string, number>();
  const lift = new Map<string, number>();
  const done = new Set<string>();
  const box3 = new Map<string, Box3>();
  const grid = new SpatialGrid();
  const boxFor = (instance: ItemInstance): Box3 | null => {
    const cached = box3.get(instance.instanceId);
    if (cached) return cached;
    const shape = shapeOf(instance.itemId);
    if (!shape) return null;
    const box = boxOf(instance, shape);
    box3.set(instance.instanceId, box);
    grid.set(instance.instanceId, rectOf(box));
    return box;
  };
  for (const instance of doc.instances) boxFor(instance);
  /** The bottom of the item's own box, not its transform pivot (review round 1, MINOR): a shape
   * whose local origin isn't at its base (an item with `lowest !== 0`) would otherwise be ordered
   * by a height that isn't where it actually rests. */
  const bottomOf = (instance: ItemInstance): number =>
    boxFor(instance)?.min[1] ?? instance.transform.position[1];

  const frontier = new Frontier();
  for (const [id, was] of resting) {
    if (!was) continue;
    const instance = instanceById.get(id);
    if (!instance) continue;
    depth.set(id, 0);
    frontier.push(id, bottomOf(instance));
  }

  /** How many times a `grade`'s blend has pulled a given item back onto the frontier (review round
   * 2, MINOR): once two graded items' blends overlap each other, each can re-queue the other every
   * time it moves, so without a cap the pair can trade re-settles indefinitely. */
  const requeueCount = new Map<string, number>();
  const REQUEUE_LIMIT = 4;
  const requeue = (other: ItemInstance, fromId: string): void => {
    const count = requeueCount.get(other.instanceId) ?? 0;
    if (count >= REQUEUE_LIMIT) return;
    requeueCount.set(other.instanceId, count + 1);
    resting.set(other.instanceId, true);
    done.delete(other.instanceId);
    const d = (depth.get(fromId) ?? 0) + 1;
    const prior = depth.get(other.instanceId);
    depth.set(other.instanceId, prior === undefined ? d : Math.min(prior, d));
    frontier.push(other.instanceId, bottomOf(other));
  };

  let truncated = false;
  /** Every attempt to settle an item, including re-settles from `requeue` (review round 2, MINOR):
   * `done.size` alone doesn't count those, since a re-queue clears the item's own `done` flag. */
  let totalProcessed = 0;
  for (;;) {
    let id = frontier.pop();
    while (id !== undefined && done.has(id)) id = frontier.pop();
    if (id === undefined) break;
    // review round 1, MINOR: 16 levels really means depths 0..15 (16 of them), so the cutoff is
    // `>=`, not `>` (which let a 17th level through).
    if (totalProcessed >= limits.items || (depth.get(id) ?? 0) >= limits.levels) {
      truncated = true;
      break;
    }
    const next = instanceById.get(id);
    if (!next) continue;
    done.add(id);
    totalProcessed++;
    const shape = shapeOf(next.itemId);
    if (!shape) continue;

    const fromY = defaultFromY(next, shape) + (lift.get(id) ?? 0);
    const result = rest(next, shape, surfaces, undefined, undefined, { fromY });
    const oldY = next.transform.position[1];
    if (Math.abs(result.position[1] - oldY) < MOVE && sameRotation(next.transform.rotation, result.rotation))
      continue;

    // What stands on this item is judged while the item is still where it was.
    const oldBox = boxFor(next)!;
    const oldRect = rectOf(oldBox);
    const oldTop = oldBox.max[1]!;
    const dy = result.position[1] - oldY;
    for (const otherId of grid.near(oldRect)) {
      if (otherId === id) continue;
      const other = instanceById.get(otherId);
      if (!other) continue;
      const otherBox = boxFor(other);
      if (!otherBox || !overlaps(oldRect, rectOf(otherBox))) continue;
      // `dy` alone (controller ruling, amended in review round 1) — see the function doc.
      if (dy > 0 && otherBox.min[1]! >= oldTop - LIFT_TOLERANCE)
        lift.set(other.instanceId, Math.max(lift.get(other.instanceId) ?? 0, dy));
      if (!resting.has(other.instanceId)) {
        const otherShape = shapeOf(other.itemId)!;
        const isRestingNow = followsSupport(other, otherShape, surfaces);
        resting.set(other.instanceId, isRestingNow);
        const d = (depth.get(id) ?? 0) + 1;
        depth.set(other.instanceId, d);
        if (isRestingNow) frontier.push(other.instanceId, bottomOf(other));
      }
    }

    const command: CommandPayload = {
      type: 'transform_item',
      params: { instanceId: id, position: result.position, rotation: result.rotation },
    };
    apply(command);
    box3.delete(id);
    grid.delete(id);
    // review round 2, IMPORTANT (I1): re-index the item at its new box rather than just dropping
    // it — a later grade's blend check (`grid.near` below) has to be able to find it where it now
    // is, or a second grade whose blend reaches back over an already-moved neighbour can silently
    // change the ground under it without ever re-settling it.
    boxFor(next);
    commands.push(command);
    if (result.grade && !options?.deferGrade?.(id)) {
      // review round 1, IMPORTANT 1: judge the blend ring against the surfaces as they stand right
      // now — before either of the grade's own sculpt_terrain commands runs — so a neighbour that
      // genuinely rested a moment ago is caught even if it never was in the caller's `resting` map
      // (its region might not have reached this far) and even if this chain already marked it
      // `done` for an unrelated reason earlier in the same pass.
      const grownRect = rectOfPoints(offsetPolygon(result.grade.area, BLEND));
      for (const otherId of grid.near(grownRect)) {
        if (otherId === id) continue;
        const other = instanceById.get(otherId);
        if (!other) continue;
        const otherShape = shapeOf(other.itemId);
        const otherBox = otherShape && boxFor(other);
        if (!otherShape || !otherBox || !overlaps(grownRect, rectOf(otherBox))) continue;
        if (followsSupport(other, otherShape, surfaces)) requeue(other, id);
      }
      for (const flatten of gradeCommands(result.grade)) {
        apply(flatten);
        commands.push(flatten);
      }
    }
  }
  return { commands, truncated };
}

/** How far past a graded base the levelled ground blends back into the natural ground (meters). */
const BLEND = 3;

/**
 * Level the ground under a graded base, and blend it into the ground around (P2-43): first a soft
 * flatten over the base grown by `BLEND` (full in the middle, fading to nothing at its edge), then
 * a hard flatten over the base itself, so the base is exactly level and the edge is a slope.
 */
export function gradeCommands(grade: { area: Array<[number, number]>; level: number }): CommandPayload[] {
  const grown = offsetPolygon(grade.area, BLEND);
  return [
    {
      type: 'sculpt_terrain',
      params: { area: grown, operation: 'flatten', strength: 1, targetHeight: grade.level, soft: true },
    },
    {
      type: 'sculpt_terrain',
      params: { area: grade.area, operation: 'flatten', strength: 1, targetHeight: grade.level },
    },
  ];
}
