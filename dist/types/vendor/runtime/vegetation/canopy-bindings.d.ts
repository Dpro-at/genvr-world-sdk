/** Per-world canopy shader/batch lifetime. Source MIT: LICENSE-tidewater.md. */
import { type BufferGeometry } from 'three/webgpu';
import type { PackageMesh } from '../item-packages.js';
import type { CanopyAssets } from './canopy-assets.js';
import { type CanopyMaterialBindings } from './canopy-material.js';
import { type ImpostorMaterialBindings } from './impostor-material.js';
import { type CanopyResourceDefinition } from './canopy-resource-geometry.js';
type World = Omit<CanopyMaterialBindings, 'atlas' | 'instance'> & Pick<ImpostorMaterialBindings, 'farDistance'>;
/** Assets and world inputs are borrowed. Release batches/materials before disposing assets.
 * Caller must await atlas baking before constructing this owner. No global shader cache.
 */
export declare class CanopyWorldBindings {
    private readonly near;
    private readonly far;
    private readonly quad;
    private readonly releases;
    private disposed;
    constructor(assets: CanopyAssets, world: World);
    prepare(part: PackageMesh, source: BufferGeometry, definition: CanopyResourceDefinition, level: 0 | 1): PackageMesh;
    dispose(): void;
}
export {};
