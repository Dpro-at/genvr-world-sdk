/** One bone of the standard rig as read from a file: world rest position in meters (facing +z, left +x). */
export interface RigJoint {
    name: string;
    parent: string | null;
    at: [number, number, number];
}
export type RigReading = {
    ok: true;
    pose: 't-pose';
    /** The standard bones in the standard order (a finger the file lacks sits on its parent). */
    joints: RigJoint[];
    /** Standard finger bones the file does not have. */
    missing: string[];
    /** Bones the file has beyond the standard ones (hair, skirt, tail): kept still for now. */
    extra: string[];
    /** The character's height in meters (its drawn box). */
    height: number;
} | {
    ok: false;
    problems: string[];
    found?: {
        extra: string[];
    };
};
/** A file's bone name in our terms: `mixamorig:Hips`, `mixamorig_Hips` and `Hips` are all `Hips`. */
export declare function standardBoneName(name: string): string;
/**
 * The rig of an uploaded character (uploaded bodies, plan 2026-10-03, Task 1): the skinned mesh's bones matched to our
 * 52 standard bones (Mixamo names, with or without the `mixamorig` prefix), their world rest positions through the
 * node transforms (any armature scale included), the pose from the arms, the extra bones, and the height. Reads the
 * JSON and the binary chunk only; never renders. A body must stand in a T-pose facing +z for now (an A-pose needs the
 * bind rotations the warrior's tooling writes, a later step).
 */
export declare function inspectRig(bytes: Uint8Array): RigReading;
