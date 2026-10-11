import { Matrix4, Vector3 } from 'three/webgpu';
import { type CharacterShape } from '../../contracts/index.js';
import type { AvatarBody, BodyJoint } from '../../core-library/index.js';
/**
 * Character shaping (CHAR-01): height, weight and overall size on the body's own skeleton. Bone names, parents and
 * rest axes never change, so every clip (local rotations from world-aligned T-pose rest frames) plays unchanged; only
 * the rest positions, the bind matrices and the skinned vertices move. Work happens in bind space, so a model bound
 * in its own pose (the warrior's A-pose) shapes the same way. Pure math on arrays: no renderer needed.
 */
/** What a bone is, for how it grows: the head keeps its size, feet keep their soles, hands grow a little. */
export type BoneRole = 'head' | 'neck' | 'spine' | 'arm' | 'hand' | 'leg' | 'foot' | 'other';
/** The role of each joint of a body, in joint order. Everything under the head belongs to the head (hair too). */
export declare function boneRoles(body: Pick<AvatarBody, 'joints' | 'animation'>): BoneRole[];
/** How much a bone of a role lengthens (along its parent link) and thickens (across its own direction). */
export declare function boneFactors(role: BoneRole, shape: CharacterShape): {
    length: number;
    thickness: number;
};
export interface ShapeBone {
    /** Parent bone index, or -1 for the root. */
    parent: number;
    /** World matrix of the bone when the mesh was bound (inverse of its bone inverse). */
    bind: Matrix4;
    /** Rest (T-pose) local position under its parent. */
    rest: Vector3;
    role: BoneRole;
}
export interface ShapeInput {
    /** Bind-space vertex positions (xyz). */
    positions: ArrayLike<number>;
    skinIndex: ArrayLike<number>;
    skinWeight: ArrayLike<number>;
    bones: readonly ShapeBone[];
}
export interface ShapeOutput {
    positions: Float32Array;
    /** New bind world matrices (same rotations). */
    bind: Matrix4[];
    /** New rest local positions. */
    rest: Vector3[];
    /** Lowest vertex before and after (the soles stay on the ground). */
    minY: {
        before: number;
        after: number;
    };
}
/** Reshapes a skinned body in bind space (see the file comment). */
export declare function shapeSkin(input: ShapeInput, shape?: CharacterShape): ShapeOutput;
/** A body's joints at new rest positions (T-pose world points from the local rest positions, in joint order). */
export declare function shapedJoints(joints: readonly BodyJoint[], rest: readonly Vector3[]): BodyJoint[];
/** A copy of a body at a shape: joints at the new rest, and the size clips use for the Hips drop. */
export declare function shapedBody<T extends AvatarBody>(body: T, rest: readonly Vector3[], shape: CharacterShape): T;
