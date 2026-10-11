import type { Wall, WorldDocument } from '@genvr/contracts';
import { getGround } from '@genvr/core-library';
import {
  BUILDING_WALL_MATERIAL,
  roadProfile,
  roomFloorLevel,
  type RoadSample,
  wallBoxes,
  type TerrainData,
  type WallBox,
} from '@genvr/world';
import {
  BufferAttribute,
  BufferGeometry,
  type Camera,
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  type PerspectiveCamera,
  RepeatWrapping,
  ShapeUtils,
  SRGBColorSpace,
  Vector2,
  type Material,
} from 'three/webgpu';
import type { PhysicsWorld } from './physics.js';
import { buildRoad, groundTexture, planJunctions, RoadMaterials } from './road-view.js';
import { buildPaving, PavingMaterials, pavingLevels } from './paving-view.js';
import { type Arrays, BuildingMaterials, buildingParts, type BuildingParts } from './building-view.js';

type HeightAt = (x: number, z: number) => number;

function canvasTexture(width: number, height: number, draw: (c: CanvasRenderingContext2D) => void) {
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

/** Light plaster bricks; 1 texture repeat = 2 m. */
export const wallTexture = () =>
  canvasTexture(128, 128, (c) => {
    c.fillStyle = '#e9dfcf';
    c.fillRect(0, 0, 128, 128);
    c.fillStyle = '#d6c8b2';
    for (let row = 0; row < 8; row += 1) {
      c.fillRect(0, row * 16, 128, 2);
      for (let col = 0; col < 4; col += 1)
        c.fillRect(((col * 32 + (row % 2) * 16) % 128) + 0, row * 16, 2, 16);
    }
  });

/** Wooden floor boards; 1 repeat = 2 m. */
export const floorTexture = () =>
  canvasTexture(128, 128, (c) => {
    c.fillStyle = '#c89a64';
    c.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 8; i += 1) {
      c.fillStyle = i % 2 ? '#bf8f5a' : '#cfa370';
      c.fillRect(0, i * 16, 128, 15);
    }
  });

/** All wall boxes merged into one geometry; UVs in meters / 2 so bricks keep their size. */
export function boxesGeometry(boxes: readonly WallBox[]) {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  // Face: normal axis, and the two in-face axes (u, v), each as local unit vectors.
  const faces: Array<[number[], number[], number[]]> = [
    [
      [1, 0, 0],
      [0, 0, -1],
      [0, 1, 0],
    ],
    [
      [-1, 0, 0],
      [0, 0, 1],
      [0, 1, 0],
    ],
    [
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, -1],
    ],
    [
      [0, -1, 0],
      [1, 0, 0],
      [0, 0, 1],
    ],
    [
      [0, 0, 1],
      [1, 0, 0],
      [0, 1, 0],
    ],
    [
      [0, 0, -1],
      [-1, 0, 0],
      [0, 1, 0],
    ],
  ];
  for (const { center, half, yaw } of boxes) {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    // Local -> world rotation about Y: x -> (cos, 0, -sin), z -> (sin, 0, cos).
    const rotate = (v: number[]) => [v[0]! * cos + v[2]! * sin, v[1]!, -v[0]! * sin + v[2]! * cos];
    for (const [normal, u, v] of faces) {
      const base = positions.length / 3;
      const size = (axis: number[]) =>
        Math.abs(axis[0]!) * half[0] + Math.abs(axis[1]!) * half[1] + Math.abs(axis[2]!) * half[2];
      const nu = size(u);
      const nv = size(v);
      const nn = size(normal);
      for (const [su, sv] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const) {
        const local = [0, 1, 2].map((k) => normal[k]! * nn + u[k]! * nu * su + v[k]! * nv * sv);
        const world = rotate(local);
        positions.push(center[0] + world[0]!, center[1] + world[1]!, center[2] + world[2]!);
        normals.push(...rotate(normal));
        uvs.push(((su + 1) * nu) / 2, ((sv + 1) * nv) / 2);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/** Triangulated room floor at a height (render and collider share it). */
export function floorArrays(points: ReadonlyArray<readonly [number, number]>, level: number) {
  const contour = points.map(([x, z]) => new Vector2(x, z));
  const triangles = ShapeUtils.triangulateShape(contour, []);
  const positions = new Float32Array(points.length * 3);
  const uvs = new Float32Array(points.length * 2);
  points.forEach(([x, z], i) => {
    positions.set([x, level, z], i * 3);
    uvs.set([x / 2, z / 2], i * 2);
  });
  const indices = new Uint32Array(triangles.flat());
  return { positions, uvs, indices };
}

/** A real building's parts, kept to merge every building into one walls mesh and one roofs mesh. */
interface BuiltBuilding {
  signature: string;
  /** The built boxes and roof level, to skip ground news that moved nothing. */
  shape: string;
  /** The 64 m cell whose merged meshes hold it. */
  cell: string;
  /** Facade, roof, windows and doors (R4b). */
  parts: BuildingParts;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/** Buildings are merged per 64 m cell, so one change redraws its cell, not the whole town. */
const CELL = 64;
/** Window panes and frames of a cell are drawn while the camera is this near to it, metres. */
const WINDOWS_DISTANCE = 320;
function cellOf(points: ReadonlyArray<readonly [number, number]>): string {
  const x = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const z = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  return `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
}

interface Built {
  signature: string;
  meshes: Mesh[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

function boundsOf(points: ReadonlyArray<readonly [number, number]>, pad: number) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of points) {
    minX = Math.min(minX, x - pad);
    maxX = Math.max(maxX, x + pad);
    minZ = Math.min(minZ, z - pad);
    maxZ = Math.max(maxZ, z + pad);
  }
  return { minX, maxX, minZ, maxZ };
}

export interface StructureMaterials {
  wall: Material;
  floor: Material;
}

export function createStructureMaterials(): StructureMaterials {
  return {
    wall: new MeshStandardMaterial({ map: wallTexture(), roughness: 0.85 }),
    floor: new MeshStandardMaterial({ map: floorTexture(), roughness: 0.8, side: DoubleSide }),
  };
}

/** Builds the meshes of one wall with its room floor (also used for the ghost preview). */
export function buildWallMeshes(
  wall: Wall,
  heightAt: HeightAt,
  materials: Pick<StructureMaterials, 'wall' | 'floor'>,
) {
  const boxes = wallBoxes(wall, heightAt);
  const meshes: Mesh[] = [];
  if (boxes.length) {
    const mesh = new Mesh(boxesGeometry(boxes), materials.wall);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `wall:${wall.id}`;
    meshes.push(mesh);
  }
  const level = roomFloorLevel(wall, heightAt);
  let floor: ReturnType<typeof floorArrays> | null = null;
  if (level !== null) {
    floor = floorArrays(wall.points, level);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(floor.positions, 3));
    geometry.setAttribute('uv', new BufferAttribute(floor.uvs, 2));
    geometry.setIndex(new BufferAttribute(floor.indices, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new Mesh(geometry, materials.floor);
    mesh.receiveShadow = true;
    mesh.name = `floor:${wall.id}`;
    meshes.push(mesh);
  }
  return { meshes, boxes, floor };
}

/**
 * Renders the world's roads and walls (with room floors) and keeps their physics colliders in
 * sync. Only structures whose data changed, or whose ground changed under them, are rebuilt.
 */
export class StructuresView {
  readonly group = new Group();
  readonly materials = createStructureMaterials();
  readonly roadMaterials = new RoadMaterials();
  readonly pavingMaterials = new PavingMaterials();
  readonly buildingMaterials = new BuildingMaterials();
  readonly #built = new Map<string, Built>();
  readonly #buildings = new Map<string, BuiltBuilding>();
  /** Merged meshes of real buildings per 64 m cell, and the cells to draw again after a sync. */
  readonly #cells = new Map<string, Mesh[]>();
  readonly #dirtyCells = new Set<string>();
  readonly #heightAt: HeightAt;
  /** Plain walls drawn with a look (draw_wall material): one material per Core ground surface. */
  readonly #wallSurfaces = new Map<string, MeshStandardMaterial>();
  /** Each road's height profile, kept while the road and the water stay the same. */
  readonly #profiles = new Map<string, { signature: string; samples: RoadSample[] }>();

  constructor(
    private readonly terrain: TerrainData,
    private readonly physics: PhysicsWorld,
  ) {
    this.group.name = 'structures';
    this.#heightAt = (x, z) => terrain.heightAt(x, z);
  }

  /** Call after every command with the terrain chunks it changed. */
  sync(doc: WorldDocument, changedChunks: Iterable<string> = []): void {
    const changed = [...changedChunks].map((key) => {
      const [cx, cz] = key.split(',').map(Number) as [number, number];
      return {
        minX: cx * this.terrain.chunkSize,
        maxX: (cx + 1) * this.terrain.chunkSize,
        minZ: cz * this.terrain.chunkSize,
        maxZ: (cz + 1) * this.terrain.chunkSize,
      };
    });
    const groundChanged = (b: Built['bounds']) =>
      changed.some((c) => c.minX <= b.maxX && c.maxX >= b.minX && c.minZ <= b.maxZ && c.maxZ >= b.minZ);

    const wanted = new Set<string>();
    // Roads become bridges over water, so they also rebuild when water changes.
    const water = doc.environment.water;
    const waterSignature = JSON.stringify(water);
    // Where roads cross, which is drawn on top (R2f); a road rebuilds when its crossings change too.
    const profiles = doc.roads.map((road) => {
      const signature = JSON.stringify(road) + waterSignature;
      const cached = this.#profiles.get(road.id);
      if (cached && cached.signature === signature) return cached;
      const profile = { signature, samples: roadProfile(this.terrain, road.points, water) };
      this.#profiles.set(road.id, profile);
      return profile;
    });
    for (const id of this.#profiles.keys()) if (!doc.roads.some((r) => r.id === id)) this.#profiles.delete(id);
    const junctions = planJunctions(doc.roads.map((road, i) => ({ ...road, samples: profiles[i]!.samples })));
    doc.roads.forEach((road, i) => {
      const key = `road:${road.id}`;
      wanted.add(key);
      const junction = junctions.get(road.id);
      const signature = profiles[i]!.signature + JSON.stringify(junction);
      const existing = this.#built.get(key);
      if (existing && existing.signature === signature && !groundChanged(existing.bounds)) return;
      this.#remove(key);
      // Fresh heights when the ground under an existing road changed.
      const samples = existing ? roadProfile(this.terrain, road.points, water) : profiles[i]!.samples;
      this.#profiles.set(road.id, { signature: profiles[i]!.signature, samples });
      const { meshes, collider } = buildRoad(road, samples, this.#heightAt, this.roadMaterials, { junctions: junction });
      for (const mesh of meshes) this.group.add(mesh);
      if (collider) this.physics.setStructure(key, [], [collider]);
      this.#built.set(key, { signature, meshes, bounds: boundsOf(road.points, road.width) });
    });
    // Paved areas (R2l): laid on the ground, under the streets; redrawn when they or their ground change.
    const levels = pavingLevels(doc.pavings ?? []);
    for (const paving of doc.pavings ?? []) {
      const key = `paving:${paving.id}`;
      wanted.add(key);
      const level = levels.get(paving.id) ?? 0;
      const signature = JSON.stringify(paving) + level;
      const existing = this.#built.get(key);
      if (existing && existing.signature === signature && !groundChanged(existing.bounds)) continue;
      this.#remove(key);
      const mesh = buildPaving(paving, this.#heightAt, this.pavingMaterials, level);
      this.group.add(mesh);
      this.#built.set(key, { signature, meshes: [mesh], bounds: boundsOf(paving.area, 1) });
    }
    for (const wall of doc.walls) {
      const key = `wall:${wall.id}`;
      wanted.add(key);
      const signature = JSON.stringify(wall);
      if (wall.materialId === BUILDING_WALL_MATERIAL && wall.closed) {
        // A real building (Real place R4): a roof on the exact outline instead of a room floor, drawn merged with the
        // other buildings of its 64 m cell (hundreds of buildings were hundreds of draw calls, five times with shadows).
        const existing = this.#buildings.get(key);
        if (existing && existing.signature === signature && !groundChanged(existing.bounds)) continue;
        this.#remove(key);
        const boxes = wallBoxes(wall, this.#heightAt);
        const level = roomFloorLevel(wall, this.#heightAt) ?? 0;
        const shape = JSON.stringify(boxes) + level;
        // Ground news that did not move this building (detail streaming) rebuilds nothing.
        if (existing && existing.signature === signature && existing.shape === shape) continue;
        const parts = buildingParts(wall, this.#heightAt, level);
        this.physics.setStructure(key, boxes, [parts.collider]);
        const cell = cellOf(wall.points);
        if (existing) this.#dirtyCells.add(existing.cell);
        this.#dirtyCells.add(cell);
        this.#buildings.set(key, {
          signature,
          shape,
          cell,
          parts,
          bounds: boundsOf(wall.points, 1),
        });
        continue;
      }
      const old = this.#buildings.get(key);
      if (old) {
        this.#buildings.delete(key);
        this.physics.removeStructure(key);
        this.#dirtyCells.add(old.cell);
      }
      const existing = this.#built.get(key);
      if (existing && existing.signature === signature && !groundChanged(existing.bounds)) continue;
      this.#remove(key);
      const { meshes, boxes, floor } = buildWallMeshes(wall, this.#heightAt, {
        wall: this.#wallMaterial(wall.materialId),
        floor: this.materials.floor,
      });
      for (const mesh of meshes) this.group.add(mesh);
      this.physics.setStructure(
        key,
        boxes,
        floor ? [{ positions: floor.positions, indices: floor.indices }] : [],
      );
      this.#built.set(key, { signature, meshes, bounds: boundsOf(wall.points, 1) });
    }
    for (const key of [...this.#built.keys()]) if (!wanted.has(key)) this.#remove(key);
    for (const [key, building] of [...this.#buildings])
      if (!wanted.has(key)) {
        this.#buildings.delete(key);
        this.physics.removeStructure(key);
        this.#dirtyCells.add(building.cell);
      }
    for (const cell of this.#dirtyCells) this.#drawCell(cell);
    this.#dirtyCells.clear();
  }

  /**
   * One cell's real buildings: one mesh per facade and roof surface, one for window glass and one for frames and
   * doors; a hit face maps back to its wall. Windows are only drawn near the camera (they are many small faces).
   */
  #drawCell(cell: string): void {
    for (const mesh of this.#cells.get(cell) ?? []) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
    }
    this.#cells.delete(cell);
    const inCell = [...this.#buildings].filter(([, building]) => building.cell === cell);
    if (!inCell.length) return;
    const merged = new Map<string, { arrays: Arrays; owners: string[]; material: Material; kind: string }>();
    const add = (key: string, kind: string, material: Material, arrays: Arrays, id: string) => {
      let entry = merged.get(key);
      if (!entry) merged.set(key, (entry = { arrays: { positions: [], normals: [], uvs: [], colors: [], indices: [] }, owners: [], material, kind }));
      const offset = entry.arrays.positions.length / 3;
      for (const name of ['positions', 'normals', 'uvs', 'colors'] as const)
        for (const value of arrays[name]) entry.arrays[name].push(value);
      for (const index of arrays.indices) entry.arrays.indices.push(offset + index);
      for (let t = 0; t < arrays.indices.length / 3; t += 1) entry.owners.push(id);
    };
    for (const [key, { parts }] of inCell) {
      const id = key.slice('wall:'.length);
      add(`facade:${parts.facadeSurface}`, 'walls', this.buildingMaterials.facade(parts.facadeSurface), parts.facade, id);
      add(`roof:${parts.roofSurface}`, 'roofs', this.buildingMaterials.roof(parts.roofSurface), parts.roof, id);
      add('glass', 'windows', this.buildingMaterials.glass, parts.glass, id);
      add('frames', 'windows', this.buildingMaterials.frames, parts.frames, id);
    }
    const meshes: Mesh[] = [];
    const windows: Mesh[] = [];
    for (const [key, { arrays, owners, material, kind }] of merged) {
      if (!arrays.indices.length) continue;
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(arrays.positions), 3));
      geometry.setAttribute('normal', new BufferAttribute(new Float32Array(arrays.normals), 3));
      geometry.setAttribute('uv', new BufferAttribute(new Float32Array(arrays.uvs), 2));
      geometry.setAttribute('color', new BufferAttribute(new Float32Array(arrays.colors), 3));
      geometry.setIndex(arrays.indices);
      geometry.computeBoundingSphere();
      const mesh = new Mesh(geometry, material);
      mesh.name = `buildings:${kind}:${key}:${cell}`;
      // Window panes and frames are too small to cast shadows that matter.
      mesh.castShadow = kind !== 'windows';
      mesh.receiveShadow = true;
      mesh.userData.wallIdAt = (faceIndex: number) => owners[faceIndex] ?? null;
      if (kind === 'windows') windows.push(mesh);
      meshes.push(mesh);
      this.group.add(mesh);
    }
    // Windows near the camera only: a facade mesh of the cell switches them as it is drawn.
    const centre = meshes[0]?.geometry.boundingSphere?.center.clone();
    const shower = meshes.find((mesh) => !windows.includes(mesh));
    if (centre && shower && windows.length) {
      const near = (camera: Camera) => camera.position.distanceTo(centre) < WINDOWS_DISTANCE;
      shower.onBeforeRender = (_renderer, _scene, camera) => {
        if (!(camera as PerspectiveCamera).isPerspectiveCamera) return;
        const show = near(camera);
        for (const mesh of windows) mesh.visible = show;
      };
    }
    this.#cells.set(cell, meshes);
  }

  #remove(key: string): void {
    const built = this.#built.get(key);
    if (!built) return;
    for (const mesh of built.meshes) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
    }
    this.physics.removeStructure(key);
    this.#built.delete(key);
  }

  /** The plaster bricks, or the Core ground surface a wall was drawn with (its UVs are metres / 2). */
  #wallMaterial(materialId: string | undefined): Material {
    const ground = materialId ? getGround(materialId) : undefined;
    if (!ground) return this.materials.wall;
    let material = this.#wallSurfaces.get(ground.name);
    if (!material) {
      const map = groundTexture(ground.name);
      map.repeat.set(2 / ground.tile, 2 / ground.tile);
      material = new MeshStandardMaterial({ map, roughness: 0.9 });
      this.#wallSurfaces.set(ground.name, material);
    }
    return material;
  }

  get count(): number {
    return this.#built.size + this.#buildings.size;
  }

  dispose(): void {
    for (const key of [...this.#built.keys()]) this.#remove(key);
    for (const key of this.#buildings.keys()) this.physics.removeStructure(key);
    const cells = new Set([...this.#buildings.values()].map((building) => building.cell));
    this.#buildings.clear();
    for (const cell of cells) this.#drawCell(cell);
    for (const material of Object.values(this.materials)) {
      (material as MeshStandardMaterial).map?.dispose();
      material.dispose();
    }
    for (const material of this.#wallSurfaces.values()) {
      material.map?.dispose();
      material.dispose();
    }
    this.#wallSurfaces.clear();
    this.roadMaterials.dispose();
    this.pavingMaterials.dispose();
    this.buildingMaterials.dispose();
  }
}
