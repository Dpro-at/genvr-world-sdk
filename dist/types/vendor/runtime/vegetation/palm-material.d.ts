/** Source Tidewater palm material binding. MIT; LICENSE-tidewater.md. */
import { MeshPhysicalNodeMaterial, type DirectionalLight } from 'three/webgpu';
import type { VegetationWindProvider } from './wind.js';
type N = any;
export declare const PALM_SHADE_WGSL: string;
export interface PalmMaterialBindings {
    wind: VegetationWindProvider;
    time: N;
    mainCamera: N;
    lodRange: N;
    frame: N;
    sun: DirectionalLight;
    sunDirection: N;
    night: N;
    /** Optional ItemsView source-vertex adapter. Unsupported transforms keep the baked pose. */
    instance?: {
        position: N;
        normal: N;
        enabled: N;
        trunkDirection: N;
    };
}
/** Instanced source palm geometry; iPos/iDat are world-space. Group/object transform must be identity.
 * Lighting adapters must explicitly transfer registered transmission after cloning.
 * Caller owns all borrowed bindings and material disposal. */
export declare function createPalmMaterial(b: PalmMaterialBindings): MeshPhysicalNodeMaterial;
export {};
