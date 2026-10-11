import type { ItemInstance } from '@genvr/contracts';
import type { WorldEnvironment } from './world-checks.js';

export type Vec3 = [number, number, number];

/** Rotates a vector by a quaternion [x, y, z, w]. */
export function rotate([x, y, z]: Vec3, q: readonly number[]): Vec3 {
  const [qx = 0, qy = 0, qz = 0, qw = 1] = q;
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  return [
    x + qw * tx + (qy * tz - qz * ty),
    y + qw * ty + (qz * tx - qx * tz),
    z + qw * tz + (qx * ty - qy * tx),
  ];
}

export interface Placed {
  instance: ItemInstance;
  min: Vec3;
  max: Vec3;
  /** The box a player bumps into: the trunk of a tree, the whole box of anything else. */
  body: { min: Vec3; max: Vec3 };
  /** Points under the item's bottom (center and four corners pulled in), world x and z. */
  feet: Array<[number, number]>;
  solid: boolean;
  part: boolean;
  floats: boolean;
  /** Players climb it (ladders). */
  climbable: boolean;
}

/** The world box of a placed item and the points it stands on. */
export function place(
  instance: ItemInstance,
  shape: NonNullable<ReturnType<WorldEnvironment['itemShape']>>,
): Placed {
  const { position, rotation, scale } = instance.transform;
  const world = (local: Vec3): Vec3 => {
    const turned = rotate([local[0] * scale[0], local[1] * scale[1], local[2] * scale[2]], rotation);
    return [turned[0] + position[0], turned[1] + position[1], turned[2] + position[2]];
  };
  const [a, b] = [shape.min, shape.max];
  const box = (lo: readonly number[], hi: readonly number[]) => {
    const corners = [
      [lo[0], lo[1], lo[2]],
      [hi[0], lo[1], lo[2]],
      [lo[0], hi[1], lo[2]],
      [lo[0], lo[1], hi[2]],
      [hi[0], hi[1], lo[2]],
      [hi[0], lo[1], hi[2]],
      [lo[0], hi[1], hi[2]],
      [hi[0], hi[1], hi[2]],
    ].map((corner) => world(corner as Vec3));
    return {
      min: [0, 1, 2].map((i) => Math.min(...corners.map((c) => c[i]!))) as Vec3,
      max: [0, 1, 2].map((i) => Math.max(...corners.map((c) => c[i]!))) as Vec3,
    };
  };
  const { min, max } = box(a, b);
  const body = shape.blocks ? box(shape.blocks.min, shape.blocks.max) : { min, max };
  const cx = (a[0] + b[0]) / 2;
  const cz = (a[2] + b[2]) / 2;
  const pull = (value: number, center: number) => center + (value - center) * 0.6;
  const feet = [
    [cx, cz],
    [pull(a[0], cx), pull(a[2], cz)],
    [pull(b[0], cx), pull(a[2], cz)],
    [pull(a[0], cx), pull(b[2], cz)],
    [pull(b[0], cx), pull(b[2], cz)],
  ].map(([x, z]) => {
    const point = world([x!, a[1], z!]);
    return [point[0], point[2]] as [number, number];
  });
  return {
    instance,
    min,
    max,
    body,
    feet,
    solid: shape.solid,
    part: shape.part,
    floats: instance.floats ?? shape.floats ?? false,
    climbable: shape.climbable ?? false,
  };
}

/** The world-space box of a placed item (shared with the document environment). */
export function worldBox(
  instance: ItemInstance,
  shape: NonNullable<ReturnType<WorldEnvironment['itemShape']>>,
): { min: Vec3; max: Vec3 } {
  const { min, max } = place(instance, shape);
  return { min, max };
}

/** A flat walkable surface that is not an item, such as a room floor (x, z polygon). */
export interface FloorSurface {
  points: ReadonlyArray<readonly [number, number]>;
  level: number;
}

/** Whether x, z lies inside a polygon on the ground plane. */
export function insidePolygon(x: number, z: number, points: FloorSurface['points']): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, zi] = points[i]!;
    const [xj, zj] = points[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
