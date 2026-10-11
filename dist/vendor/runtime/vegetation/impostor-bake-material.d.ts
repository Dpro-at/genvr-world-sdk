/** Tidewater4811ba48 createCanopyBakeMaterials, MIT; LICENSE-tidewater.md. */
import { MeshBasicNodeMaterial } from 'three/webgpu';
import type { LeafAtlas } from './leaf-atlas.js';
export declare const CANOPY_BAKE_WGSL: string;
/** Borrow the already baked leaf atlas. The two materials are owned by the caller.
 * Output is data, so it bypasses lighting, tone mapping and color-space encoding. */
export declare function createCanopyBakeMaterials(leafAtlas: Pick<LeafAtlas, 'sample'>): {
    albedo: MeshBasicNodeMaterial;
    normal: MeshBasicNodeMaterial;
};
