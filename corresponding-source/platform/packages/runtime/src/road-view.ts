import type { Road } from '@genvr/contracts';
import { getGround, getRoadType, type RoadLook } from '@genvr/core-library';
import type { RoadSample } from '@genvr/world';
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Material,
  type Texture,
} from 'three/webgpu';

type HeightAt = (x: number, z: number) => number;

/** Road surface lift above the graded ground (avoids flicker with the terrain). */
const ROAD_LIFT = 0.06;
/**
 * Distance across the road to the neighbour ground samples that keep it above bumps. Across only: taken along the
 * road too, on a slope the road rose by the slope times this distance (up to 0.6 m above a steep river bank, R2k).
 */
const NEAR = 0.5;
/** Meters of road per texture repeat. */
const ROAD_TILE = 6;
const RAIL_GAUGE = 1.44;
const PARAPET = { height: 1, thickness: 0.25 } as const;
const DECK_DEPTH = 0.6;
const PIER_SPACING = 8;
/** Extra lift per junction level, so a road drawn over another at a junction never flickers with it. */
const LEVEL_LIFT = 0.012;
/** Highest junction level (wider roads over narrower ones over narrower ones...). */
const MAX_LEVEL = 3;
/** Across-road texture coordinate of plain surface, between the edge and centre lines. */
const PLAIN_U = 0.3;
/** Looks with painted lines, drawn plain where another road crosses. */
const MARKED: ReadonlySet<RoadLook> = new Set(['street', 'lane', 'tram']);
/** Pieces of one street meeting end to end at less than this angle continue each other; they do not cross. */
const CROSSING_COS = Math.cos((30 * Math.PI) / 180);
/** Painted lines (EU style, all white), metres: edge lines solid, lane and centre lines dashed 3 m on, 6 m off. */
const LINE = { edge: 0.15, lane: 0.12, inset: 0.25, dash: 3, gap: 6, centreGap: 3, lift: 0.012 } as const;
/** Narrowest lane a line may leave, metres (as the import rules). */
const MIN_LANE = 2.75;
/** Photo surfaces (Poly Haven, CC0, R2h): the Core ground material each look shows. */
const PHOTO: Partial<Record<RoadLook, string>> = { street: 'asphalt-02', lane: 'clean-asphalt' };
/** The sidewalk paving and the height of its kerb above the road, metres. */
const SIDEWALK = { ground: 'large-grey-tiles', kerb: 0.12 } as const;
/** Pieces each road sample step is cut into for sidewalks. */
const SIDEWALK_STEPS = 4;
/** Metres one photo texture covers (its real size), 4 m when unknown. */
const photoTile = (name: string) => getGround(name)?.tile ?? 4;

/** Loads a Core ground material's color picture as a repeating texture (an empty one on servers and in tests). */
export function groundTexture(name: string): Texture {
  const file = getGround(name)?.files.find((f) => f.size === 1024) ?? getGround(name)?.files[0];
  if (typeof document === 'undefined' || !file) return new CanvasTexture(undefined as never);
  const texture = new TextureLoader().load(file.color);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/** Size of the cells that find nearby road pieces (more than two roads' half widths together). */
const JUNCTION_CELL = 16;

function canvasTexture(width: number, height: number, draw: (c: CanvasRenderingContext2D) => void) {
  // Servers and tests have no canvas: geometry and colliders still build, just untextured.
  if (typeof document === 'undefined') return new CanvasTexture(undefined as never);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context) draw(context);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

const speckle = (c: CanvasRenderingContext2D, w: number, h: number, count: number, alpha = 0.07) => {
  for (let i = 0; i < count; i += 1) {
    c.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
    c.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
};

/** Surface texture per road look: u runs across the road, v along it (one tile = 6 m). */
function roadTexture(look: RoadLook): CanvasTexture {
  return canvasTexture(128, 256, (c) => {
    switch (look) {
      case 'street':
        // Asphalt only: the lane lines are drawn per street (buildRoad), from its lanes and direction.
        c.fillStyle = '#4b4f55';
        c.fillRect(0, 0, 128, 256);
        speckle(c, 128, 256, 900);
        break;
      case 'lane':
        // A local street: asphalt and a faint worn edge, no lane markings.
        c.fillStyle = '#4e5258';
        c.fillRect(0, 0, 128, 256);
        speckle(c, 128, 256, 1000);
        c.fillStyle = 'rgba(255,255,255,0.08)';
        c.fillRect(0, 0, 6, 256);
        c.fillRect(122, 0, 6, 256);
        break;
      case 'tram':
        c.fillStyle = '#55595f';
        c.fillRect(0, 0, 128, 256);
        speckle(c, 128, 256, 900);
        c.fillStyle = '#f2f2ee';
        c.fillRect(4, 0, 3, 256);
        c.fillRect(121, 0, 3, 256);
        c.fillStyle = '#b9c0c8';
        for (const u of [22, 42, 84, 104]) c.fillRect(u, 0, 3, 256);
        break;
      case 'dirt':
        c.fillStyle = '#9b7a4f';
        c.fillRect(0, 0, 128, 256);
        speckle(c, 128, 256, 1400, 0.1);
        c.fillStyle = 'rgba(80,55,30,0.35)';
        c.fillRect(30, 0, 12, 256);
        c.fillRect(86, 0, 12, 256);
        break;
      case 'rail':
        c.fillStyle = '#7d7266';
        c.fillRect(0, 0, 128, 256);
        speckle(c, 128, 256, 1600, 0.12);
        c.fillStyle = '#6e4a28';
        for (let v = 0; v < 256; v += 26) c.fillRect(14, v, 100, 12);
        break;
      case 'fantasy': {
        const gradient = c.createLinearGradient(0, 0, 128, 0);
        gradient.addColorStop(0, '#6d4aff');
        gradient.addColorStop(0.5, '#29c7ff');
        gradient.addColorStop(1, '#ff6fd8');
        c.fillStyle = gradient;
        c.fillRect(0, 0, 128, 256);
        c.fillStyle = 'rgba(255,255,255,0.9)';
        for (let i = 0; i < 60; i += 1) c.fillRect(Math.random() * 128, Math.random() * 256, 2, 2);
        break;
      }
      case 'path':
        c.fillStyle = '#d9cdb5';
        c.fillRect(0, 0, 128, 256);
        c.strokeStyle = 'rgba(120,100,70,0.45)';
        c.lineWidth = 2;
        for (let v = 0; v < 256; v += 32)
          for (let u = (v / 32) % 2 ? 0 : -32; u < 128; u += 64) c.strokeRect(u, v, 64, 32);
        break;
    }
  });
}

/** Materials per road look plus the shared rail, bridge, and ghost materials. */
export class RoadMaterials {
  readonly #surfaces = new Map<string, MeshStandardMaterial>();
  readonly #ghosts = new Map<RoadLook, MeshStandardMaterial>();
  readonly #markings = new Map<number, MeshStandardMaterial>();
  #sidewalk: MeshStandardMaterial | null = null;

  /** Sidewalk paving (R2h). */
  get sidewalk(): MeshStandardMaterial {
    if (!this.#sidewalk) {
      this.#sidewalk = new MeshStandardMaterial({ map: groundTexture(SIDEWALK.ground), roughness: 0.85 });
      this.#sidewalk.polygonOffset = true;
      this.#sidewalk.polygonOffsetFactor = -1;
      this.#sidewalk.polygonOffsetUnits = -1;
    }
    return this.#sidewalk;
  }
  readonly rail = new MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.6, roughness: 0.35 });

  /** White road paint, drawn over the surface of the same junction level. */
  marking(level = 0): MeshStandardMaterial {
    let material = this.#markings.get(level);
    if (!material) {
      material = new MeshStandardMaterial({ color: 0xf0f0ea, roughness: 0.7 });
      material.polygonOffset = true;
      material.polygonOffsetFactor = -4 - level;
      material.polygonOffsetUnits = -4 - 2 * level;
      this.#markings.set(level, material);
    }
    return material;
  }
  readonly concrete = new MeshStandardMaterial({ color: 0xc9c2b6, roughness: 0.9 });

  /** The surface of a look; `level` raises its depth bias so it wins over lower roads at junctions. */
  surface(look: RoadLook, level = 0): MeshStandardMaterial {
    const key = `${look}:${level}`;
    let material = this.#surfaces.get(key);
    if (!material) {
      const photo = PHOTO[look];
      const map = level > 0 ? this.surface(look, 0).map! : photo ? groundTexture(photo) : roadTexture(look);
      material = new MeshStandardMaterial({ map, roughness: look === 'fantasy' ? 0.4 : 0.9 });
      if (look === 'fantasy') {
        material.emissive = new Color(0xffffff);
        material.emissiveMap = map;
        material.emissiveIntensity = 0.55;
      }
      material.polygonOffset = true;
      material.polygonOffsetFactor = -2 - level;
      material.polygonOffsetUnits = -2 - 2 * level;
      this.#surfaces.set(key, material);
    }
    return material;
  }

  /** See-through version for the preview while drawing. */
  ghost(look: RoadLook): MeshStandardMaterial {
    let material = this.#ghosts.get(look);
    if (!material) {
      material = new MeshStandardMaterial({ map: this.surface(look).map, transparent: true, opacity: 0.7 });
      this.#ghosts.set(look, material);
    }
    return material;
  }

  dispose(): void {
    const maps = new Set<Texture>();
    for (const material of this.#surfaces.values()) {
      if (material.map) maps.add(material.map);
      material.dispose();
    }
    for (const map of maps) map.dispose();
    for (const material of this.#ghosts.values()) material.dispose();
    for (const material of this.#markings.values()) material.dispose();
    if (this.#sidewalk) {
      this.#sidewalk.map?.dispose();
      this.#sidewalk.dispose();
    }
    this.rail.dispose();
    this.concrete.dispose();
  }
}

/** Collects triangles, then turns them into a geometry and/or collider arrays. */
class Builder {
  readonly positions: number[] = [];
  readonly uvs: number[] = [];
  readonly indices: number[] = [];

  /**
   * Quad a-b-c-d. The builders below list corners clockwise seen from the outside, so the
   * triangles are wound in reverse to face outwards.
   */
  quad(a: number[], b: number[], c: number[], d: number[], uv?: number[][]) {
    const base = this.positions.length / 3;
    for (const p of [a, b, c, d]) this.positions.push(p[0]!, p[1]!, p[2]!);
    for (const t of uv ?? [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ])
      this.uvs.push(t[0]!, t[1]!);
    this.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }

  get empty() {
    return this.indices.length === 0;
  }

  geometry(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(this.uvs), 2));
    geometry.setIndex(this.indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }

  arrays() {
    return { positions: new Float32Array(this.positions), indices: new Uint32Array(this.indices) };
  }
}

/** Unit direction along the road and its sideways normal at each sample (right of travel: x east, z south). */
function frames(samples: readonly RoadSample[]) {
  return samples.map((_, i) => {
    const prev = samples[Math.max(0, i - 1)]!;
    const next = samples[Math.min(samples.length - 1, i + 1)]!;
    const length = Math.hypot(next.x - prev.x, next.z - prev.z) || 1;
    const tx = (next.x - prev.x) / length;
    const tz = (next.z - prev.z) / length;
    return { tx, tz, nx: -tz, nz: tx };
  });
}

/**
 * Solid strip along the road (rails, parapets, deck slab): from `bottom(i)` to `top(i)` at a
 * sideways offset. Built only where `include(i)` holds for both ends of a segment.
 */
function strip(
  out: Builder,
  samples: readonly RoadSample[],
  offset: number,
  halfWidth: number,
  bottom: (i: number) => number,
  top: (i: number) => number,
  include: (i: number) => boolean = () => true,
) {
  const f = frames(samples);
  const at = (i: number, side: number, y: number) => {
    const s = samples[i]!;
    const o = offset + side * halfWidth;
    return [s.x + f[i]!.nx * o, y, s.z + f[i]!.nz * o];
  };
  for (let i = 0; i < samples.length - 1; i += 1) {
    if (!include(i) || !include(i + 1)) continue;
    const j = i + 1;
    // Top, left side, right side, bottom.
    out.quad(at(i, 1, top(i)), at(i, -1, top(i)), at(j, -1, top(j)), at(j, 1, top(j)));
    out.quad(at(i, 1, bottom(i)), at(i, 1, top(i)), at(j, 1, top(j)), at(j, 1, bottom(j)));
    out.quad(at(i, -1, top(i)), at(i, -1, bottom(i)), at(j, -1, bottom(j)), at(j, -1, top(j)));
    out.quad(at(i, -1, bottom(i)), at(i, 1, bottom(i)), at(j, 1, bottom(j)), at(j, -1, bottom(j)));
  }
}

export interface RoadCrossing {
  /** The part of the other road's centre line near this road. */
  line: ReadonlyArray<readonly [number, number]>;
  /** Half the other road's width. */
  half: number;
  /** True when the other road is drawn over this one (it is wider, or as wide with a smaller id). */
  above: boolean;
  /** The other road's sidewalk on each side, metres (0 for none). */
  sidewalk: number;
}

/** How a road meets the roads that cross it. */
export interface RoadJunctions {
  /** 0 for a road under every road it meets; one more than the highest road it is drawn over. */
  level: number;
  crossings: RoadCrossing[];
}

/** Distance from (x, z) to a polyline, Infinity for an empty one. */
function lineDistance(line: ReadonlyArray<readonly [number, number]>, x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i += 1) {
    const [ax, az] = line[i]!;
    const [bx, bz] = line[i + 1]!;
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

/**
 * Finds where roads meet (their surfaces overlap off bridges, except pieces of one street continuing each other;
 * railways are left alone) and
 * decides which is drawn on top: the wider road, then the smaller id. The road below leaves out its part inside the one
 * above, and both are drawn plain (no lines) where they overlap, so a junction is one clean asphalt area.
 */
export function planJunctions(
  roads: ReadonlyArray<Pick<Road, 'id' | 'width' | 'materialId' | 'sidewalk'> & { samples: readonly RoadSample[] }>,
): Map<string, RoadJunctions> {
  const isRail = roads.map((r) => getRoadType(r.materialId).look === 'rail');
  const above = (a: number, b: number) =>
    roads[a]!.width > roads[b]!.width || (roads[a]!.width === roads[b]!.width && roads[a]!.id < roads[b]!.id);
  // Every road segment, by cell.
  const cells = new Map<string, Array<[number, number]>>();
  roads.forEach((road, r) => {
    if (isRail[r]) return;
    for (let j = 0; j < road.samples.length - 1; j += 1) {
      const a = road.samples[j]!;
      const b = road.samples[j + 1]!;
      for (let cx = Math.floor(Math.min(a.x, b.x) / JUNCTION_CELL); cx <= Math.floor(Math.max(a.x, b.x) / JUNCTION_CELL); cx += 1)
        for (let cz = Math.floor(Math.min(a.z, b.z) / JUNCTION_CELL); cz <= Math.floor(Math.max(a.z, b.z) / JUNCTION_CELL); cz += 1) {
          const key = `${cx},${cz}`;
          let list = cells.get(key);
          if (!list) cells.set(key, (list = []));
          list.push([r, j]);
        }
    }
  });

  // For each pair that crosses: the range of the other road's segments near it.
  const near = roads.map(() => new Map<number, [number, number]>());
  roads.forEach((road, r) => {
    if (isRail[r]) return;
    const f = frames(road.samples);
    road.samples.forEach((s, i) => {
      if (s.bridge) return;
      // Neighbouring cells too: a cell is wider than any two roads' half widths together.
      const cx = Math.floor(s.x / JUNCTION_CELL);
      const cz = Math.floor(s.z / JUNCTION_CELL);
      const nearby: Array<[number, number]> = [];
      for (let a = cx - 1; a <= cx + 1; a += 1)
        for (let b = cz - 1; b <= cz + 1; b += 1) nearby.push(...(cells.get(`${a},${b}`) ?? []));
      for (const [o, j] of nearby) {
        if (o === r) continue;
        const other = roads[o]!;
        const a = other.samples[j]!;
        const b = other.samples[j + 1]!;
        if (a.bridge || b.bridge) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const length = Math.hypot(dx, dz) || 1;
        const t = Math.max(0, Math.min(1, ((s.x - a.x) * dx + (s.z - a.z) * dz) / (length * length)));
        const d = Math.hypot(s.x - a.x - dx * t, s.z - a.z - dz * t);
        if (d > (road.width + other.width) / 2) continue;
        // Two pieces of one street meet end to end, nearly straight and as wide: a continuation, not a junction.
        // A branch leaving at a shallow angle (a slip road, a fork) is a junction.
        const reach = road.width + other.width;
        const atEnd = (p: readonly RoadSample[], from: number, to: number) =>
          p[from]!.distance <= reach || p[p.length - 1]!.distance - p[to]!.distance <= reach;
        if (
          Math.abs((f[i]!.tx * dx + f[i]!.tz * dz) / length) > CROSSING_COS &&
          road.width === other.width &&
          atEnd(road.samples, i, i) &&
          atEnd(other.samples, j, j + 1)
        )
          continue;
        const range = near[r]!.get(o);
        near[r]!.set(o, range ? [Math.min(range[0], j), Math.max(range[1], j)] : [j, j]);
      }
    });
  });

  // Crossing is mutual even when only one side saw it (a road ending inside the other).
  near.forEach((others, r) =>
    others.forEach((_, o) => {
      if (!near[o]!.has(r)) near[o]!.set(r, [0, roads[r]!.samples.length - 2]);
    }),
  );

  const result = new Map<string, RoadJunctions>();
  const levels = new Array<number>(roads.length).fill(0);
  const order = roads.map((_, r) => r).sort((a, b) => (above(a, b) ? 1 : above(b, a) ? -1 : 0));
  for (const r of order) {
    const road = roads[r]!;
    const crossings: RoadCrossing[] = [];
    let level = 0;
    near[r]!.forEach(([from, to], o) => {
      const other = roads[o]!;
      const pad = Math.ceil(Math.max(road.width, other.width)) + 1;
      const first = Math.max(0, from - pad);
      const last = Math.min(other.samples.length - 1, to + 1 + pad);
      const line = other.samples.slice(first, last + 1).map((p) => [p.x, p.z] as const);
      const isAbove = above(o, r);
      if (!isAbove) level = Math.max(level, Math.min(MAX_LEVEL, levels[o]! + 1));
      crossings.push({ line, half: other.width / 2, above: isAbove, sidewalk: other.sidewalk ?? 0 });
    });
    levels[r] = level;
    result.set(road.id, { level, crossings });
  }
  return result;
}

/** A painted line along a road: sideways offset (right of travel is +, the frames' normal), width, and dashing. */
export interface LaneLine {
  offset: number;
  width: number;
  /** null for a solid line, else metres on and off. */
  dash: { on: number; off: number } | null;
}

/**
 * The lines of a Street-type road (R2g), right-hand traffic: solid edge lines, dashed lines between lanes of one
 * direction, and on a two-way road a centre line between the directions (dashed with two lanes, solid with more).
 * Without a lane count a one-way road has one lane and a two-way road two (one when too narrow for two).
 */
export function laneLines(road: Pick<Road, 'width' | 'lanes' | 'oneway'>): LaneLine[] {
  const half = road.width / 2;
  const room = road.width - 2 * LINE.inset;
  const fallback = road.oneway ? 1 : room >= 2 * MIN_LANE ? 2 : 1;
  const lanes = Math.max(1, Math.min(road.lanes ?? fallback, Math.max(1, Math.floor(room / MIN_LANE))));
  const edge = half - LINE.inset - LINE.edge / 2;
  const lines: LaneLine[] = [
    { offset: edge, width: LINE.edge, dash: null },
    { offset: -edge, width: LINE.edge, dash: null },
  ];
  // Two-way: oncoming traffic on the left (negative offsets); with an odd count the larger half goes with the points.
  const oncoming = road.oneway ? 0 : Math.floor(lanes / 2);
  const lane = room / lanes;
  for (let k = 1; k < lanes; k += 1) {
    const offset = k * lane - (half - LINE.inset);
    const centre = !road.oneway && k === oncoming;
    lines.push({
      offset,
      width: LINE.lane,
      dash: centre && lanes > 2 ? null : { on: LINE.dash, off: centre ? LINE.centreGap : LINE.gap },
    });
  }
  return lines;
}

export interface BuiltRoad {
  meshes: Mesh[];
  /** Collider triangles for bridge decks and parapets (graded ground carries the rest). */
  collider: { positions: Float32Array; indices: Uint32Array } | null;
}

/**
 * Builds a road: a textured surface draped on the graded ground, raised to a deck with
 * parapets and piers where it is a bridge, plus rails for railways.
 */
export function buildRoad(
  road: Pick<Road, 'id' | 'width' | 'materialId' | 'lanes' | 'oneway' | 'sidewalk' | 'sidewalkSide'>,
  samples: readonly RoadSample[],
  heightAt: HeightAt,
  materials: RoadMaterials,
  options: { ghost?: boolean; lift?: number; junctions?: RoadJunctions | undefined } = {},
): BuiltRoad {
  const type = getRoadType(road.materialId);
  const width = road.width;
  const level = options.junctions?.level ?? 0;
  const crossings = options.junctions?.crossings ?? [];
  const lift = (options.lift ?? ROAD_LIFT) + level * LEVEL_LIFT;
  const insideOf = (c: RoadCrossing, p: readonly number[]) => lineDistance(c.line, p[0]!, p[2]!) <= c.half;
  const f = frames(samples);
  const groundUnder = (x: number, z: number, nx: number, nz: number) =>
    Math.max(heightAt(x, z), heightAt(x + nx * NEAR, z + nz * NEAR), heightAt(x - nx * NEAR, z - nz * NEAR));
  /** Road surface height at a sample and sideways offset. */
  const surface = (i: number, offset: number) => {
    const s = samples[i]!;
    if (s.bridge) return s.height + lift;
    const { nx, nz } = f[i]!;
    return groundUnder(s.x + nx * offset, s.z + nz * offset, nx, nz) + lift;
  };

  // Surface ribbon (five vertices across so it follows the ground).
  const photo = options.ghost ? undefined : PHOTO[type.look];
  const across = [-0.5, -0.25, 0, 0.25, 0.5];
  const top = new Builder();
  for (let i = 0; i < samples.length - 1; i += 1) {
    for (let k = 0; k < across.length - 1; k += 1) {
      const [s0, s1] = [across[k]!, across[k + 1]!];
      const corner = (j: number, s: number) => {
        const p = samples[j]!;
        return [p.x + f[j]!.nx * s * width, surface(j, s * width), p.z + f[j]!.nz * s * width];
      };
      const tile = photo ? photoTile(photo) : ROAD_TILE;
      const v0 = samples[i]!.distance / tile;
      const v1 = samples[i + 1]!.distance / tile;
      const corners = [corner(i, s0), corner(i + 1, s0), corner(i + 1, s1), corner(i, s1)] as const;
      // Inside a road drawn over this one: left out (that road covers it).
      if (crossings.some((c) => c.above && corners.every((p) => insideOf(c, p)))) continue;
      // Where roads overlap the surface is plain, so lines do not run through the junction.
      const middle = [0, 0, 0].map((_, axis) => corners.reduce((sum, p) => sum + p[axis]!, 0) / 4);
      const plain = !photo && MARKED.has(type.look) && crossings.some((c) => insideOf(c, middle));
      // A photo surface repeats every few metres across the road too; a drawn one spans the road once.
      const [u0, u1] = photo
        ? [(s0 * width) / tile, (s1 * width) / tile]
        : plain
          ? [PLAIN_U, PLAIN_U]
          : [s0 + 0.5, s1 + 0.5];
      top.quad(corners[0], corners[1], corners[2], corners[3], [
        [u0, v0],
        [u0, v1],
        [u1, v1],
        [u1, v0],
      ]);
    }
  }
  const surfaceMaterial: Material = options.ghost ? materials.ghost(type.look) : materials.surface(type.look, level);
  const meshes: Mesh[] = [];
  const surfaceMesh = new Mesh(top.geometry(), surfaceMaterial);
  surfaceMesh.receiveShadow = true;
  surfaceMesh.name = `road:${road.id}`;
  meshes.push(surfaceMesh);
  if (options.ghost) return { meshes, collider: null };

  // Raised sidewalks (R2h): paving on top, a kerb face toward the road, an outer face down to the ground. They stop
  // where another road crosses, and under a road drawn over this one together with its own sidewalks.
  const walk = new Builder();
  const walkSolid = new Builder();
  const sidewalk = road.sidewalk ?? 0;
  if (sidewalk > 0 && (type.look === 'street' || type.look === 'lane')) {
    const tile = photoTile(SIDEWALK.ground);
    const cut = (x: number, z: number) =>
      crossings.some((c) => lineDistance(c.line, x, z) <= c.half + (c.above ? c.sidewalk : 0));
    // The frames' normal points right of travel (x east, z south), so right is +1 and left -1.
    const sides = road.sidewalkSide === 'right' ? [1] : road.sidewalkSide === 'left' ? [-1] : [-1, 1];
    for (const side of sides) {
      const inner = (side * width) / 2;
      const outer = side * (width / 2 + sidewalk);
      const middle = (inner + outer) / 2;
      for (let i = 0; i < samples.length - 1; i += 1) {
        if (samples[i]!.bridge || samples[i + 1]!.bridge) continue;
        // Quarter steps, so the sidewalk stops within a few decimetres of a crossing street's edge.
        for (let k = 0; k < SIDEWALK_STEPS; k += 1) {
          const t0 = k / SIDEWALK_STEPS;
          const t1 = (k + 1) / SIDEWALK_STEPS;
          const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
          const frame = (t: number) => {
            const nx = lerp(f[i]!.nx, f[i + 1]!.nx, t);
            const nz = lerp(f[i]!.nz, f[i + 1]!.nz, t);
            const length = Math.hypot(nx, nz) || 1;
            return {
              x: lerp(samples[i]!.x, samples[i + 1]!.x, t),
              z: lerp(samples[i]!.z, samples[i + 1]!.z, t),
              nx: nx / length,
              nz: nz / length,
            };
          };
          const [a, b] = [frame(t0), frame(t1)];
          const mid = frame((t0 + t1) / 2);
          if (cut(mid.x + mid.nx * middle, mid.z + mid.nz * middle)) continue;
          const at = (p: typeof a, offset: number, y: number) => [p.x + p.nx * offset, y, p.z + p.nz * offset];
          const level = (t: number, offset: number) => lerp(surface(i, offset), surface(i + 1, offset), t);
          const top = (t: number) => level(t, middle) + SIDEWALK.kerb;
          const ground = (p: typeof a) => heightAt(p.x + p.nx * outer, p.z + p.nz * outer) - 0.05;
          const v0 = lerp(samples[i]!.distance, samples[i + 1]!.distance, t0) / tile;
          const v1 = lerp(samples[i]!.distance, samples[i + 1]!.distance, t1) / tile;
          const u = (o: number) => o / tile;
          // Corners listed so the faces point up / toward the road / away from it on either side.
          const [p, q] = side > 0 ? [inner, outer] : [outer, inner];
          const topQuad = [at(a, p, top(t0)), at(b, p, top(t1)), at(b, q, top(t1)), at(a, q, top(t0))] as const;
          walk.quad(topQuad[0], topQuad[1], topQuad[2], topQuad[3], [
            [u(p), v0],
            [u(p), v1],
            [u(q), v1],
            [u(q), v0],
          ]);
          walkSolid.quad(topQuad[0], topQuad[1], topQuad[2], topQuad[3]);
          const kerb = [at(a, inner, level(t0, inner)), at(b, inner, level(t1, inner)), at(b, inner, top(t1)), at(a, inner, top(t0))] as const;
          const face = [at(a, outer, top(t0)), at(b, outer, top(t1)), at(b, outer, ground(b)), at(a, outer, ground(a))] as const;
          const edgeUv = [
            [0, v0],
            [0, v1],
            [SIDEWALK.kerb / tile, v1],
            [SIDEWALK.kerb / tile, v0],
          ];
          if (side > 0) {
            walk.quad(kerb[3], kerb[2], kerb[1], kerb[0], edgeUv);
            walk.quad(face[0], face[1], face[2], face[3], edgeUv);
          } else {
            walk.quad(kerb[0], kerb[1], kerb[2], kerb[3], edgeUv);
            walk.quad(face[3], face[2], face[1], face[0], edgeUv);
          }
        }
      }
    }
    if (!walk.empty) {
      const mesh = new Mesh(walk.geometry(), materials.sidewalk);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      mesh.name = `road:${road.id}`;
      meshes.push(mesh);
    }
  }
  const sidewalkCollider = walkSolid.empty ? null : walkSolid.arrays();

  // Lane lines (Street type), stopping where another road crosses so they never run through a junction.
  if (type.look === 'street') {
    const paint = new Builder();
    const crossed = (x: number, z: number) => crossings.some((c) => lineDistance(c.line, x, z) <= c.half + 0.5);
    for (const line of laneLines(road)) {
      for (let i = 0; i < samples.length - 1; i += 1) {
        if (line.dash) {
          const middle = (samples[i]!.distance + samples[i + 1]!.distance) / 2;
          if (middle % (line.dash.on + line.dash.off) >= line.dash.on) continue;
        }
        const at = (j: number, side: number) => {
          const p = samples[j]!;
          const o = line.offset + (side * line.width) / 2;
          return [p.x + f[j]!.nx * o, surface(j, line.offset) + LINE.lift, p.z + f[j]!.nz * o];
        };
        const a = samples[i]!;
        const b = samples[i + 1]!;
        const ox = (f[i]!.nx + f[i + 1]!.nx) / 2;
        const oz = (f[i]!.nz + f[i + 1]!.nz) / 2;
        if (crossed((a.x + b.x) / 2 + ox * line.offset, (a.z + b.z) / 2 + oz * line.offset)) continue;
        paint.quad(at(i, -1), at(i + 1, -1), at(i + 1, 1), at(i, 1));
      }
    }
    if (!paint.empty) {
      const mesh = new Mesh(paint.geometry(), materials.marking(level));
      mesh.receiveShadow = true;
      mesh.name = `road:${road.id}`;
      meshes.push(mesh);
    }
  }

  // Railway rails.
  if (type.look === 'rail') {
    const rails = new Builder();
    for (const side of [-1, 1])
      strip(
        rails,
        samples,
        (side * RAIL_GAUGE) / 2,
        0.05,
        (i) => surface(i, 0),
        (i) => surface(i, 0) + 0.14,
      );
    const mesh = new Mesh(rails.geometry(), materials.rail);
    mesh.castShadow = true;
    mesh.name = `road:${road.id}`;
    meshes.push(mesh);
  }

  // Bridges: deck slab under the surface, parapets on both edges, piers down to the ground.
  const isBridge = (i: number) => samples[i]!.bridge;
  if (samples.some((s) => s.bridge)) {
    const structure = new Builder();
    const halfDeck = width / 2 + PARAPET.thickness;
    strip(
      structure,
      samples,
      0,
      halfDeck,
      (i) => samples[i]!.height - DECK_DEPTH,
      (i) => samples[i]!.height,
      isBridge,
    );
    for (const side of [-1, 1])
      strip(
        structure,
        samples,
        side * (width / 2 + PARAPET.thickness / 2),
        PARAPET.thickness / 2,
        (i) => samples[i]!.height,
        (i) => samples[i]!.height + PARAPET.height,
        isBridge,
      );
    let nextPier = -Infinity;
    for (let i = 0; i < samples.length; i += 1) {
      const s = samples[i]!;
      if (!s.bridge || s.distance < nextPier) continue;
      nextPier = s.distance + PIER_SPACING;
      const bottom = heightAt(s.x, s.z) - 0.5;
      const topY = s.height - DECK_DEPTH;
      if (topY - bottom < 0.5) continue;
      const h = 0.45;
      const c = [s.x, s.z] as const;
      const corners = [
        [c[0] - h, c[1] - h],
        [c[0] + h, c[1] - h],
        [c[0] + h, c[1] + h],
        [c[0] - h, c[1] + h],
      ] as const;
      for (let k = 0; k < 4; k += 1) {
        const a = corners[k]!;
        const b = corners[(k + 1) % 4]!;
        structure.quad([a[0], bottom, a[1]], [b[0], bottom, b[1]], [b[0], topY, b[1]], [a[0], topY, a[1]]);
      }
    }
    const mesh = new Mesh(structure.geometry(), materials.concrete);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `road:${road.id}`;
    meshes.push(mesh);

    // Collider: the deck surface and parapets of the bridge part only.
    const collider = new Builder();
    for (let i = 0; i < samples.length - 1; i += 1) {
      if (!isBridge(i) || !isBridge(i + 1)) continue;
      const edge = (j: number, side: number) => {
        const p = samples[j]!;
        return [p.x + f[j]!.nx * side * halfDeck, p.height + lift, p.z + f[j]!.nz * side * halfDeck];
      };
      collider.quad(edge(i, -1), edge(i + 1, -1), edge(i + 1, 1), edge(i, 1));
    }
    for (const side of [-1, 1])
      strip(
        collider,
        samples,
        side * (width / 2 + PARAPET.thickness / 2),
        PARAPET.thickness / 2,
        (i) => samples[i]!.height,
        (i) => samples[i]!.height + PARAPET.height,
        isBridge,
      );
    return { meshes, collider: joinColliders(collider.empty ? null : collider.arrays(), sidewalkCollider) };
  }
  return { meshes, collider: sidewalkCollider };
}

type Collider = { positions: Float32Array; indices: Uint32Array };

/** One collider from two (either may be missing). */
function joinColliders(a: Collider | null, b: Collider | null): Collider | null {
  if (!a || !b) return a ?? b;
  const positions = new Float32Array(a.positions.length + b.positions.length);
  positions.set(a.positions);
  positions.set(b.positions, a.positions.length);
  const offset = a.positions.length / 3;
  const indices = new Uint32Array(a.indices.length + b.indices.length);
  indices.set(a.indices);
  indices.set(b.indices.map((index) => index + offset), a.indices.length);
  return { positions, indices };
}
