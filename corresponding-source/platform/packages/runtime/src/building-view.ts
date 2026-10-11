import type { BuildingLook, Wall } from '@genvr/contracts';
import { getGround } from '@genvr/core-library';
import { roofBends, roofFacet, roofHeightAt, roofPlanes, type RoofPlane } from '@genvr/world';
import {
  Color,
  DoubleSide,
  MeshStandardMaterial,
  ShapeUtils,
  SRGBColorSpace,
  Vector2,
  type Texture,
} from 'three/webgpu';
import { groundTexture } from './road-view.js';

type HeightAt = (x: number, z: number) => number;
type Facade = NonNullable<BuildingLook['facade']>;
type RoofMaterial = NonNullable<BuildingLook['roofMaterial']>;

/** Core Library surfaces of real buildings (Poly Haven CC0, R4b) and their average colour, to paint over them. */
const FACADE_SURFACES: Record<Facade, { name: string; mean: string }> = {
  plaster: { name: 'painted-plaster-wall', mean: '#a49c99' },
  brick: { name: 'large-red-bricks', mean: '#593c2a' },
  stone: { name: 'sandstone-blocks-04', mean: '#957c60' },
  concrete: { name: 'concrete-wall-008', mean: '#89826c' },
  wood: { name: 'weathered-plank-siding', mean: '#46382e' },
};
const ROOF_SURFACES: Record<RoofMaterial, { name: string; mean: string }> = {
  tiles: { name: 'clay-roof-tiles-02', mean: '#754123' },
  slate: { name: 'roof-slates-02', mean: '#676055' },
  metal: { name: 'corrugated-iron', mean: '#9fa8a4' },
  concrete: { name: 'bitumen', mean: '#3b3634' },
  thatch: { name: 'reed-roof-03', mean: '#41372a' },
};

/** Plaster colours of European towns, one per building when the map gives none. */
const PLASTER = ['#efe8dc', '#e8dcc0', '#e6d39c', '#dcc6a6', '#cbc8c1', '#e3c7b8', '#d3d8cf', '#efe3cf'];

/** A number from a building's id that stays the same between loads. */
function hash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The paint that turns a texture of average colour `mean` into `target`, in linear colour (vertex colours). */
function tint(target: string, mean: string, scale = 1): [number, number, number] {
  const t = new Color(target);
  const m = new Color(mean);
  // Kept within reach of the texture, or its weakest colour turns into noise.
  const k = (a: number, b: number) => Math.min(3, Math.max(0.25, (a / Math.max(b, 1e-3)) * scale));
  return [k(t.r, m.r), k(t.g, m.g), k(t.b, m.b)];
}

/**
 * The roof surface closest to a mapped roof colour, so the paint only shades it: grey and dark roofs are slate,
 * green and blue ones painted metal, the rest clay tiles.
 */
function roofByColour(hex: string): RoofMaterial {
  const hsl = { h: 0, s: 0, l: 0 };
  new Color(hex).getHSL(hsl, SRGBColorSpace);
  if (hsl.s < 0.18 || hsl.l < 0.18) return 'slate';
  if (hsl.h > 0.2 && hsl.h < 0.75) return 'metal';
  return 'tiles';
}

/** Geometry lists of one part, merged later per 64 m cell. */
export interface Arrays {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}
export const emptyArrays = (): Arrays => ({ positions: [], normals: [], uvs: [], colors: [], indices: [] });

/** A real building's drawn parts: facade and roof by surface, window glass and frames, and the roof to stand on. */
export interface BuildingParts {
  facadeSurface: Facade;
  facade: Arrays;
  roofSurface: RoofMaterial;
  roof: Arrays;
  glass: Arrays;
  frames: Arrays;
  collider: { positions: Float32Array; indices: Uint32Array };
}

/** The look a building has: what the map says, else plaster, storeys of 3 m and a flat roof. */
export function resolvedLook(wall: Wall) {
  const look = wall.building ?? {};
  const h = hash(wall.id);
  const shape = look.roofShape ?? 'flat';
  const facade = look.facade ?? 'plaster';
  const roofMaterial: RoofMaterial =
    look.roofMaterial ??
    (look.roofColor && shape !== 'flat' ? roofByColour(look.roofColor) : null) ??
    (shape === 'flat' ? 'concrete' : h % 4 === 0 ? 'slate' : 'tiles');
  const surface = FACADE_SURFACES[facade];
  const facadeTint = look.facadeColor
    ? tint(look.facadeColor, surface.mean)
    : facade === 'plaster'
      ? tint(PLASTER[h % PLASTER.length]!, surface.mean)
      : tint(surface.mean, surface.mean, 0.85 + ((h >>> 8) % 5) * 0.06);
  const roof = ROOF_SURFACES[roofMaterial];
  const roofTint = look.roofColor
    ? tint(look.roofColor, roof.mean)
    : tint(roof.mean, roof.mean, 0.8 + ((h >>> 12) % 5) * 0.08);
  const levels = look.levels ?? Math.max(1, Math.round(wall.height / 3));
  return {
    facade,
    facadeTint,
    roofMaterial,
    roofTint,
    roofShape: shape,
    roofHeight: look.roofHeight ?? 0,
    // A storey lower than 2.4 m has no room for a window row: fewer rows on a wall cut to the limit.
    levels: Math.max(1, Math.min(levels, Math.floor(wall.height / 2.4))),
  };
}

function quad(
  out: Arrays,
  corners: ReadonlyArray<readonly [number, number, number]>,
  normal: readonly [number, number, number],
  uvs: ReadonlyArray<readonly [number, number]>,
  color: readonly [number, number, number],
) {
  const base = out.positions.length / 3;
  corners.forEach((c, i) => {
    out.positions.push(c[0], c[1], c[2]);
    out.normals.push(normal[0], normal[1], normal[2]);
    out.uvs.push(uvs[i]![0], uvs[i]![1]);
    out.colors.push(color[0], color[1], color[2]);
  });
  // Front faces towards the normal, whichever way the corners go round.
  const p0 = corners[0]!;
  const p1 = corners[1]!;
  const p2 = corners[2]!;
  const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
  const facing =
    (e1[1]! * e2[2]! - e1[2]! * e2[1]!) * normal[0] +
    (e1[2]! * e2[0]! - e1[0]! * e2[2]!) * normal[1] +
    (e1[0]! * e2[1]! - e1[1]! * e2[0]!) * normal[2];
  if (facing >= 0) out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  else out.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
}

/** Window and door sizes, metres: frames stand out from the wall, the glass a little less (no flicker). */
const FRAME = 0.09;
const FRAME_OUT = 0.1;
const GLASS_OUT = 0.05;
const BAY = 3.2;
const FRAME_COLOR: [number, number, number] = [0.82, 0.8, 0.76];
const DOOR_COLOR: [number, number, number] = [0.09, 0.05, 0.03];

/**
 * A window (or a door: no bottom frame, a wooden leaf instead of glass) on a facade side: frame front, the reveals
 * from the frame to the glass, a sill under a window. `s` runs along the side from `a`.
 */
function opening(
  parts: Pick<BuildingParts, 'glass' | 'frames'>,
  a: readonly [number, number],
  t: readonly [number, number],
  n: readonly [number, number],
  s: number,
  bottom: number,
  width: number,
  height: number,
  door: boolean,
) {
  const at = (along: number, y: number, out: number): [number, number, number] => [
    a[0] + t[0] * along + n[0] * out,
    y,
    a[1] + t[1] * along + n[1] * out,
  ];
  const front: [number, number, number] = [n[0], 0, n[1]];
  const l = s - width / 2;
  const r = s + width / 2;
  const top = bottom + height;
  const f = FRAME;
  const plain: Array<[number, number]> = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  // The pane (glass or door leaf).
  quad(
    door ? parts.frames : parts.glass,
    [at(l, bottom, GLASS_OUT), at(r, bottom, GLASS_OUT), at(r, top, GLASS_OUT), at(l, top, GLASS_OUT)],
    front,
    plain,
    door ? DOOR_COLOR : [1, 1, 1],
  );
  const frontRect = (x0: number, x1: number, y0: number, y1: number) =>
    quad(
      parts.frames,
      [at(x0, y0, FRAME_OUT), at(x1, y0, FRAME_OUT), at(x1, y1, FRAME_OUT), at(x0, y1, FRAME_OUT)],
      front,
      plain,
      FRAME_COLOR,
    );
  frontRect(l - f, r + f, top, top + f);
  frontRect(l - f, l, bottom, top);
  frontRect(r, r + f, bottom, top);
  if (!door) frontRect(l - f, r + f, bottom - f, bottom);
  // Reveals, facing into the opening.
  const reveal = (p: Array<[number, number, number]>, normal: [number, number, number]) =>
    quad(parts.frames, p, normal, plain, FRAME_COLOR);
  reveal(
    [at(l, top, FRAME_OUT), at(r, top, FRAME_OUT), at(r, top, GLASS_OUT), at(l, top, GLASS_OUT)],
    [0, -1, 0],
  );
  reveal(
    [at(l, bottom, GLASS_OUT), at(l, top, GLASS_OUT), at(l, top, FRAME_OUT), at(l, bottom, FRAME_OUT)],
    [t[0], 0, t[1]],
  );
  reveal(
    [at(r, bottom, FRAME_OUT), at(r, top, FRAME_OUT), at(r, top, GLASS_OUT), at(r, bottom, GLASS_OUT)],
    [-t[0], 0, -t[1]],
  );
  if (door) return;
  reveal(
    [at(l, bottom, GLASS_OUT), at(r, bottom, GLASS_OUT), at(r, bottom, FRAME_OUT), at(l, bottom, FRAME_OUT)],
    [0, 1, 0],
  );
  // Sill: a ledge under the window.
  const y0 = bottom - f - 0.05;
  const y1 = bottom - f;
  const sl = l - f - 0.05;
  const sr = r + f + 0.05;
  quad(
    parts.frames,
    [at(sl, y1, 0.02), at(sr, y1, 0.02), at(sr, y1, 0.16), at(sl, y1, 0.16)],
    [0, 1, 0],
    plain,
    FRAME_COLOR,
  );
  quad(
    parts.frames,
    [at(sl, y0, 0.16), at(sr, y0, 0.16), at(sr, y1, 0.16), at(sl, y1, 0.16)],
    front,
    plain,
    FRAME_COLOR,
  );
}

/**
 * A real building's facades, roof, windows and doors (Real place R4b). The facade reaches from below the lowest
 * ground to the eaves and follows the roof at gable ends; the roof sits on the exact outline; window rows follow the
 * storeys, with one door on the ground floor of the longest side where the ground is high.
 */
export function buildingParts(wall: Wall, heightAt: HeightAt, level: number): BuildingParts {
  const look = resolvedLook(wall);
  const points = wall.points;
  const eaves = level + wall.height;
  const planes: RoofPlane[] = roofPlanes(points, look.roofShape, look.roofHeight);
  const facadeTile = getGround(FACADE_SURFACES[look.facade].name)?.tile ?? 2;
  const roofTile = getGround(ROOF_SURFACES[look.roofMaterial].name)?.tile ?? 2;
  const facade = emptyArrays();
  const glass = emptyArrays();
  const frames = emptyArrays();
  // Outward is to the right of a counter-clockwise outline (x right, z down: by the sign of the area).
  let twice = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [ax, az] = points[i]!;
    const [bx, bz] = points[(i + 1) % points.length]!;
    twice += ax * bz - bx * az;
  }
  const outward = twice > 0 ? -1 : 1;
  const storey = wall.height / look.levels;
  // Where the door goes: the longest side whose middle is near the floor level.
  let doorSide = -1;
  let doorLength = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [ax, az] = points[i]!;
    const [bx, bz] = points[(i + 1) % points.length]!;
    const length = Math.hypot(bx - ax, bz - az);
    if (length > doorLength && heightAt((ax + bx) / 2, (az + bz) / 2) > level - 0.6) {
      doorSide = i;
      doorLength = length;
    }
  }
  let along = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-3) continue;
    const t: [number, number] = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    const n: [number, number] = [-t[1] * outward, t[0] * outward];
    let bottom = Infinity;
    for (let k = 0; k <= Math.ceil(length); k += 1) {
      const s = k / Math.ceil(length);
      bottom = Math.min(bottom, heightAt(a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s));
    }
    bottom -= 0.5;
    // The wall top follows the roof: straight between the roof's bends.
    const stops = [0, ...roofBends(a, b, planes), 1];
    for (let k = 0; k + 1 < stops.length; k += 1) {
      const s0 = stops[k]!;
      const s1 = stops[k + 1]!;
      const p0: [number, number] = [a[0] + (b[0] - a[0]) * s0, a[1] + (b[1] - a[1]) * s0];
      const p1: [number, number] = [a[0] + (b[0] - a[0]) * s1, a[1] + (b[1] - a[1]) * s1];
      const top0 = eaves + roofHeightAt(planes, p0[0], p0[1]);
      const top1 = eaves + roofHeightAt(planes, p1[0], p1[1]);
      const u0 = (along + s0 * length) / facadeTile;
      const u1 = (along + s1 * length) / facadeTile;
      quad(
        facade,
        [
          [p0[0], bottom, p0[1]],
          [p1[0], bottom, p1[1]],
          [p1[0], top1, p1[1]],
          [p0[0], top0, p0[1]],
        ],
        [n[0], 0, n[1]],
        [
          [u0, bottom / facadeTile],
          [u1, bottom / facadeTile],
          [u1, top1 / facadeTile],
          [u0, top0 / facadeTile],
        ],
        look.facadeTint,
      );
    }
    along += length;
    // Window rows: bays of about 3.2 m, one window in the middle of each, on every storey.
    if (length < 1.6) continue;
    const bays = Math.max(1, Math.floor(length / BAY));
    const bay = length / bays;
    // A tall storey (a church nave, a hall) has tall windows, not a window of a flat.
    const tall = storey > 4.5;
    const width = tall ? Math.min(2.2, bay * 0.45) : Math.min(1.25, bay * 0.55);
    const height = tall ? storey * 0.6 : Math.min(1.5, storey * 0.48);
    for (let floor = 0; floor < look.levels; floor += 1) {
      const base = level + floor * storey;
      for (let j = 0; j < bays; j += 1) {
        const s = (j + 0.5) * bay;
        if (floor === 0 && i === doorSide && j === Math.floor(bays / 2)) {
          opening(
            { glass, frames },
            a,
            t,
            n,
            s,
            level,
            Math.min(1.1, bay * 0.6),
            Math.min(2.2, storey * 0.8),
            true,
          );
          continue;
        }
        const sill = base + Math.min(0.9, storey * 0.3);
        // Not below the ground beside the wall.
        if (sill - FRAME < heightAt(a[0] + t[0] * s, a[1] + t[1] * s) + 0.2) continue;
        opening({ glass, frames }, a, t, n, s, sill, width, height, false);
      }
    }
  }

  // The roof: each face over its part of the outline, textured along its slope so tile rows run with the eaves.
  const roof = emptyArrays();
  const collider: { positions: number[]; indices: number[] } = { positions: [], indices: [] };
  const faces: Array<{ polygon: Array<[number, number]>; plane: RoofPlane }> = planes.length
    ? planes.map((plane, i) => ({ polygon: roofFacet(points, planes, i), plane }))
    : [{ polygon: points.map(([x, z]) => [x, z]), plane: { a: 0, b: 0, c: 0 } }];
  for (const { polygon, plane } of faces) {
    if (polygon.length < 3) continue;
    const triangles = ShapeUtils.triangulateShape(
      polygon.map(([x, z]) => new Vector2(x, z)),
      [],
    );
    const slope = Math.hypot(plane.a, plane.b);
    // Up the slope (the plane's rising direction) and along the eaves.
    const up: [number, number] = slope > 1e-6 ? [plane.a / slope, plane.b / slope] : [0, 1];
    const side: [number, number] = [-up[1], up[0]];
    const stretch = Math.sqrt(1 + slope * slope);
    let nx = -plane.a;
    let ny = 1;
    let nz = -plane.b;
    const nl = Math.hypot(nx, ny, nz);
    nx /= nl;
    ny /= nl;
    nz /= nl;
    const base = roof.positions.length / 3;
    const colliderBase = collider.positions.length / 3;
    for (const [x, z] of polygon) {
      // 2 cm over the walls' top, so the roof never shares a face with them.
      const y = eaves + 0.02 + plane.a * x + plane.b * z + plane.c;
      roof.positions.push(x, y, z);
      roof.normals.push(nx, ny, nz);
      roof.uvs.push((x * side[0] + z * side[1]) / roofTile, ((x * up[0] + z * up[1]) * stretch) / roofTile);
      roof.colors.push(...look.roofTint);
      collider.positions.push(x, y, z);
    }
    for (const [p, q, r] of triangles) {
      // Facing up (a two-sided material lights a face from behind as if turned over).
      const [x0, z0] = polygon[p!]!;
      const [x1, z1] = polygon[q!]!;
      const [x2, z2] = polygon[r!]!;
      const up = (z1 - z0) * (x2 - x0) - (x1 - x0) * (z2 - z0) > 0;
      const [i, j, k] = up ? [p!, q!, r!] : [p!, r!, q!];
      roof.indices.push(base + i, base + j, base + k);
      collider.indices.push(colliderBase + i, colliderBase + j, colliderBase + k);
    }
  }
  return {
    facadeSurface: look.facade,
    facade,
    roofSurface: look.roofMaterial,
    roof,
    glass,
    frames,
    collider: { positions: new Float32Array(collider.positions), indices: new Uint32Array(collider.indices) },
  };
}

/** One material per facade and roof surface, glass and frames, shared by every real building. */
export class BuildingMaterials {
  readonly #facades = new Map<string, MeshStandardMaterial>();
  readonly #roofs = new Map<string, MeshStandardMaterial>();
  readonly #maps: Texture[] = [];
  readonly glass = new MeshStandardMaterial({ color: '#2f3d4a', roughness: 0.12, metalness: 0.6 });
  readonly frames = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });

  constructor() {
    // The panes lie 5 cm out of the wall and the frames 10 cm: they also win the depth test far away.
    for (const material of [this.glass, this.frames]) {
      material.polygonOffset = true;
      material.polygonOffsetFactor = -1;
      material.polygonOffsetUnits = -1;
    }
  }

  #get(cache: Map<string, MeshStandardMaterial>, name: string, roof: boolean) {
    let material = cache.get(name);
    if (!material) {
      const map = groundTexture(name);
      this.#maps.push(map);
      material = new MeshStandardMaterial({
        map,
        vertexColors: true,
        roughness: roof ? 0.8 : 0.9,
        // Roofs are seen from below at the eaves; facades only from outside.
        ...(roof ? { side: DoubleSide } : {}),
      });
      cache.set(name, material);
    }
    return material;
  }

  facade(surface: Facade) {
    return this.#get(this.#facades, FACADE_SURFACES[surface].name, false);
  }

  roof(surface: RoofMaterial) {
    return this.#get(this.#roofs, ROOF_SURFACES[surface].name, true);
  }

  dispose(): void {
    for (const material of [...this.#facades.values(), ...this.#roofs.values(), this.glass, this.frames])
      material.dispose();
    for (const map of this.#maps) map.dispose();
    this.#facades.clear();
    this.#roofs.clear();
  }
}
