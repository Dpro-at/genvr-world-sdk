import { type Pose } from '../../../core-library/index.js';
/**
 * The paint tool's view pose (owner, 2026-10-05: "control every bone - head up/down/left/right, wrists, feet - only
 * the way it really turns", then "it still moves at random"): anatomical controls per joint. The shoulder and hip are
 * ball joints (where the limb points, then its twist), elbow and knee hinges. Every pose is turned into the clips'
 * rotations and checked with the joint law the Core moves pass (`jointProblems`): `limitPose` stops a slider at the
 * last pose a body can make, whatever the other sliders hold. Each slider's own range is `HUMAN_JOINT_CONSTRAINTS`. Applied
 * to the A-pose body about the mesh's own joints with the game's skinning (dual quaternions mixed with the linear
 * blend, `DQS_SHARE`: the linear blend alone pinched the shoulder, owner 2026-10-05). Only the view moves: strokes are mapped
 * back to the A-pose body, so the muscle map and the bake never depend on the pose.
 */
export type PoseSide = 'L' | 'R';
export interface PoseControl {
    key: string;
    label: string;
    group: string;
    /** Degrees; both ends are a healthy body's range (HUMAN_JOINT_CONSTRAINTS), never beyond. */
    min: number;
    max: number;
    /** Per side (keys `L.<key>` and `R.<key>`), or one for the body. */
    sided: boolean;
    /** Shown after the value: degrees unless said. */
    unit?: '%';
}
/**
 * Every slider's range comes from `HUMAN_JOINT_CONSTRAINTS` (the one source for human joint limits, owner
 * 2026-10-05); the couplings between joints are `coupledPose`. Signs: + is the named motion. Arm up: 0 hanging, 90
 * level, 180 straight up; arm to the front: 0 out to his side, 90 straight in front, more across his chest, negative
 * behind. The A-pose values (arm up ~42, elbow ~45) are where those sliders start (`poseRest`).
 */
export declare const POSE_CONTROLS: readonly PoseControl[];
/**
 * The couplings between joints (`HUMAN_JOINT_CONSTRAINTS.couplings`) applied to slider values: a finger tip only
 * as far as its middle joint lets it, no spread with the knuckle bent, the knuckles with the wrist bent (tenodesis),
 * the wrist's sideways with its bend, the hip's forward with a straight knee (hamstrings), toes up with a straight knee
 * (calf), the upper arm's outward turn with its height. `rest` gives the sliders that do not start at 0.
 */
export declare function coupledPose(values: PaintPoseValues, rest: Readonly<Record<string, number>>): Record<string, number>;
/** The pole the elbow hinge keeps facing: his midline, a little down (palms down when the arm is level to the side). */
export declare const ARM_POLE_DOWN = 0.35;
/** Share of an arm raise taken by the collarbone (the shoulder rhythm, about 1 : 2). */
export declare const SHOULDER_RHYTHM: number;
/** Pose values by key (`head.nod`, `L.arm.up`, ...); missing keys are the A-pose (elbow: its own bend). */
export type PaintPoseValues = Readonly<Record<string, number>>;
type Vec = [number, number, number];
export interface PoseSkeleton {
    names: readonly string[];
    parents: readonly number[];
    /** Each joint's A-pose position (same units as the mesh). */
    pivots: readonly Vec[];
}
/** The clamped value of one control. */
export declare function poseValue(values: PaintPoseValues, key: string, fallback?: number): number;
/** The A-pose's own elbow bend (degrees) on his left: the elbow slider starts there. */
export declare function restElbowBend(skeleton: PoseSkeleton): number;
/** The A-pose's own values of the controls that do not start at 0 (arm up, arm to the front, elbow bend). */
export declare function poseRest(skeleton: PoseSkeleton): Record<string, number>;
/**
 * The pose as the clips store it (T-pose rest, world-aligned frames), for the joint law: the A-pose arm chain's own
 * turns from the T-pose under the pose's turns. Unlike `tPose` (a plain swing per bone) the upper arm is rolled so its
 * elbow hinge is the law's: with a plain swing this mesh's A-pose elbow already reads ~20 degrees "sideways" and a full
 * bend breaks the law (found 2026-10-05; the Core clips bend the elbow about the same law hinge - see HANDOFF).
 */
export declare function clipPose(skeleton: PoseSkeleton, values: PaintPoseValues): Pose;
/**
 * What breaks the joint law in a pose (empty: a pose a body can make). One exception: the law reads the upper arm's
 * twist as the swing-twist from the T-pose, which calls arms overhead with the palms toward each other (a natural
 * pose, reached by raising the arms in front) a 176 degree twist. Here the upper arm's twist is its own slider, measured
 * from the natural roll (`ARM_POLE_DOWN`) and held to a real range (+-90), so that one law message is left out. The
 * same for the head: the law adds the neck and head Euler angles, so a head turned 90 degrees reads ~20 degrees more
 * nod than it has; here the head turns about the neck and then nods, each slider held to the neck + head budget of `HUMAN_JOINT_CONSTRAINTS`.
 */
export declare const poseProblems: (skeleton: PoseSkeleton, values: PaintPoseValues) => string[];
/**
 * The asked slider values limited to the joint law: when they would break a joint that is fine now, the sliders stop
 * at the last pose a body can make on the way there (owner: "it must not move at random").
 */
export declare function limitPose(skeleton: PoseSkeleton, values: PaintPoseValues, asked: Readonly<Record<string, number>>): {
    values: PaintPoseValues;
    problems: string[];
};
/**
 * The posed positions: every vertex moved by its skin weights on the posed joints (linear blend skinning with the
 * A-pose as bind pose). `skinIndex`/`skinWeight` are four per vertex.
 */
export declare function poseBody(rest: Float32Array, skinIndex: ArrayLike<number>, skinWeight: ArrayLike<number>, skeleton: PoseSkeleton, values: PaintPoseValues, out?: Float32Array, 
/** Share of the dual quaternion result (the rest linear blend), as the game draws it. */
dqsShare?: number, 
/** When given, each vertex's blended turn (x, y, z, w), for `relaxShoulders`. */
turns?: Float32Array): Float32Array;
/** The shoulder area the correctives may move: full within the first distance of the shoulder joint, none past the second. */
export declare const SHOULDER_RELAX: {
    readonly near: 0.09;
    readonly far: 0.17;
    readonly iterations: 60;
};
/** Each vertex's neighbours over the skin (triangles whose corners are all skin, region < 2). */
export declare function skinNeighbours(triangles: ArrayLike<number>, region: ArrayLike<number>, count: number): Uint32Array[];
/**
 * Pose correctives for the shoulders (owner, 2026-10-05: "the shoulder twists like a spiral when the arm goes up"; review:
 * "bones + weights + muscle morphs + pose corrective morphs"). Skinning alone turns the upper arm up to ~170 degrees
 * against a shoulder whose skin is half on the trunk, so the deltoid and armpit pinch and spiral. Here the shoulder
 * and armpit skin is solved again so every vertex keeps its rest relation to its neighbours (its Laplacian detail,
 * turned with its own skin turn) while the skin outside the area stays where the bones put it: the twist spreads
 * out, the deltoid and armpit keep their volume, nothing collapses into the joint. The area's strength grows with how
 * far that arm left the A-pose, so the A-pose itself never changes. Done in place on `posed`.
 */
export declare function relaxShoulders(rest: Float32Array, posed: Float32Array, turns: Float32Array, neighbours: readonly Uint32Array[], skeleton: PoseSkeleton, values: PaintPoseValues): void;
export {};
