import type { GeneratedLimit, GeneratedLook, GeneratedParam, ItemBounds } from '@genvr/core-library';
import {
  Box3,
  BoxGeometry,
  Matrix4,
  MeshStandardMaterial,
  type BufferGeometry,
  type Material,
} from 'three/webgpu';
import type { PackageMesh } from './item-packages.js';
import { PALM_GENERATOR, PALM_PREVIEW_MATERIAL, createPalmPreviewMaterial, palmGenerator } from './vegetation/palm-generator.js';
import { CANOPY_TREE_GENERATOR, CANOPY_SHRUB_GENERATOR, CANOPY_PREVIEW_MATERIAL, createCanopyPreviewMaterial, canopyTreeGenerator, canopyShrubGenerator } from './vegetation/canopy-generator.js';

/**
 * Runtime generators of generated looks (Tidewater world, decision 130). A Core Library item with a
 * `GeneratedLook` names a generator; the generator turns the item's parameters (its defaults, overridden by the
 * placed instance's own `params` within the limits) into geometry per level of detail. Generators are pure
 * geometry (node-testable); materials are shared by key, so many items draw with few materials. Builds are kept by
 * generator and parameters, so every instance with the same parameters shares one build and one batch.
 */

/** One mesh of a generated level: its geometry and the key of a shared material. */
export interface GeneratedMesh {
  geometry: BufferGeometry;
  material: string;
}

export interface GeneratedBuild {
  /** Meshes per level of detail, nearest first. */
  levels: ReadonlyArray<ReadonlyArray<GeneratedMesh>>;
  /** What a player bumps into, where much smaller than the whole (a trunk); absent: the whole box. */
  blocks?: ItemBounds;
}

export interface Generator {
  /** Pure: the same parameters and seed always give the same geometry. */
  build(params: Readonly<Record<string, GeneratedParam>>, seed: number): GeneratedBuild;
  /** Far copies are drawn as impostors (vegetation, later tasks). */
  impostor?: true;
}

/** A generated item as `ItemsView` draws it: meshes like a package model's, its LOD levels and bounds. */
export interface GeneratedModel {
  meshes: PackageMesh[];
  lods: PackageMesh[][];
  bounds: ItemBounds;
  blocks?: ItemBounds;
}

const generators = new Map<string, Generator>();
const materialMakers = new Map<string, () => Material>();
const materials = new Map<string, Material>();
const builds = new Map<string, GeneratedModel>();
let buildCount = 0;

export function registerGenerator(id: string, generator: Generator): void {
  generators.set(id, generator);
  for (const key of [...builds.keys()]) if (key.startsWith(`${id}|`)) builds.delete(key);
}

export const hasGenerator = (id: string): boolean => generators.has(id);

/** A shared material by key, made on first use. */
export function registerGeneratorMaterial(key: string, make: () => Material): void {
  materialMakers.set(key, make);
  materials.delete(key);
}

function material(key: string): Material {
  let made = materials.get(key);
  if (!made) {
    const make = materialMakers.get(key) ?? materialMakers.get(PLAIN)!;
    made = make();
    materials.set(key, made);
  }
  return made;
}

/** How many builds were made so far (tests: equal parameters share one). */
export const generatedBuildCount = (): number => buildCount;

/** Parameters in a stable order, so `{a, b}` and `{b, a}` share a build. */
function paramsKey(params: Readonly<Record<string, GeneratedParam>>): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${key}=${JSON.stringify(params[key])}`)
    .join(',');
}

const IDENTITY = new Matrix4();

/** The build of a generator for some parameters, made once and kept; null when the generator is unknown. */
export function buildGenerated(
  id: string,
  params: Readonly<Record<string, GeneratedParam>>,
): GeneratedModel | null {
  const generator = generators.get(id);
  if (!generator) return null;
  const key = `${id}|${paramsKey(params)}`;
  let model = builds.get(key);
  if (model) return model;
  const seed = typeof params.seed === 'number' ? params.seed : 0;
  const built = generator.build(params, seed);
  buildCount += 1;
  const levels = built.levels.map((level) =>
    level.map((mesh) => ({ geometry: mesh.geometry, material: material(mesh.material), matrix: IDENTITY })),
  );
  const box = new Box3();
  for (const mesh of levels[0] ?? []) {
    mesh.geometry.computeBoundingBox();
    if (mesh.geometry.boundingBox) box.union(mesh.geometry.boundingBox);
  }
  model = {
    meshes: levels[0] ?? [],
    lods: levels.slice(1),
    bounds: {
      min: [box.min.x, box.min.y, box.min.z],
      max: [box.max.x, box.max.y, box.max.z],
    },
    ...(built.blocks ? { blocks: built.blocks } : {}),
  };
  builds.set(key, model);
  return model;
}

/** One parameter kept inside its limits (the server refuses values outside them; old data still draws). */
function within(
  value: GeneratedParam,
  fallback: GeneratedParam,
  limit: GeneratedLimit | undefined,
): GeneratedParam {
  if (typeof value !== typeof fallback) return fallback;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(limit?.max ?? Infinity, Math.max(limit?.min ?? -Infinity, value));
  }
  if (typeof value === 'string' && limit?.values && !limit.values.includes(value)) return fallback;
  return value;
}

/** The parameters a generated look draws with: its defaults, overridden by an instance's own within the limits. */
export function generatedParams(
  look: GeneratedLook,
  instanceParams?: Readonly<Record<string, unknown>>,
): Record<string, GeneratedParam> {
  const { params, limits } = look.generated;
  const out: Record<string, GeneratedParam> = {};
  for (const [key, fallback] of Object.entries(params)) {
    const value = instanceParams?.[key];
    out[key] =
      typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean'
        ? within(value, fallback, limits[key])
        : fallback;
  }
  return out;
}

/** A plain matte material, used by the test box and by any key nobody registered. */
const PLAIN = 'genvr.plain';
registerGeneratorMaterial(PLAIN, () => new MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.85 }));
registerGeneratorMaterial(PALM_PREVIEW_MATERIAL, createPalmPreviewMaterial);
registerGenerator(PALM_GENERATOR, palmGenerator);
registerGeneratorMaterial(CANOPY_PREVIEW_MATERIAL, createCanopyPreviewMaterial);
registerGenerator(CANOPY_TREE_GENERATOR, canopyTreeGenerator);
registerGenerator(CANOPY_SHRUB_GENERATOR, canopyShrubGenerator);

/**
 * The test box (Tidewater world plan, task 1): a box standing on the ground, width x height x depth. It proves the
 * generated-look path end to end before the first real Tidewater module.
 */
registerGenerator('genvr.test-box', {
  build(params) {
    const width = Number(params.width ?? 1);
    const height = Number(params.height ?? 1);
    const depth = Number(params.depth ?? 1);
    const geometry = new BoxGeometry(width, height, depth);
    geometry.translate(0, height / 2, 0);
    return { levels: [[{ geometry, material: PLAIN }]] };
  },
});
