import { type MouthShape } from '../contracts/index.js';
import { DataTexture, Mesh } from 'three/webgpu';
/** The nine pictures side by side (shared by every mouth). */
export declare function mouthAtlas(): DataTexture;
/** A mouth surface: `setShape` shows one of the nine pictures. */
export interface MouthMesh {
    mesh: Mesh;
    shape: MouthShape;
    setShape(shape: MouthShape): void;
    dispose(): void;
}
/** How far in front of the face block the mouth surface floats, so it never flickers against it. */
export declare const MOUTH_GAP = 0.004;
/**
 * A mouth for a face block of `size` (meters, the old mouth block's): twice as tall as the block (the shapes open up
 * and down), the width of the block and a bit; placed by the caller on the head.
 */
export declare function createMouth(size: readonly [number, number, number]): MouthMesh;
