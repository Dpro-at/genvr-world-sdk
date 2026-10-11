/** Per-world ownership for source palm shaders; static model/preview resources stay reusable. */
import { TSL, Vector3, type BufferGeometry, type MeshPhysicalNodeMaterial } from 'three/webgpu';
import type { PackageMesh } from '../item-packages.js';
import { bindPalmInstanceAttributes, palmInstanceNodes, type PalmInstanceDefinition } from './instance-attributes.js';
import { createPalmMaterial, type PalmMaterialBindings } from './palm-material.js';

type WorldBindings = Omit<PalmMaterialBindings, 'instance' | 'lodRange'>;

/** All supplied world nodes/texture/light are borrowed. The world advances time and wind once.
 * Keep this owner outside the global generator cache. Remove ItemsView batches before disposing
 * the owner, and dispose the borrowed wind provider after lighting/vegetation consumers. */
export class PalmWorldBindings {
  readonly #materials = new Map<string, MeshPhysicalNodeMaterial>();
  readonly #releases = new Set<() => void>();
  #disposed = false;

  constructor(private readonly world: WorldBindings) {}

  /** Preserve the static material for previews; attach the source shader only to a live batch.
   * The caller supplies source near/far ranges and a matching CPU LOD distribution policy.
   * This function does not create hidden objects, modify placement, or select world contents. */
  prepare(part: PackageMesh, source: BufferGeometry, definition: PalmInstanceDefinition,
    range: readonly [number, number, number], castShadow = true): PackageMesh {
    if (this.#disposed) throw new Error('Palm world bindings are disposed');
    if (part.setupInstance) throw new Error('Palm part already has an instance binding');
    if (!Object.values(definition).every(Number.isFinite) || definition.height <= 0)
      throw new Error('Invalid palm instance definition');
    if (!range.every(Number.isFinite) || range[0] < 0 || range[1] < range[0] || range[2] < range[1])
      throw new Error('Invalid palm LOD range');
    const saved = { ...definition };
    const key = JSON.stringify([source.uuid, saved.height, saved.seed, saved.lean, saved.leanAngle, ...range]);
    let material = this.#materials.get(key);
    if (!material) {
      const lodRange = TSL.uniform(new Vector3(...range)).setGroup(TSL.renderGroup);
      material = createPalmMaterial({ ...this.world, lodRange, instance: palmInstanceNodes() });
      this.#materials.set(key, material);
    }
    const liveMaterial = material;
    return { ...part, setupInstance: mesh => {
      if (this.#disposed) throw new Error('Palm world bindings are disposed');
      const originalMaterial = mesh.material, originalShadow = mesh.castShadow;
      const binding = bindPalmInstanceAttributes(mesh, source, saved);
      mesh.material = liveMaterial;
      mesh.castShadow = castShadow;
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        binding.dispose();
        if (mesh.material === liveMaterial) mesh.material = originalMaterial;
        mesh.castShadow = originalShadow;
        this.#releases.delete(release);
      };
      this.#releases.add(release);
      return release;
    } };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const release of this.#releases) release();
    for (const material of this.#materials.values()) material.dispose();
    this.#materials.clear();
  }
}
