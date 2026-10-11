import { TerrainActiveSurface, type TerrainFieldDescriptor, type WorldSeed } from '@genvr/contracts';
import type { TerrainFieldStore } from './terrain-fields.js';
import { TerrainFieldSampler } from './terrain-field-sampler.js';
import { worldHeightAt } from './world-generator.js';
/**
 * Chunked heightfield terrain (docs/CAPACITY.md, task P2-03). Pure data with no three.js, so the
 * same edits run in the browser, on the server, and in tests.
 *
 * Each chunk stores (resolution + 1)^2 vertex heights and soil indices. Border vertices exist in
 * both neighboring chunks with identical world coordinates; every edit is a deterministic function
 * of world position, so shared borders always stay in sync.
 */

export const SOILS = ['grass', 'dirt', 'sand', 'rock', 'snow', 'mud'] as const;
export type Soil = (typeof SOILS)[number];

/** Lowest and highest ground (metres). Raised for the Tidewater island (-90 .. about 280 m around its sea, task 2). */
export const MIN_HEIGHT = -150;
export const MAX_HEIGHT = 450;

export interface ChunkData {
  cx: number;
  cz: number;
  heights: Float32Array;
  soils: Uint8Array;
  /**
   * Ground cover (P2-40), one byte per vertex: 0 follows the world's own rules (grass on grass,
   * woods where the generator put them), 1 is cleared, and 2 and up name a cover the creator
   * painted. This one byte is what lets a creator erase something a rule scattered, which a rule
   * otherwise has nothing to delete, and it makes painting and erasing the same operation.
   */
  cover: Uint8Array;
}

/** Ground cover a creator can paint, by the byte stored for it (P2-40). */
export const COVERS = ['default', 'cleared', 'plants', 'pebbles'] as const;
export type Cover = (typeof COVERS)[number];

export type Area = ReadonlyArray<readonly [number, number]>;

export interface HeightUpdate {
  chunk: ChunkData;
  index: number;
  value: number;
}
export type SculptOperation = 'raise' | 'lower' | 'flatten' | 'smooth';

export const chunkKey = (cx: number, cz: number) => `${cx},${cz}`;

/** Ray casting point-in-polygon on the ground plane (x, z). */
export function insidePolygon(x: number, z: number, area: Area): boolean {
  let inside = false;
  for (let i = 0, j = area.length - 1; i < area.length; j = i, i += 1) {
    const [xi, zi] = area[i] as readonly [number, number];
    const [xj, zj] = area[j] as readonly [number, number];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function bounds(area: Area) {
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
  return { minX, maxX, minZ, maxZ };
}

const clampHeight = (h: number) => Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, h));

export class TerrainData {
  #activeSurface: TerrainActiveSurface | null = null;
  #surfaceSampler: TerrainFieldSampler | null = null;
  #surfaceDescriptor: TerrainFieldDescriptor | null = null;
  #surfaceRevision = 0;
  #slopeCache: {
    maxStep: number;
    cell: number;
    storeRevision: number;
    surfaceRevision: number;
    values: Array<{ x: number; z: number; degrees: number }>;
  } | null = null;
  get activeSurface(): TerrainActiveSurface | null {
    return this.#activeSurface ? TerrainActiveSurface.parse(this.#activeSurface) : null;
  }
  get activeSurfaceStore(): TerrainFieldStore | null {
    return this.#activeSurface ? (this.fieldSets.get(this.#activeSurface.setId) ?? null) : null;
  }
  get surfaceRevision(): number {
    return this.#surfaceRevision;
  }
  /** Atomic binding validation; legacy chunks remain dormant and unchanged. */
  bindSurface(input: TerrainActiveSurface | null): void {
    const surface = input ? TerrainActiveSurface.parse(input) : null;
    let sampler: TerrainFieldSampler | null = null;
    if (surface) {
      const store = this.fieldSets.get(surface.setId);
      if (!store?.complete) throw new Error('Active terrain surface requires a complete loaded field set');
      const descriptor = store.descriptor;
      if (!descriptor.heightBinding)
        throw new Error('Active terrain surface requires descriptor.heightBinding');
      for (const material of surface.materialBindings ?? [])
        for (const input of Object.values(material.inputs))
          if (!descriptor.channels.some((channel) => channel.id === input.channel))
            throw new Error(`Unknown material input channel ${input.channel}`);
      sampler = new TerrainFieldSampler(store);
    }
    this.#surfaceSampler?.dispose();
    this.#activeSurface = surface;
    this.#surfaceSampler = sampler;
    this.#surfaceDescriptor = surface ? this.fieldSets.get(surface.setId)!.descriptor : null;
    this.#surfaceRevision++;
    this.#slopeCache = null;
  }
  /** Source raster height, bilinear between source sample centers; not collision triangles. */
  rasterHeightAt(x: number, z: number): number {
    const surface = this.#activeSurface;
    if (!surface) return this.heightAt(x, z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return surface.outsideHeight;
    const descriptor = this.#surfaceDescriptor!;
    const offset = descriptor.sampling === 'cell-center' ? 0.5 : 0;
    const fx = (x - descriptor.origin[0]) / descriptor.spacing - offset;
    const fz = (z - descriptor.origin[1]) / descriptor.spacing - offset;
    if (
      surface.edge === 'constant' &&
      (fx < 0 ||
        fz < 0 ||
        (surface.farEdge === 'exclusive'
          ? fx >= descriptor.width - 1 || fz >= descriptor.height - 1
          : fx > descriptor.width - 1 || fz > descriptor.height - 1))
    )
      return surface.outsideHeight;
    const height = this.#surfaceSampler!.sample(descriptor.heightBinding!.channel, x, z, {
      edge: surface.edge === 'clamp' ? 'clamp' : 'none',
    });
    if (height === null) throw new Error('Active terrain field sample is unavailable');
    return height + descriptor.heightBinding!.offset;
  }
  /** Stored raster tiles; only an explicitly validated active binding changes height queries. */
  readonly fieldSets = new Map<string, TerrainFieldStore>();
  /** Transient staged-set deletion markers for encoding a batch that removes its final tile then set. */
  readonly removedFieldSets = new Set<string>();
  readonly chunks = new Map<string, ChunkData>();
  /** Meters between two vertices. */
  readonly spacing: number;
  /** Vertices per chunk edge. */
  readonly edge: number;

  /** The starter world this place grew from (P2-40); absent means flat ground. */
  world: WorldSeed | null = null;

  constructor(
    /** Half the side length of the playable area (world size tier; `set_size_tier` changes it). */
    public half: number,
    readonly chunkSize = 64,
    /** Cells per chunk edge. */
    readonly resolution = 32,
  ) {
    this.spacing = chunkSize / resolution;
    this.edge = resolution + 1;
  }

  /** Inclusive chunk index range covering the playable area. */
  get chunkRange() {
    const min = Math.floor(-this.half / this.chunkSize);
    const max = Math.ceil(this.half / this.chunkSize) - 1;
    return { min, max };
  }

  chunkAt(x: number, z: number) {
    return { cx: Math.floor(x / this.chunkSize), cz: Math.floor(z / this.chunkSize) };
  }

  /** Returns the chunk, creating a flat grass chunk on first access. */
  getChunk(cx: number, cz: number): ChunkData {
    const key = chunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      const heights = new Float32Array(this.edge * this.edge);
      // A place made from a starter world (P2-40) fills a new chunk from its generator. This is
      // not optional: streaming the ground calls this to build meshes and colliders, so a chunk
      // created empty here would shadow the generator from then on and the world would be flat.
      if (this.world) {
        for (let iz = 0; iz < this.edge; iz += 1)
          for (let ix = 0; ix < this.edge; ix += 1)
            heights[iz * this.edge + ix] = worldHeightAt(
              this.world,
              cx * this.chunkSize + ix * this.spacing,
              cz * this.chunkSize + iz * this.spacing,
              this.half,
            );
      }
      chunk = {
        cx,
        cz,
        heights,
        soils: new Uint8Array(this.edge * this.edge),
        cover: new Uint8Array(this.edge * this.edge),
      };
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  /** World position of a chunk vertex. */
  vertexPosition(chunk: ChunkData, ix: number, iz: number) {
    return {
      x: chunk.cx * this.chunkSize + ix * this.spacing,
      z: chunk.cz * this.chunkSize + iz * this.spacing,
    };
  }

  /** Height at a world vertex position (exact grid point). */
  vertexHeight(x: number, z: number): number {
    if (this.#activeSurface) return this.rasterHeightAt(x, z);
    const { cx, cz } = this.chunkAt(x, z);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    // Nothing stored here: a place made from a starter world (P2-40) falls back to its generator,
    // and every other place is flat at 0 as it always was. A stored chunk always wins, so this is
    // only ever ground nobody has shaped.
    if (!chunk) return this.world ? worldHeightAt(this.world, x, z, this.half) : 0;
    const ix = Math.round((x - cx * this.chunkSize) / this.spacing);
    const iz = Math.round((z - cz * this.chunkSize) / this.spacing);
    return chunk.heights[iz * this.edge + ix] ?? 0;
  }

  /**
   * Places where neighboring vertices differ by more than `maxStep` (P2-11 slope check), one
   * entry per `cell`-meter square with its steepest slope in degrees. Only stored chunks are
   * read (untouched ground is flat), so this stays fast in the biggest places.
   */
  steepCells(maxStep: number, cell = 16): Array<{ x: number; z: number; degrees: number }> {
    if (this.#activeSurface) return this.#rasterSteepCells(maxStep, cell);
    // Heights are 32-bit floats, so ground sculpted right up to the limit may read a hair over.
    const limit = maxStep * 1.02 + 0.01;
    const worst = new Map<string, { x: number; z: number; step: number }>();
    for (const chunk of this.chunks.values()) {
      for (let iz = 0; iz < this.edge; iz++)
        for (let ix = 0; ix < this.edge; ix++) {
          const h = chunk.heights[iz * this.edge + ix] ?? 0;
          const right = ix + 1 < this.edge ? Math.abs((chunk.heights[iz * this.edge + ix + 1] ?? 0) - h) : 0;
          const down = iz + 1 < this.edge ? Math.abs((chunk.heights[(iz + 1) * this.edge + ix] ?? 0) - h) : 0;
          const step = Math.max(right, down);
          if (step <= limit) continue;
          const { x, z } = this.vertexPosition(chunk, ix, iz);
          if (Math.abs(x) > this.half || Math.abs(z) > this.half) continue;
          const key = `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
          const current = worst.get(key);
          if (!current || step > current.step) worst.set(key, { x, z, step });
        }
    }
    return [...worst.values()].map(({ x, z, step }) => ({
      x,
      z,
      degrees: Math.round((Math.atan(step / this.spacing) * 180) / Math.PI),
    }));
  }

  /** Source-grid neighbor slopes, restricted to playable sample centers, without legacy chunks. */
  #rasterSteepCells(maxStep: number, cell: number): Array<{ x: number; z: number; degrees: number }> {
    if (!Number.isFinite(maxStep) || maxStep < 0 || !Number.isFinite(cell) || cell <= 0)
      throw new RangeError('Invalid raster slope threshold or bucket size');
    const d = this.#surfaceDescriptor!,
      surface = this.#activeSurface!,
      store = this.activeSurfaceStore!;
    const cached = this.#slopeCache;
    if (
      cached &&
      cached.maxStep === maxStep &&
      cached.cell === cell &&
      cached.storeRevision === store.revision &&
      cached.surfaceRevision === this.#surfaceRevision
    )
      return cached.values.map((value) => ({ ...value }));
    const center = d.sampling === 'cell-center' ? 0.5 : 0;
    const x0 = d.origin[0] + center * d.spacing,
      z0 = d.origin[1] + center * d.spacing;
    const exclusive = surface.edge === 'constant' && surface.farEdge === 'exclusive' ? 1 : 0;
    const minCol = Math.max(0, Math.ceil((-this.half - x0) / d.spacing));
    const maxCol = Math.min(d.width - 1 - exclusive, Math.floor((this.half - x0) / d.spacing));
    const minRow = Math.max(0, Math.ceil((-this.half - z0) / d.spacing));
    const maxRow = Math.min(d.height - 1 - exclusive, Math.floor((this.half - z0) / d.spacing));
    if (maxCol < minCol || maxRow < minRow) return [];
    const width = maxCol - minCol + 1;
    let row = new Float64Array(width),
      next = new Float64Array(width);
    const loadRow = (target: Float64Array, iz: number) => {
      if (!store.readRow(d.heightBinding!.channel, iz, minCol, target))
        throw new Error('Active terrain field slope sample is unavailable');
    };
    loadRow(row, minRow);
    const limit = maxStep * 1.02 + 0.01;
    const worst = new Map<string, { x: number; z: number; step: number }>();
    for (let iz = minRow; iz <= maxRow; iz++) {
      if (iz < maxRow) loadRow(next, iz + 1);
      for (let ix = 0; ix < width; ix++) {
        const h = row[ix]!;
        const right = ix + 1 < width ? Math.abs(row[ix + 1]! - h) : 0;
        const down = iz < maxRow ? Math.abs(next[ix]! - h) : 0;
        const step = Math.max(right, down);
        if (step <= limit) continue;
        const x = x0 + (ix + minCol) * d.spacing,
          z = z0 + iz * d.spacing;
        const key = `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
        const current = worst.get(key);
        if (!current || step > current.step) worst.set(key, { x, z, step });
      }
      [row, next] = [next, row];
    }
    const values = [...worst.values()].map(({ x, z, step }) => ({
      x,
      z,
      degrees: Math.round((Math.atan(step / d.spacing) * 180) / Math.PI),
    }));
    this.#slopeCache = {
      maxStep,
      cell,
      storeRevision: store.revision,
      surfaceRevision: this.#surfaceRevision,
      values,
    };
    return values.map((value) => ({ ...value }));
  }

  /**
   * Soil of each palette slot (P2-37): slots 0-5 are the six soils; extra slots count as the soil
   * of the library material painted there (set from the place's `terrain.materials`).
   */
  #slotSoils: Soil[] = [...SOILS];

  setSlotSoils(soils: readonly Soil[]): void {
    this.#slotSoils = [...soils];
  }

  /** Palette slot at the grid point nearest to a world position (0 where nothing was painted). */
  slotAt(x: number, z: number): number {
    const gx = Math.round(x / this.spacing) * this.spacing;
    const gz = Math.round(z / this.spacing) * this.spacing;
    const { cx, cz } = this.chunkAt(gx, gz);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk) return 0;
    const ix = Math.round((gx - cx * this.chunkSize) / this.spacing);
    const iz = Math.round((gz - cz * this.chunkSize) / this.spacing);
    return chunk.soils[iz * this.edge + ix] ?? 0;
  }

  /** Soil at the grid point nearest to a world position (footstep sounds, P2-08; item rules). */
  soilAt(x: number, z: number): Soil {
    const slot = this.slotAt(x, z);
    return this.#slotSoils[slot] ?? SOILS[slot] ?? 'grass';
  }

  /** Palette slots painted anywhere on the ground. */
  usedSlots(): Set<number> {
    const used = new Set<number>();
    for (const chunk of this.chunks.values()) for (const slot of chunk.soils) used.add(slot);
    return used;
  }

  /**
   * Legacy height is exactly as the terrain triangles are
   * drawn and collided (each grid cell is split along its (x+1, z) - (x, z+1) diagonal), so
   * things placed with it sit exactly on the visible ground. An active raster instead uses its
   * source bilinear query; native collision triangles approximate it between their vertices.
   */
  heightAt(x: number, z: number): number {
    if (this.#activeSurface) return this.rasterHeightAt(x, z);
    const gx = Math.floor(x / this.spacing) * this.spacing;
    const gz = Math.floor(z / this.spacing) * this.spacing;
    const tx = (x - gx) / this.spacing;
    const tz = (z - gz) / this.spacing;
    const h00 = this.vertexHeight(gx, gz);
    const h10 = this.vertexHeight(gx + this.spacing, gz);
    const h01 = this.vertexHeight(gx, gz + this.spacing);
    if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
    const h11 = this.vertexHeight(gx + this.spacing, gz + this.spacing);
    return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  }

  /**
   * Height of the terrain surface exactly as it is drawn at a level of detail (P2-43): the same
   * triangle interpolation as `heightAt`, but only every `step`-th vertex is a corner, matching
   * the coarse grid `chunkGeometryArrays` builds for a distant chunk. `step = 1` is `heightAt`
   * itself, so a thing resting on ground drawn at full detail never needs a different height.
   */
  drawnHeightAt(x: number, z: number, step: number): number {
    if (this.#activeSurface) return this.rasterHeightAt(x, z);
    const cell = this.spacing * step;
    const gx = Math.floor(x / cell) * cell;
    const gz = Math.floor(z / cell) * cell;
    const tx = (x - gx) / cell;
    const tz = (z - gz) / cell;
    const h00 = this.vertexHeight(gx, gz);
    const h10 = this.vertexHeight(gx + cell, gz);
    const h01 = this.vertexHeight(gx, gz + cell);
    if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
    const h11 = this.vertexHeight(gx + cell, gz + cell);
    return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  }

  /** Visits every chunk vertex inside the area; returns the keys of chunks that were visited. */
  #forEachVertexIn(area: Area, visit: (chunk: ChunkData, index: number, x: number, z: number) => void) {
    const box = bounds(area);
    const { min, max } = this.chunkRange;
    const touched = new Set<string>();
    const c0x = Math.max(min, Math.floor(box.minX / this.chunkSize));
    const c1x = Math.min(max, Math.floor(box.maxX / this.chunkSize));
    const c0z = Math.max(min, Math.floor(box.minZ / this.chunkSize));
    const c1z = Math.min(max, Math.floor(box.maxZ / this.chunkSize));
    for (let cz = c0z; cz <= c1z; cz += 1) {
      for (let cx = c0x; cx <= c1x; cx += 1) {
        const chunk = this.getChunk(cx, cz);
        for (let iz = 0; iz < this.edge; iz += 1) {
          for (let ix = 0; ix < this.edge; ix += 1) {
            const { x, z } = this.vertexPosition(chunk, ix, iz);
            if (x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ) continue;
            if (!insidePolygon(x, z, area)) continue;
            visit(chunk, iz * this.edge + ix, x, z);
            touched.add(chunkKey(cx, cz));
          }
        }
      }
    }
    // Neighbor chunks that share a border vertex also need a rebuild.
    return touched;
  }

  /**
   * Applies a sculpt operation inside the area. `strength` 0..1 maps to up to 1 m per call for
   * raise/lower and to the blend factor for flatten/smooth. `maxStep` is the largest height
   * difference allowed between neighboring vertices (the style's maximum slope, P2-11): an edit
   * never makes the ground steeper than that, so raising again and again grows a hill instead
   * of a cliff (ground that was already steeper is left as it was). Returns the changed chunk keys.
   */
  sculpt(
    area: Area,
    operation: SculptOperation,
    strength: number,
    targetHeight?: number,
    soft = false,
    maxStep = Infinity,
  ): Set<string> {
    const base = Math.min(1, Math.max(0, strength));
    // Soft brush: weight falls from 1 at the area's center to 0 at its farthest corner.
    let cx = 0;
    let cz = 0;
    for (const [x, z] of area) {
      cx += x / area.length;
      cz += z / area.length;
    }
    const radius = Math.max(...area.map(([x, z]) => Math.hypot(x - cx, z - cz))) || 1;
    const weight = (x: number, z: number) => {
      if (!soft) return 1;
      const t = Math.max(0, 1 - Math.hypot(x - cx, z - cz) / radius);
      return t * t * (3 - 2 * t);
    };
    // Read from a snapshot so shared border vertices get identical results in every chunk.
    const target = operation === 'flatten' ? (targetHeight ?? this.#averageHeight(area)) : 0;
    const updates: Array<[ChunkData, number, number]> = [];
    const points: Array<[number, number, number]> = [];
    const touched = this.#forEachVertexIn(area, (chunk, index, x, z) => {
      const h = chunk.heights[index] ?? 0;
      const s = base * weight(x, z);
      let next: number;
      if (operation === 'raise') next = h + s;
      else if (operation === 'lower') next = h - s;
      else if (operation === 'flatten') next = h + (target - h) * s;
      else {
        const sp = this.spacing;
        const avg =
          (this.vertexHeight(x - sp, z) +
            this.vertexHeight(x + sp, z) +
            this.vertexHeight(x, z - sp) +
            this.vertexHeight(x, z + sp)) /
          4;
        next = h + (avg - h) * s;
      }
      updates.push([chunk, index, clampHeight(next)]);
      points.push([x, z, h]);
    });
    if (Number.isFinite(maxStep)) this.#limitSlope(updates, points, maxStep);
    for (const [chunk, index, value] of updates) chunk.heights[index] = value;
    return touched;
  }

  /**
   * Holds edited vertices within `maxStep` of their neighbors, in the direction of the edit only:
   * a raised vertex is capped at its lowest neighbor plus the step, a lowered one at its highest
   * neighbor minus the step, never past where it started. Repeats until nothing changes, so the
   * limit spreads inward from the edge of the edit. Vertices shared by two chunks are one point.
   */
  #limitSlope(
    updates: Array<[ChunkData, number, number]>,
    points: Array<[number, number, number]>,
    maxStep: number,
  ) {
    const key = (x: number, z: number) => `${Math.round(x / this.spacing)},${Math.round(z / this.spacing)}`;
    const edited = new Map<string, { x: number; z: number; from: number; to: number }>();
    updates.forEach(([, , value], i) => {
      const [x, z, from] = points[i]!;
      edited.set(key(x, z), { x, z, from, to: value });
    });
    const sp = this.spacing;
    const heightOf = (x: number, z: number) => edited.get(key(x, z))?.to ?? this.vertexHeight(x, z);
    for (let pass = 0; pass < 256; pass++) {
      let moved = false;
      for (const point of edited.values()) {
        const { x, z, from, to } = point;
        if (to === from) continue;
        const around = [heightOf(x - sp, z), heightOf(x + sp, z), heightOf(x, z - sp), heightOf(x, z + sp)];
        const next =
          to > from
            ? Math.max(from, Math.min(to, Math.min(...around) + maxStep))
            : Math.min(from, Math.max(to, Math.max(...around) - maxStep));
        if (Math.abs(next - to) > 1e-6) {
          point.to = next;
          moved = true;
        }
      }
      if (!moved) break;
    }
    updates.forEach((update, i) => {
      const [x, z] = points[i]!;
      update[2] = edited.get(key(x, z))!.to;
    });
  }

  /**
   * Computes new heights for every chunk vertex inside a box without changing anything.
   * `height(x, z, current)` returns the new height, or undefined to keep it. Border vertices are
   * visited once per chunk that stores them, so shared borders stay identical.
   */
  planHeights(
    box: { minX: number; maxX: number; minZ: number; maxZ: number },
    height: (x: number, z: number, current: number) => number | undefined,
  ): HeightUpdate[] {
    const { min, max } = this.chunkRange;
    const updates: HeightUpdate[] = [];
    const clampX = (v: number) => Math.min(this.half, Math.max(-this.half, v));
    const minX = clampX(box.minX);
    const maxX = clampX(box.maxX);
    const minZ = clampX(box.minZ);
    const maxZ = clampX(box.maxZ);
    for (
      let cz = Math.max(min, Math.floor(minZ / this.chunkSize));
      cz <= Math.min(max, Math.floor(maxZ / this.chunkSize));
      cz += 1
    ) {
      for (
        let cx = Math.max(min, Math.floor(minX / this.chunkSize));
        cx <= Math.min(max, Math.floor(maxX / this.chunkSize));
        cx += 1
      ) {
        const chunk = this.getChunk(cx, cz);
        const ix0 = Math.max(0, Math.ceil((minX - cx * this.chunkSize) / this.spacing));
        const ix1 = Math.min(this.edge - 1, Math.floor((maxX - cx * this.chunkSize) / this.spacing));
        const iz0 = Math.max(0, Math.ceil((minZ - cz * this.chunkSize) / this.spacing));
        const iz1 = Math.min(this.edge - 1, Math.floor((maxZ - cz * this.chunkSize) / this.spacing));
        for (let iz = iz0; iz <= iz1; iz += 1) {
          for (let ix = ix0; ix <= ix1; ix += 1) {
            const index = iz * this.edge + ix;
            const current = chunk.heights[index] ?? 0;
            const { x, z } = this.vertexPosition(chunk, ix, iz);
            const next = height(x, z, current);
            if (next === undefined) continue;
            const value = clampHeight(next);
            if (Math.abs(value - current) > 1e-4) updates.push({ chunk, index, value });
          }
        }
      }
    }
    return updates;
  }

  /** Applies planned height updates; returns the keys of the chunks that changed. */
  applyHeights(updates: readonly HeightUpdate[]): Set<string> {
    const changed = new Set<string>();
    for (const { chunk, index, value } of updates) {
      chunk.heights[index] = value;
      changed.add(chunkKey(chunk.cx, chunk.cz));
    }
    return changed;
  }

  paint(area: Area, soil: Soil): Set<string> {
    const value = SOILS.indexOf(soil);
    if (value < 0) throw new Error(`Unknown soil: ${soil}`);
    return this.paintSlot(area, value);
  }

  /** Paints a palette slot (P2-37: slots 6-15 hold library ground materials). */
  paintSlot(area: Area, slot: number): Set<string> {
    return this.#forEachVertexIn(area, (chunk, index) => {
      chunk.soils[index] = slot;
    });
  }

  /** Paints ground cover, or clears it, or hands the ground back to the world's rules (P2-40). */
  paintCover(area: Area, cover: Cover): Set<string> {
    const value = COVERS.indexOf(cover);
    if (value < 0) throw new Error(`Unknown cover: ${cover}`);
    return this.#forEachVertexIn(area, (chunk, index) => {
      chunk.cover[index] = value;
    });
  }

  /**
   * Visits every ground point inside a box ([minX, maxX] x [minZ, maxZ], clamped to the place), once per chunk that
   * stores it, so border points shared by two chunks get the same treatment in both. Returns the keys of the chunks
   * where `visit` answered true (it changed something there).
   */
  visitBox(
    box: { minX: number; maxX: number; minZ: number; maxZ: number },
    visit: (chunk: ChunkData, index: number, x: number, z: number) => boolean,
  ): Set<string> {
    const { min, max } = this.chunkRange;
    const clamp = (v: number) => Math.min(this.half, Math.max(-this.half, v));
    const minX = clamp(box.minX);
    const maxX = clamp(box.maxX);
    const minZ = clamp(box.minZ);
    const maxZ = clamp(box.maxZ);
    const touched = new Set<string>();
    if (minX > maxX || minZ > maxZ) return touched;
    for (
      let cz = Math.max(min, Math.floor(minZ / this.chunkSize));
      cz <= Math.min(max, Math.floor(maxZ / this.chunkSize));
      cz += 1
    )
      for (
        let cx = Math.max(min, Math.floor(minX / this.chunkSize));
        cx <= Math.min(max, Math.floor(maxX / this.chunkSize));
        cx += 1
      ) {
        const chunk = this.getChunk(cx, cz);
        const ix0 = Math.max(0, Math.ceil((minX - cx * this.chunkSize) / this.spacing - 1e-9));
        const ix1 = Math.min(this.edge - 1, Math.floor((maxX - cx * this.chunkSize) / this.spacing + 1e-9));
        const iz0 = Math.max(0, Math.ceil((minZ - cz * this.chunkSize) / this.spacing - 1e-9));
        const iz1 = Math.min(this.edge - 1, Math.floor((maxZ - cz * this.chunkSize) / this.spacing + 1e-9));
        for (let iz = iz0; iz <= iz1; iz += 1)
          for (let ix = ix0; ix <= ix1; ix += 1) {
            const { x, z } = this.vertexPosition(chunk, ix, iz);
            if (visit(chunk, iz * this.edge + ix, x, z)) touched.add(chunkKey(cx, cz));
          }
      }
    return touched;
  }

  /** Steepest slope at a ground point in degrees, from its four neighbours (Tidewater world, `paint_rule`). */
  slopeAt(x: number, z: number): number {
    const sp = this.spacing;
    const dx = (this.vertexHeight(x + sp, z) - this.vertexHeight(x - sp, z)) / (2 * sp);
    const dz = (this.vertexHeight(x, z + sp) - this.vertexHeight(x, z - sp)) / (2 * sp);
    return (Math.atan(Math.hypot(dx, dz)) * 180) / Math.PI;
  }

  /**
   * True while a chunk still holds exactly what the world would give anyway, so it is not worth
   * storing. Without a starter world that means flat and unpainted, as it always did.
   */
  isGenerated(chunk: ChunkData): boolean {
    if (!chunk.soils.every((s) => s === 0) || !chunk.cover.every((c) => c === 0)) return false;
    if (!this.world) return chunk.heights.every((h) => h === 0);
    for (let iz = 0; iz < this.edge; iz += 1)
      for (let ix = 0; ix < this.edge; ix += 1) {
        const index = iz * this.edge + ix;
        const height = worldHeightAt(
          this.world,
          chunk.cx * this.chunkSize + ix * this.spacing,
          chunk.cz * this.chunkSize + iz * this.spacing,
          this.half,
        );
        if (Math.abs((chunk.heights[index] ?? 0) - height) > 1e-4) return false;
      }
    return true;
  }

  /** The cover at a point: what the creator painted there, or `default` where they have not. */
  coverAt(x: number, z: number): Cover {
    const { cx, cz } = this.chunkAt(x, z);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk) return 'default';
    const ix = Math.round((x - cx * this.chunkSize) / this.spacing);
    const iz = Math.round((z - cz * this.chunkSize) / this.spacing);
    return COVERS[chunk.cover[iz * this.edge + ix] ?? 0] ?? 'default';
  }

  #averageHeight(area: Area): number {
    let sum = 0;
    let count = 0;
    this.#forEachVertexIn(area, (chunk, index) => {
      sum += chunk.heights[index] ?? 0;
      count += 1;
    });
    return count === 0 ? 0 : sum / count;
  }
}

/** Vertex positions and triangle indices of one chunk at a level of detail (step 1 = full). */
export function chunkGeometryArrays(terrain: TerrainData, chunk: ChunkData, step: number) {
  const edge = terrain.edge;
  const count = Math.floor((edge - 1) / step) + 1;
  const positions = new Float32Array(count * count * 3);
  let p = 0;
  for (let iz = 0; iz < edge; iz += step) {
    for (let ix = 0; ix < edge; ix += step) {
      const { x, z } = terrain.vertexPosition(chunk, ix, iz);
      positions[p++] = x;
      positions[p++] = chunk.heights[iz * edge + ix] ?? 0;
      positions[p++] = z;
    }
  }
  const indices = new Uint32Array((count - 1) * (count - 1) * 6);
  let i = 0;
  for (let z = 0; z < count - 1; z += 1) {
    for (let x = 0; x < count - 1; x += 1) {
      const a = z * count + x;
      const b = a + 1;
      const c = a + count;
      const d = c + 1;
      indices.set([a, c, b, b, c, d], i);
      i += 6;
    }
  }
  return { positions, indices, count };
}

// -- storage encoding (terrain.chunks in the world document point to stored chunk blobs) --------

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Map([...ALPHABET].map((char, index) => [char, index]));

/** Base64 without relying on btoa/Buffer, so the same code runs in browsers, Node, and workers. */
export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]!;
    out += b === undefined ? '=' : ALPHABET[(n >> 6) & 63]!;
    out += c === undefined ? '=' : ALPHABET[n & 63]!;
  }
  return out;
}

export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/=+$/, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (const char of clean) {
    const value = LOOKUP.get(char);
    if (value === undefined) throw new Error('Invalid base64');
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[index++] = (buffer >> bits) & 255;
    }
  }
  return bytes;
}

export function encodeChunk(chunk: ChunkData): string {
  const heights = new Uint8Array(chunk.heights.buffer, chunk.heights.byteOffset, chunk.heights.byteLength);
  // Cover (P2-40) is written only when there is any, so chunks nobody has painted do not grow and
  // a build that does not know about it still reads everything else. The version stays 1 on
  // purpose: an older reader then loses the cover rather than refusing the whole chunk.
  const painted = chunk.cover.some((value) => value !== 0);
  return JSON.stringify({
    v: 1,
    cx: chunk.cx,
    cz: chunk.cz,
    h: toBase64(heights),
    s: toBase64(chunk.soils),
    ...(painted ? { c: toBase64(chunk.cover) } : {}),
  });
}

export function decodeChunk(text: string): ChunkData {
  const parsed = JSON.parse(text) as { v: number; cx: number; cz: number; h: string; s: string; c?: string };
  if (parsed.v !== 1) throw new Error(`Unsupported chunk version ${parsed.v}`);
  const heightBytes = fromBase64(parsed.h);
  // Copy into an aligned buffer: Float32Array needs a 4-byte aligned offset.
  const aligned = new Uint8Array(heightBytes.byteLength);
  aligned.set(heightBytes);
  return {
    cx: parsed.cx,
    cz: parsed.cz,
    heights: new Float32Array(aligned.buffer, 0, aligned.byteLength / 4),
    soils: fromBase64(parsed.s),
    // A chunk stored before cover existed reads back as all zeroes, which means "follow the
    // world's own rules" - exactly what it did before.
    cover: parsed.c ? fromBase64(parsed.c) : new Uint8Array(fromBase64(parsed.s).length),
  };
}
