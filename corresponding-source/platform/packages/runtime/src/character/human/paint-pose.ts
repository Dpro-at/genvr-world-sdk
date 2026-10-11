import {
  HUMAN_JOINT_CONSTRAINTS,
  ankleDorsiflexionMax,
  fingerSpreadShare,
  fingerTipMax,
  hipFlexionMax,
  jointProblems,
  knuckleMaxForWrist,
  shoulderExternalRotationMax,
  wristDeviationShare,
  type Pose,
} from '@genvr/core-library';
import { DQS_SHARE } from '../dual-quaternion-skinning.js';

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

const C = HUMAN_JOINT_CONSTRAINTS.joints;
/** A slider over a constraint range. */
const over = (range: readonly [number, number]) => ({ min: range[0], max: range[1] });
/**
 * Every slider's range comes from `HUMAN_JOINT_CONSTRAINTS` (the one source for human joint limits, owner
 * 2026-10-05); the couplings between joints are `coupledPose`. Signs: + is the named motion. Arm up: 0 hanging, 90
 * level, 180 straight up; arm to the front: 0 out to his side, 90 straight in front, more across his chest, negative
 * behind. The A-pose values (arm up ~42, elbow ~45) are where those sliders start (`poseRest`).
 */
export const POSE_CONTROLS: readonly PoseControl[] = [
  { key: 'head.nod', label: 'Look down (+) / up', group: 'Head', min: C.neck.flexion[0] + C.head.flexion[0], max: C.neck.flexion[1] + C.head.flexion[1], sided: false },
  { key: 'head.turn', label: 'Look left / right', group: 'Head', min: -(C.neck.twist[1] + C.head.twist[1]), max: C.neck.twist[1] + C.head.twist[1], sided: false },
  { key: 'head.tilt', label: 'Tilt', group: 'Head', min: -(C.neck.sideBend[1] + C.head.sideBend[1]), max: C.neck.sideBend[1] + C.head.sideBend[1], sided: false },
  { key: 'spine.bend', label: 'Bend forward (+) / back', group: 'Spine', min: C.lumbar.flexion[0] + C.thoracic.flexion[0], max: C.lumbar.flexion[1] + C.thoracic.flexion[1], sided: false },
  { key: 'spine.turn', label: 'Turn', group: 'Spine', min: -(C.lumbar.twist[1] + C.thoracic.twist[1]), max: C.lumbar.twist[1] + C.thoracic.twist[1], sided: false },
  { key: 'spine.side', label: 'Lean sideways', group: 'Spine', min: -(C.lumbar.sideBend[1] + C.thoracic.sideBend[1]), max: C.lumbar.sideBend[1] + C.thoracic.sideBend[1], sided: false },
  { key: 'collar.lift', label: 'Shrug (collarbone up)', group: 'Shoulder', ...over(C.clavicle.elevation), sided: true },
  { key: 'arm.up', label: 'Arm up (from hanging)', group: 'Shoulder', ...over(C.shoulder.abduction), sided: true },
  { key: 'arm.forward', label: 'Arm to the back / front', group: 'Shoulder', min: -60, max: C.shoulder.horizontalAdduction[1], sided: true },
  { key: 'arm.twist', label: 'Upper arm turn (+ out)', group: 'Shoulder', ...over(C.shoulder.rotation), sided: true },
  { key: 'elbow.bend', label: 'Elbow bend', group: 'Elbow', ...over(C.elbow.flexion), sided: true },
  { key: 'elbow.twist', label: 'Forearm turn (+ palm up)', group: 'Elbow', ...over(C.forearm.rotation), sided: true },
  { key: 'wrist.bend', label: 'Wrist bend (+ to the palm)', group: 'Wrist', ...over(C.wrist.flexion), sided: true },
  { key: 'wrist.side', label: 'Wrist sideways (+ to the pinky)', group: 'Wrist', ...over(C.wrist.deviation), sided: true },
  // The hand joint by joint (owner, 2026-10-05: "every detail - the wrist, the palm, each finger's first, second and
  // third joint, the thumb"). The rig has no palm (metacarpal) bones: "Palm cup" turns the ring and pinky rays toward
  // the thumb at their knuckles, the way the palm's arch closes.
  { key: 'hand.fist', label: 'Fist (all joints)', group: 'Palm', min: 0, max: 100, sided: true, unit: '%' },
  { key: 'hand.spread', label: 'Spread all fingers', group: 'Palm', min: -10, max: 20, sided: true },
  { key: 'palm.cup', label: 'Palm cup (arch)', group: 'Palm', min: 0, max: 30, sided: true },
  { key: 'thumb.across', label: 'Base: across the palm', group: 'Thumb', ...over(C.thumbCMC.flexion), sided: true },
  { key: 'thumb.out', label: 'Base: out from the palm', group: 'Thumb', ...over(C.thumbCMC.abduction), sided: true },
  { key: 'thumb.turn', label: 'Base: turn to the fingers', group: 'Thumb', ...over(C.thumbCMC.opposition), sided: true },
  { key: 'thumb.mid', label: '2nd joint bend', group: 'Thumb', ...over(C.thumbMCP.flexion), sided: true },
  { key: 'thumb.tip', label: '3rd joint (tip) bend', group: 'Thumb', ...over(C.thumbIP.flexion), sided: true },
  ...(['index', 'middle', 'ring', 'pinky'] as const).flatMap((finger) => {
    const group = finger[0]!.toUpperCase() + finger.slice(1);
    const spread = C.fingerSpread[finger === 'pinky' ? 'little' : finger];
    return [
      { key: `${finger}.base`, label: '1st joint (knuckle) bend', group, ...over(C.fingerMCP.flexion), sided: true },
      { key: `${finger}.side`, label: '1st joint sideways', group, ...over(spread), sided: true },
      { key: `${finger}.mid`, label: '2nd joint bend', group, ...over(C.fingerPIP.flexion), sided: true },
      { key: `${finger}.tip`, label: '3rd joint (tip) bend', group, ...over(C.fingerDIP.flexion), sided: true },
    ];
  }),
  { key: 'leg.forward', label: 'Leg back / forward', group: 'Hip', ...over(C.hip.flexion), sided: true },
  { key: 'leg.out', label: 'Leg in / out', group: 'Hip', ...over(C.hip.abduction), sided: true },
  { key: 'leg.twist', label: 'Leg turn (+ out)', group: 'Hip', ...over(C.hip.rotation), sided: true },
  { key: 'knee.bend', label: 'Knee bend', group: 'Knee', ...over(C.knee.flexion), sided: true },
  { key: 'ankle.bend', label: 'Toes down (+) / up', group: 'Ankle', ...over(C.ankle.flexion), sided: true },
  { key: 'ankle.side', label: 'Sole in (+) / out', group: 'Ankle', ...over(C.subtalar.inversion), sided: true },
];

/**
 * The couplings between joints (`HUMAN_JOINT_CONSTRAINTS.couplings`) applied to slider values: a finger tip only
 * as far as its middle joint lets it, no spread with the knuckle bent, the knuckles with the wrist bent (tenodesis),
 * the wrist's sideways with its bend, the hip's forward with a straight knee (hamstrings), toes up with a straight knee
 * (calf), the upper arm's outward turn with its height. `rest` gives the sliders that do not start at 0.
 */
export function coupledPose(values: PaintPoseValues, rest: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = { ...values };
  const get = (key: string) => poseValue(out, key, rest[key.replace(/^[LR]\./, '')] ?? 0);
  const cap = (key: string, low: number, high: number) => {
    if (!(key in out)) {
      const value = get(key);
      if (value >= low && value <= high) return;
    }
    out[key] = Math.max(low, Math.min(high, get(key)));
  };
  for (const side of ['L', 'R']) {
    const k = (key: string) => `${side}.${key}`;
    const wrist = get(k('wrist.bend'));
    const deviation = wristDeviationShare(wrist);
    cap(k('wrist.side'), C.wrist.deviation[0] * deviation, C.wrist.deviation[1] * deviation);
    for (const finger of ['index', 'middle', 'ring', 'pinky']) {
      cap(k(`${finger}.base`), C.fingerMCP.flexion[0], knuckleMaxForWrist(wrist));
      const spread = C.fingerSpread[finger === 'pinky' ? 'little' : (finger as 'index' | 'middle' | 'ring')];
      const share = fingerSpreadShare(get(k(`${finger}.base`)));
      cap(k(`${finger}.side`), spread[0] * share, spread[1] * share);
      cap(k(`${finger}.tip`), C.fingerDIP.flexion[0], fingerTipMax(get(k(`${finger}.mid`))));
    }
    const knee = get(k('knee.bend'));
    cap(k('leg.forward'), C.hip.flexion[0], hipFlexionMax(knee));
    cap(k('ankle.bend'), -ankleDorsiflexionMax(knee), C.ankle.flexion[1]);
    cap(k('arm.twist'), C.shoulder.rotation[0], shoulderExternalRotationMax(get(k('arm.up'))));
  }
  return out;
}

/** The pole the elbow hinge keeps facing: his midline, a little down (palms down when the arm is level to the side). */
export const ARM_POLE_DOWN = 0.35;

/** Share of an arm raise taken by the collarbone (the shoulder rhythm, about 1 : 2). */
export const SHOULDER_RHYTHM = 1 / 3;

/** Pose values by key (`head.nod`, `L.arm.up`, ...); missing keys are the A-pose (elbow: its own bend). */
export type PaintPoseValues = Readonly<Record<string, number>>;

type Vec = [number, number, number];
type Quat = [number, number, number, number];

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec): Vec => {
  const n = Math.hypot(...a) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};
const ID: Quat = [0, 0, 0, 1];
const axisAngle = (axis: Vec, degrees: number): Quat => {
  const half = (degrees * Math.PI) / 360;
  const s = Math.sin(half);
  const a = unit(axis);
  return [a[0] * s, a[1] * s, a[2] * s, Math.cos(half)];
};
const mul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const rotate = (q: Quat, v: Vec): Vec => {
  const u: Vec = [q[0], q[1], q[2]];
  const t = cross(u, v).map((x) => x * 2) as Vec;
  return add(add(v, t.map((x) => x * q[3]) as Vec), cross(u, t));
};
const inverse = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];
/** The shortest turn from direction a to direction b. */
const between = (a: Vec, b: Vec): Quat => {
  const x = unit(a);
  const y = unit(b);
  const d = dot(x, y);
  if (d < -0.999999) return axisAngle(Math.abs(x[0]) < 0.9 ? cross(x, [1, 0, 0]) : cross(x, [0, 1, 0]), 180);
  const c = cross(x, y);
  const q: Quat = [c[0], c[1], c[2], 1 + d];
  const n = Math.hypot(...q);
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
};
const angleBetween = (a: Vec, b: Vec) => (Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b))))) * 180) / Math.PI;

export interface PoseSkeleton {
  names: readonly string[];
  parents: readonly number[];
  /** Each joint's A-pose position (same units as the mesh). */
  pivots: readonly Vec[];
}

/** The clamped value of one control. */
export function poseValue(values: PaintPoseValues, key: string, fallback = 0): number {
  const bare = /^[LR]\./.test(key) ? key.slice(2) : key;
  const control = POSE_CONTROLS.find((one) => one.key === bare);
  const value = values[key] ?? fallback;
  return control ? Math.max(control.min, Math.min(control.max, value)) : value;
}

/** The A-pose's own elbow bend (degrees) on his left: the elbow slider starts there. */
export function restElbowBend(skeleton: PoseSkeleton): number {
  const at = (name: string) => skeleton.pivots[skeleton.names.indexOf(name)]!;
  return angleBetween(sub(at('LeftForeArm'), at('LeftArm')), sub(at('LeftHand'), at('LeftForeArm')));
}

/** Where the upper arm points (unit, chest axes) for arm up / arm to the front on a side (s = +1 his left). */
const armDirection = (up: number, front: number, s: number): Vec => {
  const e = (up * Math.PI) / 180;
  const a = (front * Math.PI) / 180;
  return [s * Math.sin(e) * Math.cos(a), -Math.cos(e), Math.sin(e) * Math.sin(a)];
};

/** The A-pose's own values of the controls that do not start at 0 (arm up, arm to the front, elbow bend). */
export function poseRest(skeleton: PoseSkeleton): Record<string, number> {
  const at = (name: string) => skeleton.pivots[skeleton.names.indexOf(name)]!;
  const dir = unit(sub(at('LeftForeArm'), at('LeftArm')));
  return {
    'arm.up': (Math.acos(Math.max(-1, Math.min(1, -dir[1]))) * 180) / Math.PI,
    'arm.forward': (Math.atan2(dir[2], dir[0]) * 180) / Math.PI,
    'elbow.bend': restElbowBend(skeleton),
  };
}

/** Each joint's local turn (in the A-pose world axes) for the pose values. */
/** A turn spread along a bone (the forearm's palm turn): 0 at the bone's joint, the whole angle at its end. */
interface SpreadTwist {
  bone: number;
  /** The bone's axis in the A-pose (joint to its end). */
  axis: Vec;
  angle: number;
}

/**
 * Each joint's local turn (in the A-pose world axes) for the pose values. The forearm has two bones in a body (radius
 * and ulna: the radius turns round the ulna), our rig one: with `alongForearm` the palm turn goes on the hand and is listed
 * in `twists`, so the skin turns from nothing at the elbow to all of it at the wrist (`poseBody`); without, it stays
 * on the forearm bone as the clips store it (`clipPose`, the joint law).
 */
function localTurns(skeleton: PoseSkeleton, values: PaintPoseValues, alongForearm = false, twists: SpreadTwist[] = []): Quat[] {
  const at = (name: string) => skeleton.pivots[skeleton.names.indexOf(name)]!;
  const turns = skeleton.names.map(() => ID);
  const set = (name: string, q: Quat) => {
    const i = skeleton.names.indexOf(name);
    if (i >= 0) turns[i] = mul(turns[i]!, q);
  };
  const restValues = poseRest(skeleton);
  const coupled = coupledPose(values, restValues);
  const v = (key: string, fallback = 0) => poseValue(coupled, key, fallback);
  // The neck and head share one budget, the lower and upper back theirs, each part by its own share of the range
  // (`HUMAN_JOINT_CONSTRAINTS`). +x his left, +y up, +z his front.
  const share = (value: number, part: readonly [number, number], whole: readonly [number, number]) =>
    value >= 0 ? (value * part[1]) / (whole[1] || 1) : (value * part[0]) / (whole[0] || -1);
  const sum = (a: readonly [number, number], b: readonly [number, number]) => [a[0] + b[0], a[1] + b[1]] as const;
  const turnOf = (
    parts: readonly { flexion: readonly [number, number]; sideBend: readonly [number, number]; twist: readonly [number, number] }[],
    i: number,
    bend: number,
    side: number,
    twist: number,
  ) => {
    const whole = parts.reduce((a, p) => ({ flexion: sum(a.flexion, p.flexion), sideBend: sum(a.sideBend, p.sideBend), twist: sum(a.twist, p.twist) }), {
      flexion: [0, 0] as readonly [number, number],
      sideBend: [0, 0] as readonly [number, number],
      twist: [0, 0] as readonly [number, number],
    });
    const p = parts[i]!;
    return mul(
      mul(axisAngle([0, 1, 0], share(twist, p.twist, whole.twist)), axisAngle([1, 0, 0], share(bend, p.flexion, whole.flexion))),
      axisAngle([0, 0, 1], -share(side, p.sideBend, whole.sideBend)),
    );
  };
  const head = [C.neck, C.head];
  ['Neck', 'Head'].forEach((bone, i) => set(bone, turnOf(head, i, v('head.nod'), v('head.tilt'), v('head.turn'))));
  // The upper back's range shared by its two bones.
  const upper = { flexion: [C.thoracic.flexion[0] / 2, C.thoracic.flexion[1] / 2], sideBend: [C.thoracic.sideBend[0] / 2, C.thoracic.sideBend[1] / 2], twist: [C.thoracic.twist[0] / 2, C.thoracic.twist[1] / 2] } as const;
  const back = [C.lumbar, upper, upper];
  ['Spine', 'Spine1', 'Spine2'].forEach((bone, i) => set(bone, turnOf(back, i, v('spine.bend'), v('spine.side'), v('spine.turn'))));
  const rest = restValues['elbow.bend']!;
  for (const side of ['L', 'R'] as const) {
    const name = side === 'L' ? 'Left' : 'Right';
    const s = side === 'L' ? 1 : -1;
    const k = (key: string, fallback = 0) => v(`${side}.${key}`, fallback);
    // Where the upper arm points (chest axes), and the shoulder rhythm (owner: the shoulder broke when the arm went
    // up): above the A-pose about a third of the raise is the shoulder blade and collarbone (within their limit).
    const armUp = k('arm.up', restValues['arm.up']);
    const lift = Math.min(C.clavicle.elevation[1] - Math.max(0, k('collar.lift')), Math.max(0, armUp - restValues['arm.up']!) * SHOULDER_RHYTHM);
    const collarTurn = axisAngle([0, 0, 1], s * (k('collar.lift') + lift));
    set(`${name}Shoulder`, collarTurn);
    // Shoulder, a ball joint: the shortest swing from the A-pose direction to the asked one (seen past the collarbone),
    // then the twist about the upper arm.
    const upper = sub(at(`${name}ForeArm`), at(`${name}Arm`));
    const target = rotate(inverse(collarTurn), armDirection(armUp, k('arm.forward', restValues['arm.forward']), s));
    // The upper arm's roll from a stable pole (owner review, 2026-10-05: "the palms turn outward when the arms go
    // up"): the shortest swing alone turns the palm out overhead (Codman's paradox). The elbow hinge - and with it the
    // palm, which lies along it in this neutral forearm - keeps facing his midline (palms down only with the arm level
    // out to the side), as a real upper arm turns outward while it rises; `arm.twist` adds to it.
    const roll = (dir: Vec, pole: Vec) => {
      const turned = rotate(between(upper, dir), unit(cross(upper, sub(at(`${name}Hand`), at(`${name}ForeArm`)))));
      const wanted = unit(sub(pole, dir.map((x) => x * dot(pole, dir)) as Vec));
      return (Math.atan2(dot(cross(turned, wanted), dir), dot(turned, wanted)) * 180) / Math.PI;
    };
    const pole: Vec = [-s, -ARM_POLE_DOWN, 0];
    const natural = roll(target, rotate(inverse(collarTurn), pole)) - roll(unit(upper), pole);
    set(`${name}Arm`, mul(axisAngle(target, natural - s * k('arm.twist')), between(upper, target)));
    // Elbow: a hinge (square to the upper arm and forearm), its bend measured from straight; the forearm turns the palm.
    const fore = sub(at(`${name}Hand`), at(`${name}ForeArm`));
    // The mesh's own hinge (square to its upper arm and forearm); `clipPose` rolls the T-pose upper arm so the joint
    // law's hinge is this one.
    const hinge = cross(upper, fore);
    const palmTurn = -s * k('elbow.twist');
    set(`${name}ForeArm`, alongForearm ? axisAngle(hinge, k('elbow.bend', rest) - rest) : mul(axisAngle(hinge, k('elbow.bend', rest) - rest), axisAngle(fore, palmTurn)));
    if (alongForearm) twists.push({ bone: skeleton.names.indexOf(`${name}ForeArm`), axis: fore, angle: palmTurn });
    // Wrist: the palm faces his thigh (-x on the left): bend toward the palm, sideways about the palm's normal.
    const palm: Vec = unit(sub([-s, 0, 0], unit(fore).map((x) => x * dot([-s, 0, 0], unit(fore))) as Vec));
    // The wrist rides on the radius: the palm turn first, then the wrist's own bend in the turned frame.
    set(`${name}Hand`, mul(alongForearm ? axisAngle(fore, palmTurn) : ID, mul(axisAngle(cross(fore, palm), k('wrist.bend')), axisAngle(palm, -k('wrist.side')))));
    // Hip: forward, out to his side, twist about the thigh; knee a hinge bending back; ankle toes down / up, in / out.
    const thigh = sub(at(`${name}Leg`), at(`${name}UpLeg`));
    // The hand's own frame from its knuckles: along the hand, across it (index to pinky) and the palm's normal.
    const hand = at(`${name}Hand`);
    const across = unit(sub(at(`${name}HandPinky1`), at(`${name}HandIndex1`)));
    const along = unit(sub(at(`${name}HandMiddle1`), hand));
    let palmNormal = unit(cross(along, across));
    if (dot(palmNormal, [-s, 0, 0]) < 0) palmNormal = palmNormal.map((x) => -x) as Vec;
    const fist = k('hand.fist') / 100;
    const spread = k('hand.spread');
    const clampTo = (key: string, value: number) => poseValue({ [key]: value }, key);
    // Each finger, joint by joint: the 1st joint bends toward the palm and turns sideways about the palm's normal, the
    // 2nd and 3rd bend toward the palm (a turn about d x n brings d toward n). The fist adds to every joint.
    const SPREAD_SHARE: Record<string, number> = { Index: -1, Middle: 0, Ring: 0.6, Pinky: 1.2 };
    const CUP_SHARE: Record<string, number> = { Index: 0, Middle: 0, Ring: 0.5, Pinky: 1 };
    for (const finger of ['Index', 'Middle', 'Ring', 'Pinky'] as const) {
      const key = finger.toLowerCase();
      const bone = (n: number) => `${name}Hand${finger}${n}`;
      const dir1 = unit(sub(at(bone(2)), at(bone(1))));
      const dir2 = unit(sub(at(bone(3)), at(bone(2))));
      const joint = (part: string, fistAdd: number) => clampTo(`${side}.${key}.${part}`, k(`${key}.${part}`) + fistAdd * fist);
      // Sideways: + moves the finger away from the middle finger (the index toward the thumb side).
      const away: Vec = finger === 'Index' ? (across.map((x) => -x) as Vec) : across;
      const sideSign = dot(cross(palmNormal, dir1), away) >= 0 ? 1 : -1;
      const sideways = clampTo(`${side}.${key}.side`, k(`${key}.side`) + spread * Math.abs(SPREAD_SHARE[finger]!));
      // The palm's arch: the ray turns about the hand's length toward the palm, so the ring and pinky come round.
      const cup = axisAngle(along, -s * k('palm.cup') * CUP_SHARE[finger]!);
      set(bone(1), mul(mul(cup, axisAngle(cross(dir1, palmNormal), joint('base', 90))), axisAngle(palmNormal, sideways * sideSign)));
      set(bone(2), axisAngle(cross(dir2, palmNormal), joint('mid', 100)));
      set(bone(3), axisAngle(cross(dir2, palmNormal), joint('tip', 70)));
    }
    // The thumb: its base turns across the palm (toward the pinky), out from the palm and about itself toward the
    // fingers (opposition); its 2nd and 3rd joints bend across the palm.
    {
      const bone = (n: number) => `${name}HandThumb${n}`;
      const dir1 = unit(sub(at(bone(2)), at(bone(1))));
      const dir2 = unit(sub(at(bone(3)), at(bone(2))));
      const joint = (part: string, fistAdd: number) => clampTo(`${side}.thumb.${part}`, k(`thumb.${part}`) + fistAdd * fist);
      const base = mul(
        mul(axisAngle(cross(dir1, across), joint('across', 40)), axisAngle(cross(dir1, palmNormal.map((x) => -x) as Vec), k('thumb.out'))),
        axisAngle(dir1, -s * joint('turn', 30)),
      );
      set(bone(1), base);
      set(bone(2), axisAngle(cross(dir2, across), joint('mid', 45)));
      set(bone(3), axisAngle(cross(dir2, across), joint('tip', 60)));
    }
    // Hip, a ball joint: the thigh's direction (forward, out to his side), then its twist.
    const legTarget = rotate(mul(axisAngle([0, 0, 1], s * k('leg.out')), axisAngle([1, 0, 0], -k('leg.forward'))), thigh);
    set(`${name}UpLeg`, mul(axisAngle(legTarget, -s * k('leg.twist')), between(thigh, legTarget)));
    set(`${name}Leg`, axisAngle([1, 0, 0], k('knee.bend')));
    set(`${name}Foot`, mul(axisAngle([1, 0, 0], k('ankle.bend')), axisAngle([0, 0, 1], -s * k('ankle.side'))));
  }
  return turns;
}

/** Each joint's turn from the A-pose (world) and where it moved to. */
function poseJoints(
  skeleton: PoseSkeleton,
  values: PaintPoseValues,
  spread = false,
): { world: Quat[]; moved: Vec[]; twists: SpreadTwist[] } {
  const twists: SpreadTwist[] = [];
  const turns = localTurns(skeleton, values, spread, twists);
  const world: Quat[] = [];
  const moved: Vec[] = [];
  skeleton.names.forEach((_, j) => {
    const parent = skeleton.parents[j]!;
    if (parent < 0) {
      world[j] = turns[j]!;
      moved[j] = skeleton.pivots[j]!;
      return;
    }
    world[j] = mul(world[parent]!, turns[j]!);
    moved[j] = add(rotate(world[parent]!, sub(skeleton.pivots[j]!, skeleton.pivots[parent]!)), moved[parent]!);
  });
  return { world, moved, twists };
}

/** Euler XYZ degrees (three.js order, as the clips store them) of a turn. */
function eulerOf(q: Quat): Vec {
  const ex = rotate(q, [1, 0, 0]);
  const ey = rotate(q, [0, 1, 0]);
  const ez = rotate(q, [0, 0, 1]);
  const deg = 180 / Math.PI;
  // Rounded to 0.01 degree as the Core's own reader does (a slider at a limit must not read 80.0001).
  const r = (x: number) => Math.round(x * deg * 100) / 100;
  const y = Math.asin(Math.max(-1, Math.min(1, ez[0])));
  if (Math.abs(ez[0]) < 0.9999999) return [r(Math.atan2(-ez[1], ez[2])), r(y), r(Math.atan2(-ey[0], ex[0]))];
  return [r(Math.atan2(ey[2], ey[1])), r(y), 0];
}

const RIG_BONES = /^(Hips|Spine|Spine1|Spine2|Neck|Head|(Left|Right)(UpLeg|Leg|Foot|ToeBase|Shoulder|Arm|ForeArm|Hand))$/;

/**
 * The pose as the clips store it (T-pose rest, world-aligned frames), for the joint law: the A-pose arm chain's own
 * turns from the T-pose under the pose's turns. Unlike `tPose` (a plain swing per bone) the upper arm is rolled so its
 * elbow hinge is the law's: with a plain swing this mesh's A-pose elbow already reads ~20 degrees "sideways" and a full
 * bend breaks the law (found 2026-10-05; the Core clips bend the elbow about the same law hinge - see HANDOFF).
 */
export function clipPose(skeleton: PoseSkeleton, values: PaintPoseValues): Pose {
  const { world } = poseJoints(skeleton, values);
  const fromT: Quat[] = [];
  skeleton.names.forEach((name, j) => {
    const parent = skeleton.parents[j]!;
    fromT[j] = parent >= 0 && /Hand./.test(name) ? fromT[parent]! : ID;
  });
  const index = (name: string) => skeleton.names.indexOf(name);
  for (const side of ['Left', 'Right'] as const) {
    const s = side === 'Left' ? 1 : -1;
    const dir = (a: string, b: string) => unit(sub(skeleton.pivots[index(`${side}${b}`)]!, skeleton.pivots[index(`${side}${a}`)]!));
    const upper = dir('Arm', 'ForeArm');
    const fore = dir('ForeArm', 'Hand');
    const hand = dir('Hand', 'HandMiddle1');
    // The upper arm from his side's x axis, rolled about itself so the law's elbow hinge (-y on his left, the T-pose
    // turn of a forward bend) is the mesh's own hinge; the forearm and hand swing on from their parent.
    const swing = between([s, 0, 0], upper);
    const lawHinge = rotate(swing, [0, -s, 0]);
    const ownHinge = unit(cross(upper, fore));
    const roll = Math.atan2(dot(cross(lawHinge, ownHinge), upper), dot(lawHinge, ownHinge));
    const arm = mul(axisAngle(upper, (roll * 180) / Math.PI), swing);
    const foreArm = mul(between(upper, fore), arm);
    const handT = mul(between(fore, hand), foreArm);
    for (const [bone, q] of [['Arm', arm], ['ForeArm', foreArm], ['Hand', handT]] as const) fromT[index(`${side}${bone}`)] = q;
    skeleton.names.forEach((name, j) => {
      if (name.startsWith(`${side}Hand`) && name !== `${side}Hand`) fromT[j] = handT;
    });
  }
  const total = world.map((q, j) => mul(q, fromT[j]!));
  const pose: Record<string, Vec> = {};
  skeleton.names.forEach((name, j) => {
    if (!RIG_BONES.test(name)) return;
    const parent = skeleton.parents[j]!;
    pose[name] = eulerOf(parent >= 0 ? mul(inverse(total[parent]!), total[j]!) : total[j]!);
  });
  return pose as Pose;
}

/**
 * What breaks the joint law in a pose (empty: a pose a body can make). One exception: the law reads the upper arm's
 * twist as the swing-twist from the T-pose, which calls arms overhead with the palms toward each other (a natural
 * pose, reached by raising the arms in front) a 176 degree twist. Here the upper arm's twist is its own slider, measured
 * from the natural roll (`ARM_POLE_DOWN`) and held to a real range (+-90), so that one law message is left out. The
 * same for the head: the law adds the neck and head Euler angles, so a head turned 90 degrees reads ~20 degrees more
 * nod than it has; here the head turns about the neck and then nods, each slider held to the neck + head budget of `HUMAN_JOINT_CONSTRAINTS`.
 */
export const poseProblems = (skeleton: PoseSkeleton, values: PaintPoseValues): string[] =>
  jointProblems(clipPose(skeleton, values)).filter((one) => !/Arm: upper arm twisted too far|^Neck\+Head:/.test(one));

/**
 * The asked slider values limited to the joint law: when they would break a joint that is fine now, the sliders stop
 * at the last pose a body can make on the way there (owner: "it must not move at random").
 */
export function limitPose(
  skeleton: PoseSkeleton,
  values: PaintPoseValues,
  asked: Readonly<Record<string, number>>,
): { values: PaintPoseValues; problems: string[] } {
  const bonesOf = (problems: string[]) => new Set(problems.map((one) => one.split(':')[0]!));
  const before = bonesOf(poseProblems(skeleton, values));
  const rest = poseRest(skeleton);
  const at = (t: number, round = false) => {
    const next: Record<string, number> = { ...values };
    for (const [key, value] of Object.entries(asked)) {
      const bare = /^[LR]\./.test(key) ? key.slice(2) : key;
      const from = poseValue(values, key, rest[bare] ?? 0);
      const to = from + (value - from) * t;
      next[key] = round ? Math.trunc(to - from) + from : to;
    }
    // The couplings between joints hold too (a finger tip with its middle joint, the hip with the knee...).
    return coupledPose(next, rest);
  };
  const breaks = (candidate: PaintPoseValues) => [...bonesOf(poseProblems(skeleton, candidate))].some((bone) => !before.has(bone));
  let candidate = at(1);
  if (breaks(candidate)) {
    let low = 0;
    let high = 1;
    for (let i = 0; i < 14; i += 1) {
      const mid = (low + high) / 2;
      if (breaks(at(mid))) high = mid;
      else low = mid;
    }
    candidate = at(low, true);
  }
  return { values: candidate, problems: poseProblems(skeleton, candidate) };
}

/**
 * The posed positions: every vertex moved by its skin weights on the posed joints (linear blend skinning with the
 * A-pose as bind pose). `skinIndex`/`skinWeight` are four per vertex.
 */
export function poseBody(
  rest: Float32Array,
  skinIndex: ArrayLike<number>,
  skinWeight: ArrayLike<number>,
  skeleton: PoseSkeleton,
  values: PaintPoseValues,
  out: Float32Array = new Float32Array(rest.length),
  /** Share of the dual quaternion result (the rest linear blend), as the game draws it. */
  dqsShare = DQS_SHARE,
  /** When given, each vertex's blended turn (x, y, z, w), for `relaxShoulders`. */
  turns?: Float32Array,
): Float32Array {
  const { world, moved, twists } = poseJoints(skeleton, values, true);
  // Each joint as a dual quaternion (real: its turn, dual: half its move times the turn): x' = R x + t.
  const duals = world.map((q, j) => {
    const t = sub(moved[j]!, rotate(q, skeleton.pivots[j]!));
    return mul([t[0] / 2, t[1] / 2, t[2] / 2, 0], q);
  });
  const count = rest.length / 3;
  for (let v = 0; v < count; v += 1) {
    const p: Vec = [rest[v * 3]!, rest[v * 3 + 1]!, rest[v * 3 + 2]!];
    const linear: Vec = [0, 0, 0];
    const real: Quat = [0, 0, 0, 0];
    const dual: Quat = [0, 0, 0, 0];
    let first: Quat | null = null;
    let total = 0;
    for (let k = 0; k < 4; k += 1) {
      const w = skinWeight[v * 4 + k]!;
      if (!w) continue;
      const j = skinIndex[v * 4 + k]!;
      const q = add(rotate(world[j]!, sub(p, skeleton.pivots[j]!)), moved[j]!);
      for (let c = 0; c < 3; c += 1) linear[c] = linear[c]! + q[c]! * w;
      // The shortest way round: every turn on the same side as the first.
      first ??= world[j]!;
      const sign = first[0] * world[j]![0] + first[1] * world[j]![1] + first[2] * world[j]![2] + first[3] * world[j]![3] < 0 ? -w : w;
      for (let c = 0; c < 4; c += 1) {
        real[c] = real[c]! + world[j]![c]! * sign;
        dual[c] = dual[c]! + duals[j]![c]! * sign;
      }
      total += w;
    }
    if (!total) {
      out.set(p, v * 3);
      turns?.set(ID, v * 4);
      continue;
    }
    const n = Math.hypot(...real) || 1;
    const r = real.map((x) => x / n) as Quat;
    turns?.set(r, v * 4);
    const d = dual.map((x) => x / n) as Quat;
    const t = mul(d, [-r[0], -r[1], -r[2], r[3]]);
    const dq = add(rotate(r, p), [t[0] * 2, t[1] * 2, t[2] * 2]);
    for (let c = 0; c < 3; c += 1) out[v * 3 + c] = (linear[c]! / total) * (1 - dqsShare) + dq[c]! * dqsShare;
    // The palm turn spread along the forearm (the radius): this vertex's share of it, by how far down the bone it sits
    // and how much the bone holds it, about the posed bone's own line.
    for (const twist of twists) {
      let w = 0;
      for (let k = 0; k < 4; k += 1) if (skinIndex[v * 4 + k] === twist.bone) w += skinWeight[v * 4 + k]!;
      if (!w || !twist.angle) continue;
      const along = dot(sub(p, skeleton.pivots[twist.bone]!), twist.axis) / dot(twist.axis, twist.axis);
      const share = Math.max(0, Math.min(1, along)) * (w / total);
      if (share < 1e-4) continue;
      const pivot = moved[twist.bone]!;
      const axis = rotate(world[twist.bone]!, twist.axis);
      const here: Vec = [out[v * 3]! - pivot[0], out[v * 3 + 1]! - pivot[1], out[v * 3 + 2]! - pivot[2]];
      out.set(add(rotate(axisAngle(axis, twist.angle * share), here), pivot), v * 3);
      if (turns) {
        const r: Quat = [turns[v * 4]!, turns[v * 4 + 1]!, turns[v * 4 + 2]!, turns[v * 4 + 3]!];
        turns.set(mul(axisAngle(axis, twist.angle * share), r), v * 4);
      }
    }
  }
  return out;
}

/** The shoulder area the correctives may move: full within the first distance of the shoulder joint, none past the second. */
export const SHOULDER_RELAX = { near: 0.09, far: 0.17, iterations: 60 } as const;

/** Each vertex's neighbours over the skin (triangles whose corners are all skin, region < 2). */
export function skinNeighbours(triangles: ArrayLike<number>, region: ArrayLike<number>, count: number): Uint32Array[] {
  const sets = Array.from({ length: count }, () => new Set<number>());
  for (let t = 0; t < triangles.length; t += 3) {
    const corners = [triangles[t]!, triangles[t + 1]!, triangles[t + 2]!];
    if (corners.some((v) => region[v]! >= 2)) continue;
    for (let k = 0; k < 3; k += 1) {
      sets[corners[k]!]!.add(corners[(k + 1) % 3]!);
      sets[corners[(k + 1) % 3]!]!.add(corners[k]!);
    }
  }
  return sets.map((one) => Uint32Array.from(one));
}

/**
 * Pose correctives for the shoulders (owner, 2026-10-05: "the shoulder twists like a spiral when the arm goes up"; review:
 * "bones + weights + muscle morphs + pose corrective morphs"). Skinning alone turns the upper arm up to ~170 degrees
 * against a shoulder whose skin is half on the trunk, so the deltoid and armpit pinch and spiral. Here the shoulder
 * and armpit skin is solved again so every vertex keeps its rest relation to its neighbours (its Laplacian detail,
 * turned with its own skin turn) while the skin outside the area stays where the bones put it: the twist spreads
 * out, the deltoid and armpit keep their volume, nothing collapses into the joint. The area's strength grows with how
 * far that arm left the A-pose, so the A-pose itself never changes. Done in place on `posed`.
 */
export function relaxShoulders(
  rest: Float32Array,
  posed: Float32Array,
  turns: Float32Array,
  neighbours: readonly Uint32Array[],
  skeleton: PoseSkeleton,
  values: PaintPoseValues,
): void {
  const count = rest.length / 3;
  const { world } = poseJoints(skeleton, values);
  const strength = new Float32Array(count);
  for (const side of ['Left', 'Right']) {
    const j = skeleton.names.indexOf(`${side}Arm`);
    // How far the upper arm turned from the A-pose (degrees), as a 0..1 share (full at 60 degrees).
    const q = world[j]!;
    const turned = (2 * Math.acos(Math.min(1, Math.abs(q[3]))) * 180) / Math.PI;
    const share = Math.min(1, turned / 60);
    if (share < 0.01) continue;
    const at = skeleton.pivots[j]!;
    for (let v = 0; v < count; v += 1) {
      if (!neighbours[v]!.length) continue;
      const d = Math.hypot(rest[v * 3]! - at[0], rest[v * 3 + 1]! - at[1], rest[v * 3 + 2]! - at[2]);
      const k = Math.max(0, Math.min(1, (SHOULDER_RELAX.far - d) / (SHOULDER_RELAX.far - SHOULDER_RELAX.near)));
      strength[v] = Math.max(strength[v]!, share * k * k * (3 - 2 * k));
    }
  }
  const area: number[] = [];
  for (let v = 0; v < count; v += 1) if (strength[v]! > 0.001) area.push(v);
  if (!area.length) return;
  // Each area vertex's rest detail (rest position minus its neighbours' mean), turned with its own skin turn.
  const detail = new Float32Array(count * 3);
  for (const v of area) {
    const list = neighbours[v]!;
    const mean: Vec = [0, 0, 0];
    for (const u of list) for (let c = 0; c < 3; c += 1) mean[c] = mean[c]! + rest[u * 3 + c]! / list.length;
    const r: Quat = [turns[v * 4]!, turns[v * 4 + 1]!, turns[v * 4 + 2]!, turns[v * 4 + 3]!];
    detail.set(rotate(r, [rest[v * 3]! - mean[0], rest[v * 3 + 1]! - mean[1], rest[v * 3 + 2]! - mean[2]]), v * 3);
  }
  const skinned = Float32Array.from(posed);
  const next = new Float32Array(area.length * 3);
  for (let pass = 0; pass < SHOULDER_RELAX.iterations; pass += 1) {
    area.forEach((v, i) => {
      const list = neighbours[v]!;
      for (let c = 0; c < 3; c += 1) {
        let mean = 0;
        for (const u of list) mean += posed[u * 3 + c]!;
        const solved = mean / list.length + detail[v * 3 + c]!;
        // The area's edge keeps to the skinned skin; its middle follows the solve.
        next[i * 3 + c] = skinned[v * 3 + c]! + (solved - skinned[v * 3 + c]!) * strength[v]!;
      }
    });
    area.forEach((v, i) => posed.set(next.subarray(i * 3, i * 3 + 3), v * 3));
  }
}
