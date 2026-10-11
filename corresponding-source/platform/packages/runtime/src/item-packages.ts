import type { GenvrManifest, ItemPackage, Style } from '@genvr/contracts';
import { getCoreItem, itemModelLook, type ItemBounds } from '@genvr/core-library';
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Matrix4,
  Mesh,
  Vector3,
  type Material,
  type Object3D,
  type AnimationClip,
  type InstancedMesh,
} from 'three/webgpu';
import { createGltfLoader, parseGltf, type GltfLoaderOptions } from './gltf.js';

/** Asks the platform for an item's package (manifest and file links); null when there is none. */
export type PackageFetcher = (itemId: string) => Promise<ItemPackage | null>;

/** One mesh of a package model, with its place inside the model. */
export interface PackageMesh {
  geometry: BufferGeometry;
  material: Material;
  /** Model-space matrix of the mesh (applied before the placed item's own transform). */
  matrix: Matrix4;
  /** Optional per-world procedural binding, invoked once for each ItemsView batch/LOD mesh.
   * Instance matrices are populated after setup; read them at render/update time.
   * Do not mutate shared model geometry/materials. Return cleanup for owned resources.
   * Static model geometry remains the source for preview, bounds and fallback drawing. */
  setupInstance?: (mesh: InstancedMesh) => (() => void) | void;
}

/** A loaded package model, ready to draw. */
export interface LoadedPackage {
  manifest: GenvrManifest;
  meshes: PackageMesh[];
  bounds: ItemBounds;
  /** The glTF scene and clips (for animated items, P2-16 slice d). */
  scene: Object3D;
  animations: AnimationClip[];
  /** Sound name to signed file link (`manifest.audio`). */
  sounds: Record<string, string>;
  /** Simpler versions for far away (decision 94), nearest first; moving models too. */
  lods: PackageMesh[][];
}

type Entry = { state: 'loading' } | { state: 'missing' } | { state: 'ready'; model: LoadedPackage };

/**
 * glTF packages of non-Core items (P2-16 slice c): each item is fetched and parsed once; the
 * items view asks for a model and is told when it arrives. Items without a package, or whose
 * files fail to load, stay "missing" (drawn as the placeholder box).
 */
export class ItemPackages {
  readonly #entries = new Map<string, Entry>();
  readonly #listeners = new Set<(itemId: string) => void>();
  readonly #loader;

  constructor(
    private readonly fetchPackage: PackageFetcher,
    options: GltfLoaderOptions = {},
    private readonly fetchFile: (url: string) => Promise<ArrayBuffer> = async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Package file answered ${response.status}.`);
      return response.arrayBuffer();
    },
  ) {
    this.#loader = createGltfLoader(options);
  }

  /** The loaded model, or null while loading or when it is missing (loading starts on first ask). */
  get(itemId: string): LoadedPackage | null {
    const entry = this.#entries.get(itemId);
    if (entry) return entry.state === 'ready' ? entry.model : null;
    this.#entries.set(itemId, { state: 'loading' });
    void this.#load(itemId);
    return null;
  }

  /** True once the package is known to be missing or failed (not while it loads). */
  isMissing(itemId: string): boolean {
    return this.#entries.get(itemId)?.state === 'missing';
  }

  /** Called with the item id whenever a model finishes loading. */
  onLoaded(listener: (itemId: string) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Resolves when the package is loaded or known missing (tests, pictures). */
  async whenSettled(itemId: string): Promise<LoadedPackage | null> {
    this.get(itemId);
    while (this.#entries.get(itemId)?.state === 'loading')
      await new Promise((resolve) => setTimeout(resolve, 10));
    return this.get(itemId);
  }

  async #load(itemId: string): Promise<void> {
    try {
      const pkg = await this.fetchPackage(itemId);
      const modelPath = pkg?.manifest.entry.model;
      const file = pkg?.files.find((entry) => entry.path === modelPath);
      if (!pkg || !file) {
        this.#entries.set(itemId, { state: 'missing' });
        return;
      }
      const gltf = await parseGltf(this.#loader, await this.fetchFile(file.url));
      const parts = modelParts(gltf.scene);
      const lods = await this.#loadLods(pkg, parts.meshes);
      const sounds = Object.fromEntries(
        Object.entries(pkg.manifest.audio).flatMap(([name, path]) => {
          const link = pkg.files.find((entry) => entry.path === path)?.url;
          return link ? [[name, link]] : [];
        }),
      );
      this.#entries.set(itemId, {
        state: 'ready',
        model: {
          manifest: pkg.manifest,
          ...parts,
          scene: gltf.scene,
          animations: gltf.animations,
          sounds,
          lods,
        },
      });
    } catch (error) {
      console.warn(`Item package ${itemId} could not load:`, error);
      this.#entries.set(itemId, { state: 'missing' });
      return;
    }
    for (const listener of this.#listeners) listener(itemId);
  }

  /**
   * The model's LOD files (decision 94). Levels made by Genvr are the same model with fewer
   * triangles, so they share the model's vertex buffers (with skin data) and materials and bring
   * only their own triangle lists; a creator's own levels with other meshes are drawn as they are
   * (only for still copies: moving copies swap triangle lists, see `ItemsView.updateLod`).
   */
  async #loadLods(pkg: ItemPackage, base: PackageMesh[]): Promise<PackageMesh[][]> {
    const levels: PackageMesh[][] = [];
    for (const path of pkg.manifest.entry.lods ?? []) {
      const file = pkg.files.find((entry) => entry.path === path);
      if (!file) break;
      try {
        const { meshes } = modelParts((await parseGltf(this.#loader, await this.fetchFile(file.url))).scene);
        const sameShape =
          meshes.length === base.length &&
          meshes.every(
            (mesh, i) =>
              mesh.geometry.getAttribute('position').count ===
              base[i]!.geometry.getAttribute('position').count,
          );
        levels.push(
          sameShape
            ? meshes.map((mesh, i) => {
                const shared = new BufferGeometry();
                for (const [name, attribute] of Object.entries(base[i]!.geometry.attributes))
                  shared.setAttribute(name, attribute);
                shared.setIndex(mesh.geometry.index);
                shared.boundingBox = base[i]!.geometry.boundingBox;
                shared.boundingSphere = base[i]!.geometry.boundingSphere;
                return { geometry: shared, material: base[i]!.material, matrix: base[i]!.matrix };
              })
            : meshes,
        );
      } catch (error) {
        console.warn(`LOD ${path} of ${pkg.id} could not load:`, error);
        break;
      }
    }
    return levels;
  }

  dispose(): void {
    for (const entry of this.#entries.values()) {
      if (entry.state !== 'ready') continue;
      const all = [...entry.model.meshes, ...entry.model.lods.flat()];
      for (const mesh of all) mesh.geometry.dispose();
      for (const material of new Set(all.map((mesh) => mesh.material))) material.dispose();
    }
    this.#entries.clear();
    this.#listeners.clear();
  }
}

/**
 * Some free kits (Kenney's Nature Kit) export every material as fully metallic with no metal
 * texture. Metal reflects only its surroundings, and items get no environment map, so every face
 * the sun misses was drawn pure black: such materials are drawn as the plain colour they mean.
 */
export function plainMetal(material: Material): void {
  const standard = material as Material & {
    isMeshStandardMaterial?: boolean;
    metalness: number;
    metalnessMap: unknown;
    envMap: unknown;
  };
  if (
    !standard.isMeshStandardMaterial ||
    standard.metalness < 0.99 ||
    standard.metalnessMap ||
    standard.envMap
  )
    return;
  standard.metalness = 0;
  standard.needsUpdate = true;
}

/** The meshes of a glTF scene with their model-space matrices, and the model's bounds. */
export function modelParts(scene: Object3D): { meshes: PackageMesh[]; bounds: ItemBounds } {
  scene.updateMatrixWorld(true);
  const meshes: PackageMesh[] = [];
  scene.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach(plainMetal);
    // Multi-material meshes (rare in glTF, which splits primitives) use their first material.
    meshes.push({ geometry: mesh.geometry, material: materials[0]!, matrix: mesh.matrixWorld.clone() });
  });
  const box = new Box3().setFromObject(scene);
  const bounds: ItemBounds = box.isEmpty()
    ? { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] }
    : {
        min: box.min.toArray() as [number, number, number],
        max: box.max.toArray() as [number, number, number],
      };
  return { meshes, bounds };
}

/**
 * All meshes of a model merged into one geometry with vertex colors from their materials, for
 * the placement ghost and library pictures (one mesh, the caller's material).
 */
export function mergedPackageGeometry(meshes: readonly PackageMesh[]): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const point = new Vector3();
  const normalMatrix = new Matrix4();
  const color = new Color();
  for (const { geometry, material, matrix } of meshes) {
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    if (!position) continue;
    normalMatrix.copy(matrix).invert().transpose();
    const tint = (material as Material & { color?: Color }).color;
    color.copy(tint ?? new Color(0xffffff));
    const base = positions.length / 3;
    for (let i = 0; i < position.count; i += 1) {
      point.fromBufferAttribute(position, i).applyMatrix4(matrix);
      positions.push(point.x, point.y, point.z);
      if (normal) point.fromBufferAttribute(normal, i).transformDirection(normalMatrix);
      else point.set(0, 1, 0);
      normals.push(point.x, point.y, point.z);
      colors.push(color.r, color.g, color.b);
    }
    const index = geometry.getIndex();
    if (index) for (let i = 0; i < index.count; i += 1) indices.push(base + index.getX(i));
    else for (let i = 0; i < position.count; i += 1) indices.push(base + i);
  }
  const merged = new BufferGeometry();
  merged.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  merged.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  merged.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  merged.setIndex(indices);
  merged.computeBoundingSphere();
  return merged;
}

/**
 * The package of a Core item's real 3D model in a style (P2-38), made from the library entry: the
 * near model and its simpler levels, served with the web app. Null when the item has none.
 */
export function coreModelPackage(itemId: string, style: Style = 'realistic'): ItemPackage | null {
  const core = getCoreItem(itemId);
  const look = core ? itemModelLook(core, style) : null;
  if (!core || !look) return null;
  const files = look.model.levels.map((level, i) => ({
    path: `lod${i}.glb`,
    url: level.url,
    size: level.bytes,
    contentType: 'model/gltf-binary',
  }));
  return {
    id: itemId,
    manifest: {
      ...core.manifest,
      entry: { model: 'lod0.glb', lods: files.slice(1, 3).map((file) => file.path) },
    },
    files,
  };
}

/**
 * Leaves of real trees and plants use cutout transparency (P2-38): alpha-tested and double-sided,
 * never sorted, so forests draw fast and without flicker.
 */
export function cutoutLeaves(model: LoadedPackage): void {
  for (const mesh of [...model.meshes, ...model.lods.flat()]) {
    const material = mesh.material as Material & { map?: { image?: unknown } | null; alphaTest: number };
    if (!material.transparent) continue;
    material.transparent = false;
    material.alphaTest = 0.5;
    material.side = DoubleSide;
    material.depthWrite = true;
    material.needsUpdate = true;
  }
}
