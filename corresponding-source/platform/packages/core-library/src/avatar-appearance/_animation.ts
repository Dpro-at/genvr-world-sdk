import type { GenvrManifest } from '@genvr/contracts';
import {
  clampTwist,
  cross3,
  dot3,
  eulerFromBasis,
  eulerFromQ,
  qAxis,
  qFromEuler,
  qInv,
  qMul,
  qRotate,
  scale3,
  sub3,
  unit3,
} from './_joint-math.js';
import { ALL_STYLES, coreManifest } from '../manifest.js';

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
export type RigBone =
  | 'Hips'
  | 'Spine'
  | 'Spine1'
  | 'Spine2'
  | 'Neck'
  | 'Head'
  | `${Side}${'UpLeg' | 'Leg' | 'Foot' | 'ToeBase' | 'Shoulder' | 'Arm' | 'ForeArm' | 'Hand'}`;

export type V3 = [number, number, number];
/**
 * Rotations of some bones, plus an optional hip height offset in meters and an optional hand grip for bodies with
 * finger bones (0 open flat, 1 fist; keys without one use the clip's `grip`, else a relaxed hand).
 */
export type Pose = Partial<Record<RigBone, V3>> & { hipsY?: number; grip?: number };
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
  /**
   * Keys recorded from a played motion (our own motion files): the shoulders already move as they did, so the runtime
   * adds no shoulder lift of its own to raised arms.
   */
  recorded?: boolean;
}

/** A relaxed hand: fingers a little curled, as a hand hangs on its own. */
export const RELAXED_GRIP = 0.3;

/**
 * One Core animation. Player moves live in `avatar-appearance/emotes/<slug>.ts`, movement clips
 * chosen by the engine in `avatar-appearance/animations/<slug>.ts`; the id is
 * `genvr.core.animation.<slug>`.
 */
export function defineAnimation(animation: {
  slug: string;
  name: string;
  clip: string;
  subcategory: 'emotes' | 'animations';
  kind: 'loop' | 'once';
  duration: number;
  keys: Key[];
  grip?: number;
}): AnimationItem {
  return {
    manifest: coreManifest({
      id: `genvr.core.animation.${animation.slug}`,
      name: animation.name,
      type: 'animation',
      category: 'avatar-appearance',
      subcategory: animation.subcategory,
      styles: ALL_STYLES,
    }),
    clip: animation.clip,
    kind: animation.kind,
    duration: animation.duration,
    keys: animation.keys,
    ...(animation.grip === undefined ? {} : { grip: animation.grip }),
  };
}

/**
 * Rotation that points a T-pose arm along a direction in the body frame (x = the body's left, y = up, z = the
 * chest's facing), as Euler XYZ degrees without twist. Directions are easier to read off a reference picture than
 * angles (CHAR-02 move references): `aimArm('Left', [0, 1, 0])` raises the left arm straight up, `[0, 0, 1]`
 * points it ahead of the chest, `[0, -1, 0]` hangs it down. The right arm takes the same direction with its own
 * mirrored rest (it points along -x).
 */
export function aimArm(side: 'Left' | 'Right', direction: V3): V3 {
  const [x, y, z] = direction;
  const length = Math.hypot(x, y, z) || 1;
  const sign = side === 'Left' ? 1 : -1;
  // A T-pose arm along s*x turned by Z then Y (Euler XYZ with X = 0) points at (s*cos z cos y, sin z, -s*cos z sin y)
  // for the left arm; the right arm mirrors x, so solve with the direction mirrored onto the left side.
  const lx = (x * sign) / length;
  const ly = y / length;
  const lz = z / length;
  const degrees = (r: number) => Math.round(((r * 180) / Math.PI) * 10) / 10;
  const zAngle = degrees(Math.asin(Math.max(-1, Math.min(1, ly))));
  const yAngle = degrees(Math.atan2(-lz, lx));
  return side === 'Left' ? [0, yAngle, zAngle] : [0, -yAngle, -zAngle];
}

const RADIANS = Math.PI / 180;

/** A direction turned by Euler XYZ degrees (three.js order: v' = Rx Ry Rz v), or back by the inverse. */
function turn([ex, ey, ez]: V3, [x, y, z]: V3, inverse = false): V3 {
  const rx = (v: V3, a: number): V3 => [v[0], v[1] * Math.cos(a) - v[2] * Math.sin(a), v[1] * Math.sin(a) + v[2] * Math.cos(a)];
  const ry = (v: V3, a: number): V3 => [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], -v[0] * Math.sin(a) + v[2] * Math.cos(a)];
  const rz = (v: V3, a: number): V3 => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a), v[2]];
  if (inverse) return rz(ry(rx([x, y, z], -ex * RADIANS), -ey * RADIANS), -ez * RADIANS);
  return rx(ry(rz([x, y, z], ez * RADIANS), ey * RADIANS), ex * RADIANS);
}

/** The forearm rotation (relative to its upper arm `upper`) that points it along a body-frame direction. */
export const aimForeArm = (side: 'Left' | 'Right', upper: V3, direction: V3): V3 =>
  aimArm(side, turn(upper, direction, true));

/**
 * Rotation that points a rest leg (straight down) along a body-frame direction: X swings it forward (negative) or
 * back, Z out to the side. A rest leg turned by Z then X points at (sin z, -cos z cos x, -cos z sin x).
 */
export function aimLeg(direction: V3): V3 {
  const [x, y, z] = direction;
  const length = Math.hypot(x, y, z) || 1;
  const degrees = (r: number) => Math.round((r / RADIANS) * 10) / 10;
  return [degrees(Math.atan2(-z / length, -y / length)), 0, degrees(Math.asin(Math.max(-1, Math.min(1, x / length))))];
}

/** The shin rotation (relative to its thigh `thigh`) that points it along a body-frame direction. */
export const aimShin = (thigh: V3, direction: V3): V3 => aimLeg(turn(thigh, direction, true));

/**
 * An arm the way a human arm works (owner rule, CHAR-02: "every bone moves only the way it can in nature"): the
 * elbow is a hinge, so the upper arm turns about its own length until the forearm lies in the elbow's bending
 * plane, the elbow only bends forward (ForeArm Y, left negative), and the forearm turns the palm by at most 90
 * degrees either way. Directions are in the body frame (+x own left, +y toward the head, +z the chest's facing);
 * `palm` (optional) is where the palm should face. Returns the Arm and ForeArm rotations.
 */
export function armPose(side: 'Left' | 'Right', upper: V3, fore: V3, palm?: V3): { arm: V3; fore: V3 } {
  const u = unit3(upper);
  const f = unit3(fore);
  let bend = Math.acos(Math.max(-1, Math.min(1, dot3(u, f)))) / RADIANS;
  const across = sub3(f, scale3(u, dot3(f, u)));
  const rest: V3 = side === 'Left' ? [1, 0, 0] : [-1, 0, 0];
  let wanted: V3;
  if (Math.hypot(...across) > 1e-3 && bend > 0.5) wanted = unit3(across);
  else if (palm) {
    // A straight arm: the palm decides the turn (the palm faces local -y, the elbow side is local +z).
    const p = unit3(sub3(palm, scale3(u, dot3(palm, u))));
    wanted = unit3(cross3(side === 'Left' ? u : scale3(u, -1), scale3(p, -1)));
  } else wanted = [0, 0, 1];
  // The upper arm turns about its own length at most UPPER_ARM_TWIST; a nearly straight arm that would need more
  // stays straight instead of flipping the elbow (a forearm "behind" a straight arm is an over-straightened elbow).
  let { side: ez, twist } = clampTwist(rest, [0, 0, 1], u, unit3(sub3(wanted, scale3(u, dot3(wanted, u)))), UPPER_ARM_TWIST);
  if (Math.abs(twist) > UPPER_ARM_TWIST && bend < 30) {
    bend = 0;
    ({ side: ez } = clampTwist(rest, [0, 0, 1], u, [0, 0, 1], UPPER_ARM_TWIST));
  }
  const ex = side === 'Left' ? u : scale3(u, -1);
  const ey = cross3(ez, ex);
  const arm = eulerFromBasis(ex, ey, ez);
  const sign = side === 'Left' ? -1 : 1;
  const hinge = qAxis([0, 1, 0], sign * Math.min(bend, 150));
  let forearmTwist = 0;
  if (palm) {
    // The palm (local -y) turned about the forearm's own length toward the wanted palm, within the forearm's reach.
    const toLocal = qInv(qMul(qFromEuler(arm), hinge));
    const local = qRotate(toLocal, unit3(palm));
    forearmTwist = Math.max(-FOREARM_TWIST, Math.min(FOREARM_TWIST, Math.atan2(-local[2], -local[1]) / RADIANS));
  }
  return { arm, fore: eulerFromQ(qMul(hinge, qAxis([1, 0, 0], forearmTwist))) };
}

/** One arm as pose fields, built by `armPose` (directions in the body frame, see there). */
export function arm(side: 'Left' | 'Right', upper: V3, fore: V3, palm: V3): Pose {
  const { arm: a, fore: f } = armPose(side, upper, fore, palm);
  return side === 'Left' ? { LeftArm: a, LeftForeArm: f } : { RightArm: a, RightForeArm: f };
}

/** The mirror of a body-frame direction across the body's middle (left <-> right). */
export const mirror = ([x, y, z]: V3): V3 => [-x, y, z];

/** Both arms, the left as given and the right its mirror image. */
export const bothArms = (upper: V3, fore: V3, palm: V3): Pose => ({
  ...arm('Left', upper, fore, palm),
  ...arm('Right', mirror(upper), mirror(fore), mirror(palm)),
});

/** How far the upper arm turns about its own length from its untwisted swing, degrees. */
export const UPPER_ARM_TWIST = 90;
/** How far the thigh turns about its own length from its untwisted swing, degrees. */
export const THIGH_TWIST = 50;

/** How far the forearm turns the palm either way (pronation and supination), degrees. */
export const FOREARM_TWIST = 90;

/**
 * A leg the way a human leg works: the knee is a hinge that only bends backward (Leg X positive), so the thigh turns
 * about its own length until the shin lies in the knee's plane; a straight leg keeps the kneecap to the chest's
 * facing (or up when the thigh points ahead, as when sitting). Returns the UpLeg and Leg rotations.
 */
export function legPose(thigh: V3, shin: V3): { thigh: V3; shin: V3 } {
  const t = unit3(thigh);
  const s = unit3(shin);
  let bend = Math.acos(Math.max(-1, Math.min(1, dot3(t, s)))) / RADIANS;
  const behind = sub3(s, scale3(t, dot3(s, t)));
  // The kneecap side (local +z) faces away from where the shin folds; a straight leg keeps it to the front.
  const wanted: V3 = Math.hypot(...behind) > 1e-3 && bend > 0.5 ? scale3(unit3(behind), -1) : [0, 0, 1];
  let { side: ez, twist } = clampTwist([0, -1, 0], [0, 0, 1], t, unit3(sub3(wanted, scale3(t, dot3(wanted, t)))), THIGH_TWIST);
  if (Math.abs(twist) > THIGH_TWIST && bend < 30) {
    bend = 0;
    ({ side: ez } = clampTwist([0, -1, 0], [0, 0, 1], t, [0, 0, 1], THIGH_TWIST));
  }
  const ey = scale3(t, -1);
  const ex = cross3(ey, ez);
  return { thigh: eulerFromBasis(ex, ey, ez), shin: [Math.round(Math.min(bend, 155) * 100) / 100, 0, 0] };
}

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
export function referenceKey(pose: ReferencePose, duration: number, basePitch = 0): Key {
  const left = armPose('Left', pose.leftUpperArm, pose.leftForearm, pose.leftPalm);
  const right = armPose('Right', pose.rightUpperArm, pose.rightForearm, pose.rightPalm);
  const leftLeg = legPose(pose.leftThigh, pose.leftShin);
  const rightLeg = legPose(pose.rightThigh, pose.rightShin);
  // Hips +Y lifts the left side toward -z, so a roll toward +z is a negative Y; the neck undoes most of the roll
  // so the face stays with the motion unless the reference turns the head.
  return [
    pose.t * duration,
    {
      Hips: [-(pose.bodyPitch - basePitch), -pose.bodyRoll, 0],
      Spine2: [pose.spineBend, 0, 0],
      Neck: [pose.headTilt * 0.4, pose.bodyRoll * 0.8 + pose.headTurn * 0.6, 0],
      Head: [pose.headTilt * 0.6, pose.headTurn * 0.4, 0],
      LeftArm: left.arm,
      LeftForeArm: left.fore,
      RightArm: right.arm,
      RightForeArm: right.fore,
      LeftUpLeg: leftLeg.thigh,
      LeftLeg: leftLeg.shin,
      RightUpLeg: rightLeg.thigh,
      RightLeg: rightLeg.shin,
      LeftFoot: [pose.footPoint, 0, 0],
      RightFoot: [pose.footPoint, 0, 0],
      grip: pose.grip,
      ...(pose.hipsY === undefined ? {} : { hipsY: pose.hipsY }),
    },
  ];
}

/** Hanging arm angle. */
export const DOWN = 78;
export const arms = (left: V3, right: V3): Pose => ({ LeftArm: left, RightArm: right });

/** Standing still with relaxed arms: one-shot moves start and end here to blend cleanly. */
export const REST: Pose = {
  ...arms([0, 0, -DOWN], [0, 0, DOWN]),
  LeftForeArm: [0, -8, 0],
  RightForeArm: [0, 8, 0],
};

/** A key on top of the rest pose. */
export const at = (time: number, pose: Pose): Key => [time, { ...REST, ...pose }];

/** Alternating poses on evenly spaced beats (count + 1 keys from `from` to `to`). */
export const beats = (from: number, to: number, count: number, even: Pose, odd: Pose): Key[] =>
  Array.from({ length: count + 1 }, (_, i) => at(from + ((to - from) * i) / count, i % 2 === 0 ? even : odd));

/** A walk or run cycle: legs and arms swing opposite, knees bend on the passing pose. */
export function gait(
  duration: number,
  o: {
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
  },
): Key[] {
  // A body swings as it walks (P2-35, owner: hair must sway left and right): the pelvis turns with the
  // forward leg and drops on the lifted side, the chest turns and leans back the other way, and the
  // neck keeps the head facing ahead and nearly level. The head still moves a little from side to
  // side, as a real one does, and that is what swings a ponytail.
  const twist = o.twist ?? o.leg * 0.2;
  const roll = o.roll ?? o.leg * 0.08;
  const step = (sign: number, t: number): Key => [
    t,
    {
      Hips: [0, -twist * sign, 0],
      LeftUpLeg: [-o.leg * sign, 0, 0],
      RightUpLeg: [o.leg * sign, 0, 0],
      LeftLeg: [sign > 0 ? o.knee * 0.3 : o.knee * 0.15, 0, 0],
      RightLeg: [sign < 0 ? o.knee * 0.3 : o.knee * 0.15, 0, 0],
      ...arms([o.arm * sign, 0, -DOWN], [-o.arm * sign, 0, DOWN]),
      LeftForeArm: [0, -o.elbow, 0],
      RightForeArm: [0, o.elbow, 0],
      Spine: [o.lean, 0, 0],
      Spine2: [0, twist * 1.8 * sign, 0],
      Neck: [0, -twist * 0.8 * sign, 0],
      hipsY: -o.bob,
    },
  ];
  const pass = (t: number, leftLifted: boolean): Key => {
    const side = leftLifted ? 1 : -1;
    return [
      t,
      {
        Hips: [0, 0, -roll * side],
        LeftUpLeg: [leftLifted ? -o.leg * 0.4 : o.leg * 0.2, 0, roll * side],
        RightUpLeg: [leftLifted ? o.leg * 0.2 : -o.leg * 0.4, 0, roll * side],
        LeftLeg: [leftLifted ? o.knee : 0, 0, 0],
        RightLeg: [leftLifted ? 0 : o.knee, 0, 0],
        ...arms([0, 0, -DOWN], [0, 0, DOWN]),
        LeftForeArm: [0, -o.elbow, 0],
        RightForeArm: [0, o.elbow, 0],
        Spine: [o.lean, 0, roll * 1.6 * side],
        Neck: [0, 0, -roll * 0.6 * side],
        hipsY: o.bob,
      },
    ];
  };
  const d = duration;
  return [step(1, 0), pass(d * 0.25, false), step(-1, d * 0.5), pass(d * 0.75, true), step(1, d)];
}

/** A pose held for the whole clip (sitting). */
export const hold = (duration: number, pose: Pose): Key[] => [
  [0, pose],
  [duration, pose],
];
