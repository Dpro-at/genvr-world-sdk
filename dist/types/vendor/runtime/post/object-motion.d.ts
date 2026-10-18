import { Matrix4 } from 'three/webgpu';
import type { Object3D } from 'three/webgpu';
/** Keep object transforms stable across shadow, opaque and transparent draws in one frame. */
export declare class ObjectMotionHistory {
    #private;
    previous(object: Object3D, frame: number): Matrix4;
}
/**
 * Reproject the current deformed surface with the previous object transform. Custom skinning
 * and shared shadow skeleton updates do not provide a reliable previous deformed surface.
 * This retains camera/root motion without treating the rest pose as a new pose every frame.
 * Bone deformation is deliberately excluded from motion blur until it has matching GPU history.
 */
export declare function skinnedObjectVelocity(currentVP: any, previousVP: any): any;
