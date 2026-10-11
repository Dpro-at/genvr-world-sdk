/** Source Tidewater4811ba48 near canopy binding. MIT; LICENSE-tidewater.md. */
import { MeshPhysicalNodeMaterial, type DirectionalLight } from 'three/webgpu';
import type { VegetationWindProvider } from './wind.js';
import type { LeafAtlas } from './leaf-atlas.js';
type N = any;
export declare const CANOPY_SHADE_WGSL: string;
export interface CanopyMaterialBindings {
    wind: VegetationWindProvider;
    atlas: Pick<LeafAtlas, 'sample'>;
    time: N;
    mainCamera: N;
    nearRange: N;
    frame: N;
    sun: DirectionalLight;
    sunDirection: N;
    night: N;
    /** Exact raw-source instance transform, before deformation; normal must remain unnormalized. */
    instance?: {
        position: N;
        normal: N;
        enabled: N;
    };
}
/** Source instance-transformed near geometry; identity world group. No owned atlas/provider.
 * Spherical leaf normals are not flipped on back faces. Shader can consume merged tree/shrub parts. */
export declare function createCanopyMaterial(b: CanopyMaterialBindings): MeshPhysicalNodeMaterial;
export {};
