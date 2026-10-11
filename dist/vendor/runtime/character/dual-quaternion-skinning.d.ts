import { type Node, type SkinnedMesh } from 'three/webgpu';
/**
 * Share of the dual quaternion result in the drawn skin; the rest is three's linear blend. Pure dual quaternions
 * bulge the shoulder when the arm goes far up (owner picture: arms straight up, shoulders swollen); pure linear
 * blend shrinks it. 0.7 with the lighter weight blur (4 passes) gave the cleanest arms-up shoulder by eye; the
 * shoulder thickness then stays 0.75-1.1 of rest in every clip (human-volume.test.ts).
 */
export declare const DQS_SHARE = 0.7;
/**
 * How far the eyes are closed now, 0..1: a quick blink every few seconds from the frame clock, so it costs no CPU.
 */
export declare const BLINK: {
    period: number;
    closing: number;
};
/**
 * Gives a skinned mesh's (own) node material dual quaternion skinning. `offset` pushes the skin out along its
 * normals by that many metres (the anime outline's inverted hull).
 */
export declare function useDualQuaternionSkinning(mesh: SkinnedMesh, offset?: {
    width: number;
    reference: number;
    scale: readonly [number, number];
}, 
/** How open the mouth is (0..1), driven by speech; shared by the body and its outline. */
mouthOpen?: Node<'float'>): void;
