/** Per-world source canopy GPU assets. MIT source attribution: LICENSE-tidewater.md. */
import type { BufferGeometry, WebGPURenderer } from 'three/webgpu';
import { LeafAtlas } from './leaf-atlas.js';
import { ImpostorAtlas, impostorAxisSphere } from './impostor-atlas.js';
import { createCanopyBakeMaterials } from './impostor-bake-material.js';
import { buildTreeNear, TREE_VARIANTS } from './forest-tree-geometry.js';
import { buildShrubNear, SHRUB_VARIANTS, LOBE_TABLE, lobeVariantGeometry } from './shrub-geometry.js';

/** Create once per world, outside a renderer frame; never store in global generator caches.
 * Await readiness before attaching live materials. If the world closes while awaiting,
 * dispose the resolved owner before attaching it. Renderer is borrowed and never disposed.
 */
export async function createCanopyAssets(renderer: WebGPURenderer) {
  await renderer.init();
  const leaf = new LeafAtlas(renderer);
  const geometry: BufferGeometry[] = [];
  let bake: ReturnType<typeof createCanopyBakeMaterials> | undefined;
  let impostor: ImpostorAtlas | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    impostor?.dispose();
    bake?.albedo.dispose();
    bake?.normal.dispose();
    for (const part of geometry) part.dispose();
    leaf.dispose();
  };
  try {
    leaf.bake();
    bake = createCanopyBakeMaterials(leaf);
    const tree = buildTreeNear().geometry;
    geometry.push(tree);
    const shrub = buildShrubNear().geometry;
    geometry.push(shrub);
    const groups = [tree, shrub].map((source, index) => {
      const count = index === 0 ? TREE_VARIANTS : SHRUB_VARIANTS;
      const variants = Array.from({ length: count }, (_, variant) => {
        const part = lobeVariantGeometry(
          source,
          LOBE_TABLE,
          ((index === 0 ? 0 : TREE_VARIANTS) + variant) * 8,
        );
        geometry.push(part);
        return part;
      });
      return { variants, ...impostorAxisSphere(source) };
    });
    impostor = new ImpostorAtlas(groups, bake);
    await impostor.bake(renderer);
    return { leaf, impostor, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
export type CanopyAssets = Awaited<ReturnType<typeof createCanopyAssets>>;
