/** Per-world ownership for source palm shaders; static model/preview resources stay reusable. */
import { type BufferGeometry } from 'three/webgpu';
import type { PackageMesh } from '../item-packages.js';
import { type PalmInstanceDefinition } from './instance-attributes.js';
import { type PalmMaterialBindings } from './palm-material.js';
type WorldBindings = Omit<PalmMaterialBindings, 'instance' | 'lodRange'>;
/** All supplied world nodes/texture/light are borrowed. The world advances time and wind once.
 * Keep this owner outside the global generator cache. Remove ItemsView batches before disposing
 * the owner, and dispose the borrowed wind provider after lighting/vegetation consumers. */
export declare class PalmWorldBindings {
    #private;
    private readonly world;
    constructor(world: WorldBindings);
    /** Preserve the static material for previews; attach the source shader only to a live batch.
     * The caller supplies source near/far ranges and a matching CPU LOD distribution policy.
     * This function does not create hidden objects, modify placement, or select world contents. */
    prepare(part: PackageMesh, source: BufferGeometry, definition: PalmInstanceDefinition, range: readonly [number, number, number], castShadow?: boolean): PackageMesh;
    dispose(): void;
}
export {};
