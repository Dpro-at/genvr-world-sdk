/** Per-world canopy shader/batch lifetime. Source MIT: LICENSE-tidewater.md. */
import { PlaneGeometry, TSL, type BufferGeometry } from 'three/webgpu';
import type { PackageMesh } from '../item-packages.js';
import type { CanopyAssets } from './canopy-assets.js';
import { createCanopyMaterial, type CanopyMaterialBindings } from './canopy-material.js';
import { createImpostorMaterial, type ImpostorMaterialBindings } from './impostor-material.js';
import { bindCanopyInstanceAttributes, canopyInstanceNodes } from './canopy-instance.js';
import { canopyResourceData, type CanopyResourceDefinition } from './canopy-resource-geometry.js';

type World = Omit<CanopyMaterialBindings, 'atlas' | 'instance'> &
  Pick<ImpostorMaterialBindings, 'farDistance'>;

/** Assets and world inputs are borrowed. Release batches/materials before disposing assets.
 * Caller must await atlas baking before constructing this owner. No global shader cache.
 */
export class CanopyWorldBindings {
  private readonly near;
  private readonly far;
  private readonly quad = new PlaneGeometry(2, 2);
  private readonly releases = new Set<() => void>();
  private disposed = false;

  constructor(assets: CanopyAssets, world: World) {
    if (!assets.impostor.baked) {
      this.quad.dispose();
      throw new Error('Canopy atlases must be baked before binding');
    }
    this.near = createCanopyMaterial({ ...world, atlas: assets.leaf, instance: canopyInstanceNodes() });
    this.far = createImpostorMaterial({ ...world, atlas: assets.impostor });
    // Unsupported item transforms retain the near static pose; never draw an incorrect far crown.
    this.far.maskNode = TSL.and(
      this.far.maskNode! as ReturnType<typeof TSL.bool>,
      TSL.attribute('twCanopyEnabled', 'float').greaterThan(0.5),
    );
  }

  prepare(
    part: PackageMesh,
    source: BufferGeometry,
    definition: CanopyResourceDefinition,
    level: 0 | 1,
  ): PackageMesh {
    if (this.disposed) throw new Error('Canopy world bindings are disposed');
    if (part.setupInstance) throw new Error('Canopy part already has an instance binding');
    canopyResourceData(definition);
    const saved = { ...definition };
    const material = level === 0 ? this.near : this.far;
    return {
      ...part,
      setupInstance: (mesh) => {
        if (this.disposed) throw new Error('Canopy world bindings are disposed');
        const geometry = mesh.geometry,
          previousMaterial = mesh.material,
          previousShadow = mesh.castShadow;
        if (level === 1) mesh.geometry = this.quad;
        let binding: ReturnType<typeof bindCanopyInstanceAttributes>;
        try {
          binding = bindCanopyInstanceAttributes(mesh, level === 0 ? source : this.quad, saved);
        } catch (error) {
          mesh.geometry = geometry;
          throw error;
        }
        mesh.material = material;
        mesh.castShadow = level === 0;
        let released = false;
        const release = () => {
          if (released) return;
          released = true;
          binding.dispose();
          if (level === 1 && mesh.geometry === this.quad) mesh.geometry = geometry;
          if (mesh.material === material) mesh.material = previousMaterial;
          mesh.castShadow = previousShadow;
          this.releases.delete(release);
        };
        this.releases.add(release);
        return release;
      },
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const release of this.releases) release();
    this.near.dispose();
    this.far.dispose();
    this.quad.dispose();
  }
}
