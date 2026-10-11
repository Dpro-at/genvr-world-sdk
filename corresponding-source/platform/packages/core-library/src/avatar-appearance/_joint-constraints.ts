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

export const HUMAN_JOINT_CONSTRAINTS = {
  format: 'genvr-human-joint-constraints/2',
  /** Past this share of a range the motion gets stiffer (animation, solvers); the end is a hard clamp. */
  softLimitStart: 0.85,
  joints: {
    /** The lower back (Spine bone): + forward. */
    lumbar: { flexion: [-20, 50], sideBend: [-20, 20], twist: [-10, 10] },
    /** The upper back (Spine1 + Spine2 bones). */
    thoracic: { flexion: [-25, 35], sideBend: [-25, 25], twist: [-35, 35] },
    /** The neck (C2-C7, Neck bone): + forward (chin down). Shares the turn with the head. */
    neck: { flexion: [-50, 40], sideBend: [-35, 35], twist: [-35, 35] },
    /** The head on the neck (C0-C2, Head bone). Together with the neck: flexion 55, extension 75, side 43, turn 80. */
    head: { flexion: [-25, 15], sideBend: [-8, 8], twist: [-45, 45] },
    /** The collarbone (Shoulder bone): + up, + forward, + its own backward turn as the arm rises. */
    clavicle: { elevation: [-10, 35], protraction: [-15, 30], axialRotation: [0, 45] },
    /** The shoulder blade (no bone in the rig: carried by the collarbone and the corrective shapes). */
    scapula: { upwardRotation: [-10, 60], protraction: [-20, 35], posteriorTilt: [-10, 30] },
    /**
     * The arm against the chest (shoulder joint + shoulder blade together): flexion forward (- behind), abduction to
     * the side, horizontal adduction across the chest (- back), rotation (+ external). External rotation is 60 with
     * the arm at the side and 90 with it raised 90 (`shoulderExternalRotation`).
     */
    shoulder: { flexion: [-60, 180], abduction: [0, 180], horizontalAdduction: [-45, 130], rotation: [-70, 90] },
    /** The shoulder joint alone (glenohumeral): what is left once the shoulder blade has turned. */
    glenohumeral: { flexion: [-60, 120], abduction: [0, 120] },
    /** Elbow: a hinge; active ~145, 150 pushed; up to 10 backward is normal in teens. */
    elbow: { flexion: [-10, 150] },
    /** Forearm: + supination (palm up / forward), - pronation. */
    forearm: { rotation: [-80, 85] },
    /** Wrist: + toward the palm; deviation + toward the little finger (ulnar), - toward the thumb (radial). */
    wrist: { flexion: [-70, 80], deviation: [-20, 35] },
    thumbCMC: { flexion: [-15, 50], abduction: [0, 60], opposition: [0, 45] },
    thumbMCP: { flexion: [-15, 55] },
    thumbIP: { flexion: [-20, 80] },
    /** Finger knuckles (index to little): + toward the palm; 30 back actively (45 pushed). */
    fingerMCP: { flexion: [-30, 90] },
    /** Sideways at the knuckle, + away from the middle finger, per finger. */
    fingerSpread: { index: [-20, 20], middle: [-10, 10], ring: [-15, 15], little: [-25, 25] },
    fingerPIP: { flexion: [-5, 110] },
    fingerDIP: { flexion: [-10, 85] },
    /** Hip: + forward, abduction (- across), rotation (+ external). 120 forward only with the knee bent. */
    hip: { flexion: [-30, 120], abduction: [-30, 45], rotation: [-35, 45] },
    /** Knee: a hinge; active ~135, 150 kneeling or squatting; a little backward; turn only when bent. */
    knee: { flexion: [-5, 150], rotationFlexed: [-25, 30] },
    /**
     * Ankle: + toes down (plantar flexion; table average 50, a flexible teen or a swimmer 55-60 - the breaststroke
     * kick points them 52), - toes up (dorsiflexion: 20 with the knee bent, 10 straight).
     */
    ankle: { flexion: [-20, 55] },
    /** Below the ankle: + inversion (sole inward), - eversion. */
    subtalar: { inversion: [-15, 30] },
    /** Toes (no toe joints in the rig beyond ToeBase): + toward the sole, - up. */
    toeMTP: { flexion: [-70, 35] },
    toeIP: { flexion: [0, 45] },
  },
  couplings: [
    'A finger tip (DIP) bends at most 0.8 x its middle joint (PIP) + 30: one tendon pulls both.',
    'No finger spread with the knuckle bent: the spread shrinks to nothing at 90 degrees knuckle bend.',
    'Hip flexion with a straight knee stops at ~80 (hamstrings); the full 120 needs the knee bent 90.',
    'Ankle dorsiflexion is 10 with a straight knee, 20 with it bent (calf).',
    'With the wrist bent over 50 toward the palm the fingers cannot close fully (tenodesis).',
    'Shoulder external rotation is 60 with the arm at the side, 90 with it raised 90.',
    'Above ~30 degrees of arm elevation one third of the raise is the shoulder blade and collarbone (2:1 rhythm).',
    'Knee rotation is 0 with the knee straight and its full range at 90 degrees bend.',
    'Wrist deviation halves as the wrist reaches its full bend either way.',
    'At joint extremes, reduce motion on the other axes rather than allowing all maxima together.',
  ],
  collisionPairs: [
    ['hand_L', 'forearm_L'], ['hand_R', 'forearm_R'], ['forearm_L', 'upperArm_L'], ['forearm_R', 'upperArm_R'],
    ['upperArm_L', 'torso'], ['upperArm_R', 'torso'], ['chin', 'chest'], ['calf_L', 'thigh_L'], ['calf_R', 'thigh_R'],
    ['thigh_L', 'thigh_R'], ['foot_L', 'foot_R'],
  ],
  correctiveTriggers: [
    { region: 'shoulder', trigger: 'elevation > 45', fixes: ['deltoid raise', 'armpit volume', 'pectoral slide', 'lat fold', 'scapula shift'] },
    { region: 'elbow', trigger: 'flexion > 70', fixes: ['elbow crease', 'biceps compress', 'triceps stretch'] },
    { region: 'hip', trigger: 'flexion > 60', fixes: ['hip crease', 'glute stretch', 'groin volume'] },
    { region: 'knee', trigger: 'flexion > 60', fixes: ['knee crease', 'quad compress', 'hamstring compress'] },
  ],
} as const;

const J = HUMAN_JOINT_CONSTRAINTS.joints;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** A finger tip's (DIP) largest bend for its middle joint's (PIP) bend. */
export const fingerTipMax = (middle: number) => Math.min(J.fingerDIP.flexion[1], 0.8 * Math.max(0, middle) + 30);
/** A finger's spread range left at a knuckle bend (none at 90). */
export const fingerSpreadShare = (knuckle: number) => clamp01(1 - Math.max(0, knuckle) / 90);
/** Hip flexion's largest value for a knee bend (hamstrings). */
export const hipFlexionMax = (knee: number) => 80 + 40 * clamp01(knee / 90);
/** Ankle dorsiflexion's largest value (positive degrees) for a knee bend (calf). */
export const ankleDorsiflexionMax = (knee: number) => 10 + 10 * clamp01(knee / 45);
/** Shoulder external rotation's largest value for an arm elevation (degrees from hanging). */
export const shoulderExternalRotationMax = (elevation: number) => 60 + 30 * clamp01(elevation / 90);
/** The knee's turn left at a knee bend. */
export const kneeRotationShare = (knee: number) => clamp01(knee / 90);
/** The wrist's deviation left at a wrist bend. */
export const wristDeviationShare = (bend: number) => 1 - 0.5 * clamp01((Math.abs(bend) - 40) / 40);
/** The finger knuckles' largest bend for a wrist bend toward the palm (tenodesis). */
export const knuckleMaxForWrist = (wrist: number) => J.fingerMCP.flexion[1] - 1.2 * Math.max(0, wrist - 50);
