/** Per-batch source canopy attributes; ordinary ItemsView matrices remain authoritative. */
import { InstancedInterleavedBuffer, type BufferGeometry, type InstancedMesh } from 'three/webgpu';
import { type CanopyResourceDefinition } from './canopy-resource-geometry.js';
/** Requires an identity parent render group, matching ItemsView. Unsupported tilt/reflection/nonuniform
 * horizontal scaling selects the baked static pose in the shader; the user's transform is never discarded. */
export declare function bindCanopyInstanceAttributes(mesh: InstancedMesh, source: BufferGeometry, definition: CanopyResourceDefinition): {
    data: Float32Array<ArrayBuffer>;
    buffer: InstancedInterleavedBuffer;
    update: () => boolean;
    dispose: () => void;
};
/** World-space source position/normal from the original vertex and the existing instance matrix. */
export declare function canopyInstanceNodes(): {
    position: any;
    normal: any;
    enabled: any;
    trunkDirection: any;
};
