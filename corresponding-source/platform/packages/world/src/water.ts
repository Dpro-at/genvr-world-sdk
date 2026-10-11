import { insidePolygon, type TerrainData } from './terrain-data.js';

type Point = [number, number];

export const WATER_FILL = {
  /** How far from the tap the fill may spread (a basin larger than this is capped). */
  maxRadius: 48,
  /** Minimum depth for a fill to count as a pond (flat ground has no basin). */
  minDepth: 0.3,
  /** Water sits this far below the spill point so it never looks like it overflows. */
  freeboard: 0.05,
} as const;

/** Min-heap keyed by number (small, no dependencies). */
class Heap<T> {
  readonly #items: Array<{ key: number; value: T }> = [];

  get size() {
    return this.#items.length;
  }

  push(key: number, value: T) {
    const items = this.#items;
    items.push({ key, value });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent]!.key <= items[i]!.key) break;
      [items[parent], items[i]] = [items[i]!, items[parent]!];
      i = parent;
    }
  }

  pop(): { key: number; value: T } | undefined {
    const items = this.#items;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0 && last) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && items[l]!.key < items[m]!.key) m = l;
        if (r < items.length && items[r]!.key < items[m]!.key) m = r;
        if (m === i) break;
        [items[m], items[i]] = [items[i]!, items[m]!];
        i = m;
      }
    }
    return top;
  }
}

/** Convex hull (monotone chain) of points on the ground plane, counter-clockwise. */
export function convexHull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const cross = (o: Point, a: Point, b: Point) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0)
      upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/**
 * Plans filling the basin around a tapped spot with water: the water rises until it would spill
 * over the lowest point of the rim (priority flood). Returns the water level and an outline that
 * covers the flooded ground, or null when there is no basin (flat or sloping ground).
 */
export function planWaterFill(
  terrain: TerrainData,
  x: number,
  z: number,
): { level: number; area: Point[] } | null {
  const sp = terrain.spacing;
  const g0: Point = [Math.round(x / sp), Math.round(z / sp)];
  const height = (gx: number, gz: number) => terrain.vertexHeight(gx * sp, gz * sp);
  const start = height(g0[0], g0[1]);
  const limit = WATER_FILL.maxRadius / sp;
  const key = (gx: number, gz: number) => `${gx},${gz}`;

  const heap = new Heap<Point>();
  const seen = new Set<string>([key(g0[0], g0[1])]);
  const popped: Array<{ point: Point; ground: number }> = [];
  heap.push(start, g0);
  let spill = Infinity;
  while (heap.size > 0) {
    const { key: level, value: point } = heap.pop()!;
    const [gx, gz] = point;
    // Reached the edge of the search area (or the world): the water escapes at this level.
    if (
      Math.hypot(gx - g0[0], gz - g0[1]) > limit ||
      Math.abs(gx * sp) >= terrain.half ||
      Math.abs(gz * sp) >= terrain.half
    ) {
      spill = level;
      break;
    }
    popped.push({ point, ground: height(gx, gz) });
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const n: Point = [gx + dx, gz + dz];
      const k = key(n[0], n[1]);
      if (seen.has(k)) continue;
      seen.add(k);
      heap.push(Math.max(level, height(n[0], n[1])), n);
    }
  }
  if (!Number.isFinite(spill)) return null;
  const level = spill - WATER_FILL.freeboard;
  if (level - start < WATER_FILL.minDepth) return null;

  // Flooded ground: vertices below the water level that the flood reached.
  const flooded = popped.filter((p) => p.ground < level).map((p) => p.point);
  const outline: Point[] = [];
  for (const [gx, gz] of flooded) {
    // Grow each flooded vertex by one cell so the water reaches the shore.
    for (const [dx, dz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const) {
      outline.push([(gx + dx) * sp, (gz + dz) * sp]);
    }
  }
  const area = convexHull(outline).map(([px, pz]) => [
    Math.max(-terrain.half, Math.min(terrain.half, px)),
    Math.max(-terrain.half, Math.min(terrain.half, pz)),
  ]) as Point[];
  return area.length >= 3 ? { level: Math.round(level * 1000) / 1000, area } : null;
}

/** Outline of a circle (for brushes and ponds), as a polygon with `sides` corners. */
export function circleArea(x: number, z: number, radius: number, sides = 16): Point[] {
  return Array.from({ length: sides }, (_, i) => {
    const a = (i / sides) * Math.PI * 2;
    return [
      Math.round((x + Math.cos(a) * radius) * 100) / 100,
      Math.round((z + Math.sin(a) * radius) * 100) / 100,
    ];
  });
}

/**
 * Water surface height at a point, or null where there is no water above the ground there
 * (used for swimming and, later, buoyancy).
 */
export function waterSurfaceAt(
  water: ReadonlyArray<{ level: number; area: ReadonlyArray<readonly [number, number]> }>,
  terrain: TerrainData,
  x: number,
  z: number,
  /** The place's sea level (P2-39), which covers everywhere the ground is below it. */
  sea: number | null = null,
): number | null {
  const ground = terrain.heightAt(x, z);
  // The sea has no shape of its own: it is water wherever the ground lies under its level.
  let surface: number | null = sea !== null && sea > ground ? sea : null;
  for (const body of water) {
    if (body.level <= ground || (surface !== null && body.level <= surface)) continue;
    if (insidePolygon(x, z, body.area)) surface = body.level;
  }
  return surface;
}
