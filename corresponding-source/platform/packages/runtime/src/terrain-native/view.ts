import { TerrainActiveSurface } from '@genvr/contracts';
import type { TerrainFieldStore } from '@genvr/world';
import { resolveTerrainSurface } from '@genvr/core-library';
import { Group, Mesh, MeshStandardNodeMaterial, TSL, type Camera } from 'three/webgpu';
import { TerrainFieldTextures, type TerrainFieldTexturePreparation } from '../terrain-fields-gpu.js';
import { TerrainLod } from '../terrain-lod/index.js';
import {
  createNativeGroundMaterial,
  validateNativeMaterialBindings,
  type NativeGroundProviders,
} from './material.js';
/* eslint-disable @typescript-eslint/no-explicit-any -- native TSL graph API */
type Node = any;
const t = TSL as Node;
export interface NativeTerrainPreparation extends TerrainFieldTexturePreparation {
  providers?: NativeGroundProviders;
  seaLevel?: number;
  /** WebGL retains source geometry with a simplified TSL material, because source WGSL is WebGPU-only. */
  sourceMaterial?: boolean;
}
export function validateNativeSurface(store: TerrainFieldStore, surface: TerrainActiveSurface): void {
  TerrainActiveSurface.parse(surface);
  const d = store.descriptor;
  if (surface.setId !== d.id || !d.heightBinding || !store.complete)
    throw new Error('Native surface requires a complete bound height field');
  resolveTerrainSurface(d, surface);
  if (d.channels.find((c) => c.id === d.heightBinding!.channel)?.encoding !== 'f32le')
    throw new Error('Native height channel must be Float32');
  validateNativeMaterialBindings(store, surface);
}
/** Geometry and shader share the active CPU surface edge policy; no place-size rescaling. */
export function nativeHeightNode(gpu: TerrainFieldTextures, surface: TerrainActiveSurface, xz: Node): Node {
  const d = gpu.descriptor,
    binding = d.heightBinding!;
  const value = gpu.sampleNode(binding.channel, xz).add(binding.offset);
  if (surface.edge === 'clamp') return value;
  const fp = xz
    .sub(t.vec2(...d.origin))
    .div(d.spacing)
    .sub(0.5);
  const valid = fp.x
    .greaterThanEqual(0)
    .and(fp.y.greaterThanEqual(0))
    .and(
      surface.farEdge === 'exclusive'
        ? fp.x.lessThan(d.width - 1).and(fp.y.lessThan(d.height - 1))
        : fp.x.lessThanEqual(d.width - 1).and(fp.y.lessThanEqual(d.height - 1)),
    );
  return t.select(valid, value, t.float(surface.outsideHeight));
}
export class NativeTerrainView {
  readonly group = new Group();
  readonly seaLevel = TSL.uniform(0).setGroup(TSL.renderGroup);
  material: MeshStandardNodeMaterial;
  readonly fallbackMaterial: MeshStandardNodeMaterial;
  readonly sourceMaterial: MeshStandardNodeMaterial | null;
  #mesh!: Mesh;
  readonly lod: TerrainLod;
  #disposed = false;
  #releaseMaterial: () => void;
  private constructor(
    readonly gpu: TerrainFieldTextures,
    readonly surface: TerrainActiveSurface,
    options: NativeTerrainPreparation,
  ) {
    const d = gpu.descriptor,
      size = d.width * d.spacing;
    this.seaLevel.value = options.seaLevel ?? d.heightBinding!.offset;
    const created = createNativeGroundMaterial(
      gpu,
      surface,
      this.seaLevel,
      options.providers,
      options.sourceMaterial,
    );
    this.material = created.material;
    this.sourceMaterial = created.sourceMaterial;
    this.fallbackMaterial = created.fallbackMaterial;
    this.#releaseMaterial = created.dispose;
    try {
      this.lod = new TerrainLod({
        gridSize: 40,
        leafSize: 8,
        levels: Math.log2(size / 8) + 1,
        rangeFactor: 2,
        center: { x: d.origin[0], z: d.origin[1], size },
        minY: -150,
        maxY: 450,
      });
      const node = t.attribute('nodeData', 'vec4'),
        grid = t.positionLocal.xz;
      const snapped = this.lod.snappedNode(node, grid);
      const morphed = this.lod.morphNode(node, grid, nativeHeightNode(gpu, surface, snapped));
      this.material.positionNode = t.vec3(
        morphed.worldXZ.x,
        nativeHeightNode(gpu, surface, morphed.worldXZ),
        morphed.worldXZ.y,
      );
      this.fallbackMaterial.positionNode = this.material.positionNode;
      const mesh = new Mesh(this.lod.geometry, this.material);
      this.#mesh = mesh;
      mesh.frustumCulled = false;
      mesh.name = 'native-terrain';
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      this.group.add(mesh);
    } catch (error) {
      created.dispose();
      throw error;
    }
  }
  static async create(
    store: TerrainFieldStore,
    surface: TerrainActiveSurface,
    options: NativeTerrainPreparation = {},
  ): Promise<NativeTerrainView> {
    const parsed = TerrainActiveSurface.parse(surface);
    validateNativeSurface(store, parsed);
    const revision = store.revision;
    const gpu = await TerrainFieldTextures.createAsync(store, undefined, options);
    try {
      // Source bake remains synchronous. Yield first so cancellation/UI may run before it.
      await (options.yieldControl?.() ?? new Promise<void>((resolve) => setTimeout(resolve, 0)));
      options.signal?.throwIfAborted();
      if (revision !== store.revision) throw new Error('Native terrain source changed during preparation');
      const view = new NativeTerrainView(gpu, parsed, options);
      try {
        await (options.yieldControl?.() ?? new Promise<void>((resolve) => setTimeout(resolve, 0)));
        options.signal?.throwIfAborted();
        if (revision !== store.revision) throw new Error('Native terrain source changed during preparation');
        return view;
      } catch (error) {
        view.dispose();
        throw error;
      }
    } catch (error) {
      gpu.dispose();
      throw error;
    }
  }
  /** Switch cached graphs; callers invalidate their lighting clones after a material change. */
  setSourceMaterial(enabled: boolean): void {
    if (this.#disposed) return;
    const next = enabled && this.sourceMaterial ? this.sourceMaterial : this.fallbackMaterial;
    this.material = next;
    this.#mesh.material = next;
  }
  update(camera: Camera, seaLevel?: number): void {
    if (this.#disposed) return;
    if (seaLevel !== undefined && Number.isFinite(seaLevel)) this.seaLevel.value = seaLevel;
    this.lod.update(camera);
  }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.group.clear();
    this.lod.dispose();
    this.#releaseMaterial();
    this.gpu.dispose();
  }
}
