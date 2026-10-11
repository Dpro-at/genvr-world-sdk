/** Per-batch source palm attributes; ordinary ItemsView matrices remain authoritative. */
import { InstancedInterleavedBuffer, type BufferGeometry, type InstancedMesh } from 'three/webgpu';
export interface PalmInstanceDefinition {
    height: number;
    seed: number;
    lean: number;
    leanAngle: number;
}
/** Requires an identity parent render group, matching ItemsView. Unsupported tilt/reflection/nonuniform
 * scaling selects the baked static pose in the shader; the user's transform is never discarded. */
export declare function bindPalmInstanceAttributes(mesh: InstancedMesh, source: BufferGeometry, definition: PalmInstanceDefinition): {
    data: Float32Array<ArrayBuffer>;
    buffer: InstancedInterleavedBuffer;
    update: () => boolean;
    dispose: () => void;
};
/** World-space source position/normal from the original vertex and the existing instance matrix. */
export declare function palmInstanceNodes(): {
    position: any;
    normal: any;
    enabled: any;
    trunkDirection: any;
};
