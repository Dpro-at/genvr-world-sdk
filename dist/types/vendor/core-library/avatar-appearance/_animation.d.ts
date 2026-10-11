import type { GenvrManifest } from '../../contracts/index.js';
/**
 * Avatar animations as plain keyframe data (task P2-19). The Core Library holds only data; the
 * runtime turns it into clips on the standard 52-bone rig (decision 59), so store and user
 * animations use the same format.
 *
 * Angles are Euler XYZ in degrees per bone in the rest frame (T-pose facing +z, left is +x):
 * - a negative X turn swings a leg or hanging arm forward, a positive X turn bends a knee;
 * - arms hang down at LeftArm Z -78 / RightArm Z +78; LeftArm Z +60 / RightArm Z -60 raise them;
 * - LeftArm Y -90 / RightArm Y +90 point the arms forward;
 * - LeftForeArm Y negative / RightForeArm Y positive bend the elbows forward, RightForeArm Z
 *   negative bends the forearm up (hand to the chin or forehead).
 */
type Side = 'Left' | 'Right';
export type RigBone = 'Hips' | 'Spine' | 'Spine1' | 'Spine2' | 'Neck' | 'Head' | `${Side}${'UpLeg' | 'Leg' | 'Foot' | 'ToeBase' | 'Shoulder' | 'Arm' | 'ForeArm' | 'Hand'}`;
export type V3 = [number, number, number];
/**
 * Rotations of some bones, plus an optional hip height offset in meters and an optional hand grip for bodies with
 * finger bones (0 open flat, 1 fist; keys without one use the clip's `grip`, else a relaxed hand).
 */
export type Pose = Partial<Record<RigBone, V3>> & {
    hipsY?: number;
    grip?: number;
};
export type Key = [time: number, pose: Pose];
export interface AnimationItem {
    manifest: GenvrManifest;
    /** Clip name on the rig (what the realtime room syncs). */
    clip: string;
    /** `loop` plays until the player moves; `once` plays one time and returns to idle. */
    kind: 'loop' | 'once';
    /** Seconds. */
    duration: number;
    keys: Key[];
    /** Hand grip for the whole clip on bodies with fingers (0 open, 1 fist); absent: a relaxed hand. */
    grip?: number;
}
/** A relaxed hand: fingers a little curled, as a hand hangs on its own. */
export declare const RELAXED_GRIP = 0.3;
/**
 * One Core animation. Player moves live in `avatar-appearance/emotes/<slug>.ts`, movement clips
 * chosen by the engine in `avatar-appearance/animations/<slug>.ts`; the id is
 * `genvr.core.animation.<slug>`.
 */
export declare function defineAnimation(animation: {
    slug: string;
    name: string;
    clip: string;
    subcategory: 'emotes' | 'animations';
    kind: 'loop' | 'once';
    duration: number;
    keys: Key[];
    grip?: number;
}): AnimationItem;
/**
 * Rotation that points a T-pose arm along a direction in the body frame (x = the body's left, y = up, z = the
 * chest's facing), as Euler XYZ degrees without twist. Directions are easier to read off a reference picture than
 * angles (CHAR-02 move references): `aimArm('Left', [0, 1, 0])` raises the left arm straight up, `[0, 0, 1]`
 * points it ahead of the chest, `[0, -1, 0]` hangs it down. The right arm takes the same direction with its own
 * mirrored rest (it points along -x).
 */
export declare function aimArm(side: 'Left' | 'Right', direction: V3): V3;
/** The forearm rotation (relative to its upper arm `upper`) that points it along a body-frame direction. */
export declare const aimForeArm: (side: "Left" | "Right", upper: V3, direction: V3) => V3;
/**
 * Rotation that points a rest leg (straight down) along a body-frame direction: X swings it forward (negative) or
 * back, Z out to the side. A rest leg turned by Z then X points at (sin z, -cos z cos x, -cos z sin x).
 */
export declare function aimLeg(direction: V3): V3;
/** The shin rotation (relative to its thigh `thigh`) that points it along a body-frame direction. */
export declare const aimShin: (thigh: V3, direction: V3) => V3;
/**
 * An arm the way a human arm works (owner rule, CHAR-02: "every bone moves only the way it can in nature"): the
 * elbow is a hinge, so the upper arm turns about its own length until the forearm lies in the elbow's bending
 * plane, the elbow only bends forward (ForeArm Y, left negative), and the forearm turns the palm by at most 90
 * degrees either way. Directions are in the body frame (+x own left, +y toward the head, +z the chest's facing);
 * `palm` (optional) is where the palm should face. Returns the Arm and ForeArm rotations.
 */
export declare function armPose(side: 'Left' | 'Right', upper: V3, fore: V3, palm?: V3): {
    arm: V3;
    fore: V3;
};
/** One arm as pose fields, built by `armPose` (directions in the body frame, see there). */
export declare function arm(side: 'Left' | 'Right', upper: V3, fore: V3, palm: V3): Pose;
/** The mirror of a body-frame direction across the body's middle (left <-> right). */
export declare const mirror: ([x, y, z]: V3) => V3;
/** Both arms, the left as given and the right its mirror image. */
export declare const bothArms: (upper: V3, fore: V3, palm: V3) => Pose;
/** How far the upper arm turns about its own length from its untwisted swing, degrees. */
export declare const UPPER_ARM_TWIST = 90;
/** How far the thigh turns about its own length from its untwisted swing, degrees. */
export declare const THIGH_TWIST = 50;
/** How far the forearm turns the palm either way (pronation and supination), degrees. */
export declare const FOREARM_TWIST = 90;
/**
 * A leg the way a human leg works: the knee is a hinge that only bends backward (Leg X positive), so the thigh turns
 * about its own length until the shin lies in the knee's plane; a straight leg keeps the kneecap to the chest's
 * facing (or up when the thigh points ahead, as when sitting). Returns the UpLeg and Leg rotations.
 */
export declare function legPose(thigh: V3, shin: V3): {
    thigh: V3;
    shin: V3;
};
/**
 * One pose of a move reference table (docs/reference/character-anime/move-reference-prompt.md): where each limb
 * segment points in the body frame (+x own left, +y toward the head, +z the chest's facing), the body roll, spine,
 * head, feet and grip. Bends are implied by the forearm and shin directions.
 */
export interface ReferencePose {
    t: number;
    leftUpperArm: V3;
    leftForearm: V3;
    rightUpperArm: V3;
    rightForearm: V3;
    leftThigh: V3;
    leftShin: V3;
    rightThigh: V3;
    rightShin: V3;
    /** Hips up (+) or down (-) from standing, metres (jumps, crouches, sitting). */
    hipsY?: number;
    /** Where each palm faces (body frame); optional, the forearm turns it within its reach. */
    leftPalm?: V3;
    rightPalm?: V3;
    /** Degrees, positive = the left shoulder turns toward +z. */
    bodyRoll: number;
    /** Degrees the chest bends forward (+) or back (-). */
    spineBend: number;
    /** Degrees the head turns to its left (+), on top of keeping the face with the body's roll undone. */
    headTurn: number;
    /** Degrees the head looks down (+) or up (-). */
    headTilt: number;
    /** Degrees the toes point away from the shin. */
    footPoint: number;
    /** Degrees of the whole body off the clip's base tilt (0 = as the clip lies). */
    bodyPitch: number;
    grip: number;
}
/**
 * A clip key from a reference pose. `basePitch` is the body angle the clip is played at (the runtime tilt), so a
 * reference body pitch above it lifts the body back by the difference at the hips.
 */
export declare function referenceKey(pose: ReferencePose, duration: number, basePitch?: number): Key;
/** Hanging arm angle. */
export declare const DOWN = 78;
export declare const arms: (left: V3, right: V3) => Pose;
/** Standing still with relaxed arms: one-shot moves start and end here to blend cleanly. */
export declare const REST: Pose;
/** A key on top of the rest pose. */
export declare const at: (time: number, pose: Pose) => Key;
/** Alternating poses on evenly spaced beats (count + 1 keys from `from` to `to`). */
export declare const beats: (from: number, to: number, count: number, even: Pose, odd: Pose) => Key[];
/** A walk or run cycle: legs and arms swing opposite, knees bend on the passing pose. */
export declare function gait(duration: number, o: {
    leg: number;
    knee: number;
    arm: number;
    elbow: number;
    lean: number;
    bob: number;
    /** Pelvis turn toward the forward leg (degrees); the chest turns back the other way. */
    twist?: number;
    /** Pelvis drop on the swinging side at the passing pose (degrees); the chest leans over the stance leg. */
    roll?: number;
}): Key[];
/** A pose held for the whole clip (sitting). */
export declare const hold: (duration: number, pose: Pose) => Key[];
export {};
