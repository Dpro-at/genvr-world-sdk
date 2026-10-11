/**
 * How far every human joint turns, and how joints limit each other (owner, 2026-10-05: one source for every limit;
 * the owner's draft `genvr-human-joint-constraints/1` reviewed against sports-medicine range-of-motion tables (AAOS,
 * Norkin & White) and corrected). Degrees. Each motion is [min, max]: positive is the named motion, negative its
 * opposite (flexion + / extension -). Ranges are a healthy, flexible teen's, for animation (a little generous),
 * not clinical limits. The joint law (`_joint-limits.ts`) and the character pose tools read their numbers here.
 *
 * Corrections to the draft: the neck and head share ONE budget (the draft gave each the whole range, 140 degrees of
 * turn); the shoulder's 180 is the arm against the chest and already holds the shoulder blade's 60 (the shoulder joint
 * alone is ~120); joints that normally bend a little backward got it (elbow, knee, finger and thumb joints); finger
 * spread differs per finger; the couplings below (a finger's tip cannot bend without its middle joint, no spread with
 * the knuckle bent, hamstrings, calf, tenodesis, shoulder rotation with elevation).
 */
export type Range = readonly [min: number, max: number];
export declare const HUMAN_JOINT_CONSTRAINTS: {
    readonly format: "genvr-human-joint-constraints/2";
    /** Past this share of a range the motion gets stiffer (animation, solvers); the end is a hard clamp. */
    readonly softLimitStart: 0.85;
    readonly joints: {
        /** The lower back (Spine bone): + forward. */
        readonly lumbar: {
            readonly flexion: readonly [-20, 50];
            readonly sideBend: readonly [-20, 20];
            readonly twist: readonly [-10, 10];
        };
        /** The upper back (Spine1 + Spine2 bones). */
        readonly thoracic: {
            readonly flexion: readonly [-25, 35];
            readonly sideBend: readonly [-25, 25];
            readonly twist: readonly [-35, 35];
        };
        /** The neck (C2-C7, Neck bone): + forward (chin down). Shares the turn with the head. */
        readonly neck: {
            readonly flexion: readonly [-50, 40];
            readonly sideBend: readonly [-35, 35];
            readonly twist: readonly [-35, 35];
        };
        /** The head on the neck (C0-C2, Head bone). Together with the neck: flexion 55, extension 75, side 43, turn 80. */
        readonly head: {
            readonly flexion: readonly [-25, 15];
            readonly sideBend: readonly [-8, 8];
            readonly twist: readonly [-45, 45];
        };
        /** The collarbone (Shoulder bone): + up, + forward, + its own backward turn as the arm rises. */
        readonly clavicle: {
            readonly elevation: readonly [-10, 35];
            readonly protraction: readonly [-15, 30];
            readonly axialRotation: readonly [0, 45];
        };
        /** The shoulder blade (no bone in the rig: carried by the collarbone and the corrective shapes). */
        readonly scapula: {
            readonly upwardRotation: readonly [-10, 60];
            readonly protraction: readonly [-20, 35];
            readonly posteriorTilt: readonly [-10, 30];
        };
        /**
         * The arm against the chest (shoulder joint + shoulder blade together): flexion forward (- behind), abduction to
         * the side, horizontal adduction across the chest (- back), rotation (+ external). External rotation is 60 with
         * the arm at the side and 90 with it raised 90 (`shoulderExternalRotation`).
         */
        readonly shoulder: {
            readonly flexion: readonly [-60, 180];
            readonly abduction: readonly [0, 180];
            readonly horizontalAdduction: readonly [-45, 130];
            readonly rotation: readonly [-70, 90];
        };
        /** The shoulder joint alone (glenohumeral): what is left once the shoulder blade has turned. */
        readonly glenohumeral: {
            readonly flexion: readonly [-60, 120];
            readonly abduction: readonly [0, 120];
        };
        /** Elbow: a hinge; active ~145, 150 pushed; up to 10 backward is normal in teens. */
        readonly elbow: {
            readonly flexion: readonly [-10, 150];
        };
        /** Forearm: + supination (palm up / forward), - pronation. */
        readonly forearm: {
            readonly rotation: readonly [-80, 85];
        };
        /** Wrist: + toward the palm; deviation + toward the little finger (ulnar), - toward the thumb (radial). */
        readonly wrist: {
            readonly flexion: readonly [-70, 80];
            readonly deviation: readonly [-20, 35];
        };
        readonly thumbCMC: {
            readonly flexion: readonly [-15, 50];
            readonly abduction: readonly [0, 60];
            readonly opposition: readonly [0, 45];
        };
        readonly thumbMCP: {
            readonly flexion: readonly [-15, 55];
        };
        readonly thumbIP: {
            readonly flexion: readonly [-20, 80];
        };
        /** Finger knuckles (index to little): + toward the palm; 30 back actively (45 pushed). */
        readonly fingerMCP: {
            readonly flexion: readonly [-30, 90];
        };
        /** Sideways at the knuckle, + away from the middle finger, per finger. */
        readonly fingerSpread: {
            readonly index: readonly [-20, 20];
            readonly middle: readonly [-10, 10];
            readonly ring: readonly [-15, 15];
            readonly little: readonly [-25, 25];
        };
        readonly fingerPIP: {
            readonly flexion: readonly [-5, 110];
        };
        readonly fingerDIP: {
            readonly flexion: readonly [-10, 85];
        };
        /** Hip: + forward, abduction (- across), rotation (+ external). 120 forward only with the knee bent. */
        readonly hip: {
            readonly flexion: readonly [-30, 120];
            readonly abduction: readonly [-30, 45];
            readonly rotation: readonly [-35, 45];
        };
        /** Knee: a hinge; active ~135, 150 kneeling or squatting; a little backward; turn only when bent. */
        readonly knee: {
            readonly flexion: readonly [-5, 150];
            readonly rotationFlexed: readonly [-25, 30];
        };
        /**
         * Ankle: + toes down (plantar flexion; table average 50, a flexible teen or a swimmer 55-60 - the breaststroke
         * kick points them 52), - toes up (dorsiflexion: 20 with the knee bent, 10 straight).
         */
        readonly ankle: {
            readonly flexion: readonly [-20, 55];
        };
        /** Below the ankle: + inversion (sole inward), - eversion. */
        readonly subtalar: {
            readonly inversion: readonly [-15, 30];
        };
        /** Toes (no toe joints in the rig beyond ToeBase): + toward the sole, - up. */
        readonly toeMTP: {
            readonly flexion: readonly [-70, 35];
        };
        readonly toeIP: {
            readonly flexion: readonly [0, 45];
        };
    };
    readonly couplings: readonly ["A finger tip (DIP) bends at most 0.8 x its middle joint (PIP) + 30: one tendon pulls both.", "No finger spread with the knuckle bent: the spread shrinks to nothing at 90 degrees knuckle bend.", "Hip flexion with a straight knee stops at ~80 (hamstrings); the full 120 needs the knee bent 90.", "Ankle dorsiflexion is 10 with a straight knee, 20 with it bent (calf).", "With the wrist bent over 50 toward the palm the fingers cannot close fully (tenodesis).", "Shoulder external rotation is 60 with the arm at the side, 90 with it raised 90.", "Above ~30 degrees of arm elevation one third of the raise is the shoulder blade and collarbone (2:1 rhythm).", "Knee rotation is 0 with the knee straight and its full range at 90 degrees bend.", "Wrist deviation halves as the wrist reaches its full bend either way.", "At joint extremes, reduce motion on the other axes rather than allowing all maxima together."];
    readonly collisionPairs: readonly [readonly ["hand_L", "forearm_L"], readonly ["hand_R", "forearm_R"], readonly ["forearm_L", "upperArm_L"], readonly ["forearm_R", "upperArm_R"], readonly ["upperArm_L", "torso"], readonly ["upperArm_R", "torso"], readonly ["chin", "chest"], readonly ["calf_L", "thigh_L"], readonly ["calf_R", "thigh_R"], readonly ["thigh_L", "thigh_R"], readonly ["foot_L", "foot_R"]];
    readonly correctiveTriggers: readonly [{
        readonly region: "shoulder";
        readonly trigger: "elevation > 45";
        readonly fixes: readonly ["deltoid raise", "armpit volume", "pectoral slide", "lat fold", "scapula shift"];
    }, {
        readonly region: "elbow";
        readonly trigger: "flexion > 70";
        readonly fixes: readonly ["elbow crease", "biceps compress", "triceps stretch"];
    }, {
        readonly region: "hip";
        readonly trigger: "flexion > 60";
        readonly fixes: readonly ["hip crease", "glute stretch", "groin volume"];
    }, {
        readonly region: "knee";
        readonly trigger: "flexion > 60";
        readonly fixes: readonly ["knee crease", "quad compress", "hamstring compress"];
    }];
};
/** A finger tip's (DIP) largest bend for its middle joint's (PIP) bend. */
export declare const fingerTipMax: (middle: number) => number;
/** A finger's spread range left at a knuckle bend (none at 90). */
export declare const fingerSpreadShare: (knuckle: number) => number;
/** Hip flexion's largest value for a knee bend (hamstrings). */
export declare const hipFlexionMax: (knee: number) => number;
/** Ankle dorsiflexion's largest value (positive degrees) for a knee bend (calf). */
export declare const ankleDorsiflexionMax: (knee: number) => number;
/** Shoulder external rotation's largest value for an arm elevation (degrees from hanging). */
export declare const shoulderExternalRotationMax: (elevation: number) => number;
/** The knee's turn left at a knee bend. */
export declare const kneeRotationShare: (knee: number) => number;
/** The wrist's deviation left at a wrist bend. */
export declare const wristDeviationShare: (bend: number) => number;
/** The finger knuckles' largest bend for a wrist bend toward the palm (tenodesis). */
export declare const knuckleMaxForWrist: (wrist: number) => number;
