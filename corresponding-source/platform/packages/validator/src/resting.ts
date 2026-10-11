import type { WorldDocument } from '@genvr/contracts';
import type { FloorSurface } from './document-environment.js';
import { worldBox, type WorldEnvironment } from './world-checks.js';

export interface RestingOptions {
  groundAt: WorldEnvironment['groundAt'];
  itemShape: WorldEnvironment['itemShape'];
  floors?: readonly FloorSurface[];
}

/** Free height a spot needs to count as a place to stand something (meters). */
const HEADROOM = 1.5;

function insidePolygon(x: number, z: number, points: FloorSurface['points']): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, zi] = points[i]!;
    const [xj, zj] = points[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Where a new item stands at x, z (P2-11, docs/ENGINE-RULES.md "new items settle onto the
 * nearest supporting surface"): the ground, or a room's floor, and when building parts or grid
 * blocks fill that spot, on top of them (never inside a platform or a block wall). A ceiling
 * higher than the headroom does not count, so things in a room stay on its floor. With `on`, the
 * item stands on top of that placed item (a lamp on a table), at x, z when the point is over it,
 * otherwise at its middle. Returns null when `on` names no known item.
 */
export function restingPoint(
  doc: WorldDocument,
  options: RestingOptions,
  x: number,
  z: number,
  on?: string,
): [number, number, number] | null {
  if (on) {
    const target = doc.instances.find((instance) => instance.instanceId === on);
    const shape = target && options.itemShape(target.itemId);
    if (!target || !shape) return null;
    const { min, max } = worldBox(target, shape);
    const over = x >= min[0] && x <= max[0] && z >= min[2] && z <= max[2];
    return over ? [x, max[1], z] : [(min[0] + max[0]) / 2, max[1], (min[2] + max[2]) / 2];
  }
  let y = options.groundAt(x, z);
  for (const floor of options.floors ?? [])
    if (floor.level > y && insidePolygon(x, z, floor.points)) y = floor.level;
  const parts: Array<{ bottom: number; top: number }> = [];
  for (const instance of doc.instances) {
    const shape = options.itemShape(instance.itemId);
    if (!shape?.part || !shape.solid) continue;
    const { min, max } = worldBox(instance, shape);
    if (x >= min[0] && x <= max[0] && z >= min[2] && z <= max[2]) parts.push({ bottom: min[1], top: max[1] });
  }
  // Climb while a part fills the space just above the current surface.
  for (let step = 0; step < 64; step++) {
    const blocking = parts.filter((part) => part.bottom < y + HEADROOM && part.top > y + 0.01);
    if (blocking.length === 0) break;
    y = Math.max(...blocking.map((part) => part.top));
  }
  return [x, y, z];
}
