import type { Pose } from './_animation.js';
/**
 * The joint law (owner rule, CHAR-02: "every bone moves only the way it can in nature; turning my arm the wrong way
 * breaks it"): how far each joint of a human body can turn, in the clips' own rotations (T-pose rest, world-aligned
 * frames, +x the body's left, +y up, +z the chest's facing). Every Core move is checked against it by
 * `core-library/test/joint-limits.test.ts`, and every new or generated move must pass it before it joins the library.
 *
 * The numbers come from `HUMAN_JOINT_CONSTRAINTS` (`_joint-constraints.ts`, the one source for every human joint
 * limit, owner 2026-10-05); the geometric ones (shoulder, hip: where the limb may point) stay here. Degrees.
 */
export declare const JOINT_LIMITS: {
    /** Elbow: a hinge that only bends forward, no sideways bend; the forearm turns the palm at most this far. */
    readonly elbow: {
        readonly bend: 150;
        readonly back: number;
        readonly offHinge: 12;
        readonly twist: 95;
    };
    /** Knee: a hinge that only bends backward, a little turn when bent. */
    readonly knee: {
        readonly bend: 150;
        readonly back: number;
        readonly offHinge: 12;
        readonly twist: 25;
    };
    /** Wrist: bends up and down, little sideways; it does not twist (the forearm does). */
    readonly wrist: {
        readonly swing: number;
        readonly twist: 20;
    };
    /** Shoulder joint: the arm cannot point back through the body, nor far behind it, nor twist far. */
    readonly shoulder: {
        readonly behind: -0.9;
        readonly through: 0.25;
        readonly twist: 120;
    };
    /** Hip joint: not far behind the body (a sprinter's back leg reaches about 45), not far across, limited turn. */
    readonly hip: {
        readonly behind: -0.75;
        readonly across: -0.55;
        readonly twist: 60;
    };
    /** Collarbone (Shoulder bone): a small lift and shrug. */
    readonly collarbone: {
        readonly swing: number;
    };
    /** Each spine bone, and the neck and head together. */
    readonly spine: {
        readonly swing: number;
    };
    /** The neck and head together (one budget). */
    readonly neck: {
        readonly turn: number;
        readonly down: number;
        readonly up: number;
    };
    /** Ankle: toes down (positive X) and up, little sideways. */
    readonly ankle: {
        readonly down: 55;
        readonly up: number;
        readonly side: 30;
    };
};
/** What is wrong with one pose under the joint law (empty: a pose a human body can make). */
export declare function jointProblems(pose: Pose): string[];
