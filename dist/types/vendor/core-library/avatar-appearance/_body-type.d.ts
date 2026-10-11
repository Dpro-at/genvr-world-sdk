import type { AvatarBodyType, AvatarColorPart, AvatarScale, GenvrManifest } from '../../contracts/index.js';
import { type RigBone, type V3 } from './_animation.js';
import type { BodyArea } from './_wearable.js';
/**
 * Avatar body types as data (decision 73, task P2-22). Each body has its own skeleton (joints in
 * a T-pose facing +z, left is +x, feet at y = 0, every joint's axes aligned with the world), its
 * blocks (each follows one joint), how the Core animations drive it, and where clothing made for
 * the Starter body sits on it. The runtime builds meshes, skeletons, and clips from this; the
 * pages draw the avatar sketches from it.
 */
export type BodyColor = AvatarColorPart | 'eyes' | 'mouth';
export interface BodyJoint {
    name: string;
    parent: string | null;
    /** Rest position (world, T-pose). */
    at: V3;
    /**
     * A mesh body whose model stays in its own pose (the warrior's A-pose): the local rotation
     * (quaternion x, y, z, w) that turns this joint from the T-pose into the model's pose. The
     * runtime binds the mesh with these applied, then plays clips from the T-pose as usual.
     */
    bind?: readonly [number, number, number, number];
}
/** A chain of joints that swings on springs (hair, a coat panel, a tassel); the clips never key it. */
export interface SpringChain {
    /** Root first; the last joint is the tip (no bone of its own). */
    joints: readonly string[];
    /** Pull back toward the rest shape (per second). */
    stiffness: number;
    /** Loss of the chain's own swing (relative to the body) each step, 0 to 1. */
    drag: number;
    /** Air: share of the body's motion the chain does not follow each step (hair trails when running). */
    air?: number;
    /** Pull down (per second). */
    gravity: number;
    /** Thickness of the chain for colliders (meters). */
    radius: number;
    /** The most a joint may turn away from its rest direction (degrees): hair never flips over the head. */
    maxAngle?: number;
}
/** A sphere on a joint that swinging chains cannot enter (the head, the back, the thighs). */
export interface SpringCollider {
    joint: string;
    /** Center from the joint, in the joint's T-pose axes (meters). */
    offset: V3;
    radius: number;
}
export interface BodyPart {
    joint: string;
    size: V3;
    center: V3;
    color: BodyColor;
    /** Area a worn item may repaint (long sleeves, shorts). */
    area?: BodyArea;
}
export interface Box {
    center: V3;
    size: V3;
}
/** Where a Starter bone's blocks (and the items on them) go on this body. */
export interface FitTarget {
    joint: string;
    box: Box;
    /**
     * Which Starter axis each of this box's axes (x, y, z) follows, 1-based and signed; missing is
     * [1, 2, 3]. Arms that hang at rest take the T-pose arm's length along -y: [2, -1, 3] (left).
     */
    axes?: readonly [number, number, number];
}
/** A creator's uploaded body item (uploaded bodies, 2026-10-03): its store item id. */
export type ItemBodyId = `user.${string}`;
/** Whether a body id is a creator's uploaded body rather than one of Genvr's own. */
export declare const isItemBodyId: (id: string) => id is ItemBodyId;
export interface AvatarBody {
    manifest: GenvrManifest;
    /** A Genvr body, or a creator's uploaded body (its item id). */
    id: AvatarBodyType | ItemBodyId;
    /** Prefix of the bone node names in the scene ("mixamorig" keeps Mixamo clips working). */
    bonePrefix: string;
    /** The root first, every parent before its children. */
    joints: readonly BodyJoint[];
    parts: readonly BodyPart[];
    /**
     * Which standard animation bones move each joint, parent first: their rotations combine, so a
     * single torso joint bends as much as the three spine bones of the standard rig.
     */
    animation: Readonly<Record<string, readonly RigBone[]>>;
    /** Items are made for the Starter body; this places them on this body (missing: identity). */
    fit: Readonly<Partial<Record<RigBone, FitTarget>>>;
    /** Hanging arms in the flat sketches: where the arm starts, its center line, and where it hangs. */
    sketchArm: {
        start: number;
        axisY: number;
        hangX: number;
        topY: number;
    };
    /** Size of this copy of the body (P2-22); the library's bodies are the normal size. */
    scale?: AvatarScale;
    /**
     * A flat 2D body (decision 93): made to be seen from the side, it is thin across (x) and drawn
     * in profile; its arms hang at rest and its joints turn only in its own plane (about x).
     * Worn only where a side-view place asks for it.
     */
    flat?: boolean;
    /**
     * A mesh body (decision 111, P2-35): a skinned 3D model (GLB) made from the owner's concept sheet
     * and rigged with our 52 bones in a T-pose. The runtime builds the skeleton from `joints` (axes
     * aligned with the world, like the Starter body) and binds the model's mesh to it by bone name,
     * so every Core clip plays on it unchanged. `parts` stays empty; clothing items do not fit it yet.
     */
    model?: string;
    /**
     * A body our own code generates (CHAR-02): `model` is then the baked data the generator reads, not a model file.
     */
    generated?: 'human';
    /** A picture for body cards (mesh bodies have no block sketch). */
    picture?: string;
    /** Hair, coat panels, and tassels that swing with the body's motion (P2-35 warrior). */
    springs?: {
        chains: readonly SpringChain[];
        colliders: readonly SpringCollider[];
    };
}
/** A Genvr body from the Core Library: its id is one of the built-in body types. */
export type CoreBody = AvatarBody & {
    id: AvatarBodyType;
};
export declare function defineBody(body: Omit<AvatarBody, 'manifest' | 'id'> & {
    id: AvatarBodyType;
    name: string;
    triangles?: number;
}): CoreBody;
/** The smallest box around some boxes. */
export declare function boundingBox(boxes: readonly Box[]): Box;
/**
 * How far a standard bone's rotation turns a flat body's joint in its one plane (about x, in
 * degrees; decision 93). Swings about x stay; a sideways arm raise becomes a forward raise and an
 * elbow bend a forward bend, so waving and walking read well from the side.
 */
export declare function planarAngle(bone: RigBone, [x, y, z]: readonly [number, number, number]): number;
