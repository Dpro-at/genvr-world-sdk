import { LAB_POSE_FPS, type LabLimb, type LabMadeMotion, type LabPoseRow } from '@genvr/contracts';
import { findBody } from '@genvr/core-library';
import { POSE_CONTROLS, clipPose, limitPose, poseProblems, type PoseSkeleton } from '../character/human/paint-pose.js';

/**
 * Motions made by pose and key frames in the motion lab (board M11). A pose is the Avatar pose panel's slider values
 * (`POSE_CONTROLS`: every joint by its own anatomical controls, fingers included, inside the joint law) plus where the
 * hips are (`root.*`, metres). Here: the frames between keys, the clip rotations a pose gives (the same rotations the Core
 * moves use, so it plays on every body), where the joints are, a two-bone reach for a hand or foot, pins and mirroring.
 * Pure: the controller, the `motion_lab` tool and the tests share it; the Lab's stage only draws the result.
 */
type V3 = [number, number, number];
type Q = [number, number, number, number];
export type LabPose = Record<string, number>;
export type LabPoseSide = 'both' | 'L' | 'R';

export interface LabPoseControl {
  key: string;
  label: string;
  group: string;
  min: number;
  max: number;
  sided: boolean;
  /** Degrees unless said. */
  unit?: '%' | 'm';
}

/** Where the hips are, against standing on the floor (metres): a crouch lowers them, a pinned foot moves them. */
export const LAB_ROOT_CONTROLS: readonly LabPoseControl[] = [
  { key: 'root.y', label: 'Hips up (+) / down', group: 'Hips', min: -0.9, max: 0.3, sided: false, unit: 'm' },
  { key: 'root.z', label: 'Hips forward (+) / back', group: 'Hips', min: -1, max: 1, sided: false, unit: 'm' },
  { key: 'root.x', label: 'Hips to his left (+) / right', group: 'Hips', min: -1, max: 1, sided: false, unit: 'm' },
];
export const LAB_POSE_CONTROLS: readonly LabPoseControl[] = [...POSE_CONTROLS, ...LAB_ROOT_CONTROLS];
/** The joint picker (board M11): the Avatar pose panel's headings, with the hips under Body. */
export const LAB_POSE_SECTIONS: ReadonlyArray<readonly [title: string, groups: readonly string[]]> = [
  ['Body', ['Hips', 'Head', 'Spine']],
  ['Arm', ['Shoulder', 'Elbow', 'Wrist']],
  ['Hand and fingers', ['Palm', 'Thumb', 'Index', 'Middle', 'Ring', 'Pinky']],
  ['Leg', ['Hip', 'Knee', 'Ankle']],
];
export const LAB_ROW_NAMES: Record<LabPoseRow, string> = { body: 'Body', right_arm: 'Right arm', right_hand: 'Right hand', left_arm: 'Left arm', left_hand: 'Left hand', legs: 'Legs' };

const bare = (key: string) => (/^[LR]\./.test(key) ? key.slice(2) : key);
const sideOf = (key: string): 'L' | 'R' | null => (/^[LR]\./.test(key) ? (key[0] as 'L' | 'R') : null);
export function labPoseControl(key: string): LabPoseControl | undefined {
  const control = LAB_POSE_CONTROLS.find((c) => c.key === bare(key));
  return control && control.sided === Boolean(sideOf(key)) ? control : undefined;
}
/** Every slider key of a pose (`head.nod`, `L.arm.up`, `R.arm.up`, …, `root.y`). */
export const LAB_POSE_KEYS: readonly string[] = LAB_POSE_CONTROLS.flatMap((c) => (c.sided ? [`L.${c.key}`, `R.${c.key}`] : [c.key]));

const GROUP_ROW: Record<string, 'body' | 'arm' | 'hand' | 'legs'> = {
  Hips: 'body', Head: 'body', Spine: 'body', Shoulder: 'arm', Elbow: 'arm', Wrist: 'arm',
  Palm: 'hand', Thumb: 'hand', Index: 'hand', Middle: 'hand', Ring: 'hand', Pinky: 'hand', Hip: 'legs', Knee: 'legs', Ankle: 'legs',
};
/** The key track row a slider belongs to. */
export function labPoseRow(key: string): LabPoseRow {
  const control = labPoseControl(key);
  if (!control) throw new Error(`"${key}" is not a pose slider.`);
  const kind = GROUP_ROW[control.group]!;
  if (kind === 'body' || kind === 'legs') return kind;
  return `${sideOf(key) === 'R' ? 'right' : 'left'}_${kind}` as LabPoseRow;
}
/** The rows a joint group covers on the chosen side (what Key keys in the Lab). */
export function labRowsOf(group: string, side: LabPoseSide): LabPoseRow[] {
  const kind = GROUP_ROW[group];
  if (!kind) throw new Error(`No joint group "${group}".`);
  if (kind === 'body' || kind === 'legs') return [kind];
  return side === 'both' ? [`right_${kind}`, `left_${kind}`] as LabPoseRow[] : [`${side === 'R' ? 'right' : 'left'}_${kind}` as LabPoseRow];
}
export const labRowKeys = (row: LabPoseRow) => LAB_POSE_KEYS.filter((key) => labPoseRow(key) === row);

/** One slider inside its own range. */
export function labClamp(key: string, value: number): number {
  const control = labPoseControl(key);
  if (!control) throw new Error(`"${key}" is not a pose slider. Ask pose_get for the names.`);
  return Math.max(control.min, Math.min(control.max, value));
}

/** Standing with the arms down and a relaxed hand; every slider named. */
export function labStandPose(): LabPose {
  const pose: LabPose = Object.fromEntries(LAB_POSE_KEYS.map((key) => [key, 0]));
  for (const side of ['L', 'R']) Object.assign(pose, { [`${side}.arm.up`]: 8, [`${side}.arm.forward`]: 10, [`${side}.elbow.bend`]: 12, [`${side}.hand.fist`]: 30 });
  return pose;
}
export function labTPose(): LabPose {
  const pose: LabPose = Object.fromEntries(LAB_POSE_KEYS.map((key) => [key, 0]));
  for (const side of ['L', 'R']) pose[`${side}.arm.up`] = 90;
  return pose;
}

// ---- small rotation helpers (Euler XYZ degrees as the clips store them)
const RAD = Math.PI / 180;
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mul = (a: Q, b: Q): Q => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const axis = (v: V3, degrees: number): Q => {
  const n = len(v) || 1, s = Math.sin((degrees * RAD) / 2);
  return [(v[0] / n) * s, (v[1] / n) * s, (v[2] / n) * s, Math.cos((degrees * RAD) / 2)];
};
const rotate = (q: Q, v: V3): V3 => {
  const u: V3 = [q[0], q[1], q[2]];
  const t = cross(u, v).map((x) => x * 2) as V3;
  return add(add(v, t.map((x) => x * q[3]) as V3), cross(u, t));
};
const euler = ([x, y, z]: readonly number[]): Q => mul(mul(axis([1, 0, 0], x!), axis([0, 1, 0], y!)), axis([0, 0, 1], z!));

// ---- the lab body: the Standard robot's joints (T-pose), and an A-pose of it for the pose math
interface Joint { name: string; parent: string | null; at: V3 }
let restJoints: Joint[] | null = null;
/** The robot's joints at rest (T-pose, metres, parents first). */
function joints(): Joint[] {
  if (restJoints) return restJoints;
  const list = findBody('robot').joints.map((j) => ({ name: j.name, parent: j.parent, at: [...j.at] as V3 }));
  const done = new Set<string>(), out: Joint[] = [];
  while (out.length < list.length) for (const j of list) if (!done.has(j.name) && (!j.parent || done.has(j.parent))) { out.push(j); done.add(j.name); }
  restJoints = out;
  return out;
}
let skeleton: PoseSkeleton | null = null;
/**
 * The pose math's skeleton: the robot with its arms lowered 45° and the elbows bent 15° forward, the way the pose
 * panel's body stands (its elbow hinge must be known from the rest pose: a straight T-pose arm has none).
 */
export function labPoseSkeleton(): PoseSkeleton {
  if (skeleton) return skeleton;
  const list = joints();
  const names = list.map((j) => j.name);
  const pivots = list.map((j) => [...j.at] as V3);
  const under = (root: string) => names.filter((name) => { for (let n: string | null = name; n; n = list[names.indexOf(n)]!.parent) if (n === root) return true; return false; });
  for (const [side, s] of [['Left', 1], ['Right', -1]] as const) {
    const shoulder = pivots[names.indexOf(`${side}Arm`)]!;
    const lower = axis([0, 0, 1], -s * 45);
    for (const name of under(`${side}Arm`)) { const i = names.indexOf(name); pivots[i] = add(shoulder, rotate(lower, sub(pivots[i]!, shoulder))); }
    const elbow = pivots[names.indexOf(`${side}ForeArm`)]!;
    const bend = axis(rotate(lower, [0, -s, 0]), 15);
    for (const name of under(`${side}Hand`)) { const i = names.indexOf(name); pivots[i] = add(elbow, rotate(bend, sub(pivots[i]!, elbow))); }
  }
  skeleton = { names, parents: list.map((j) => (j.parent ? names.indexOf(j.parent) : -1)), pivots };
  return skeleton;
}

const ALL_BONES = /^(Hips|Spine\d?|Neck|Head|(Left|Right)(UpLeg|Leg|Foot|ToeBase|Shoulder|Arm|ForeArm|Hand\w*))$/;
/** A pose as clip rotations (Euler XYZ degrees per bone, T-pose rest, fingers too) and where the hips are (m). */
export function labClipPose(pose: LabPose): { bones: Record<string, V3>; root: V3 } {
  const bones = clipPose(labPoseSkeleton(), pose, ALL_BONES) as unknown as Record<string, V3>;
  return { bones, root: [pose['root.x'] ?? 0, pose['root.y'] ?? 0, pose['root.z'] ?? 0] };
}

/** Where every joint of the lab robot is in this pose (metres; x his left, y up, z his front; feet on the floor at 0). */
export function labJointPositions(pose: LabPose): Map<string, V3> {
  const { bones, root } = labClipPose(pose);
  const world = new Map<string, Q>(), at = new Map<string, V3>();
  for (const j of joints()) {
    const q = euler(bones[j.name] ?? [0, 0, 0]);
    if (!j.parent) { world.set(j.name, q); at.set(j.name, add(j.at, root)); continue; }
    const parent = joints().find((p) => p.name === j.parent)!;
    at.set(j.name, add(at.get(j.parent)!, rotate(world.get(j.parent)!, sub(j.at, parent.at))));
    world.set(j.name, mul(world.get(j.parent)!, q));
  }
  return at;
}
const LIMB_END: Record<LabLimb, string> = { left_hand: 'LeftHand', right_hand: 'RightHand', left_foot: 'LeftFoot', right_foot: 'RightFoot' };
/** Where the wrists and ankles are. */
export function labLimbPositions(pose: LabPose): Record<LabLimb, V3> {
  const at = labJointPositions(pose);
  return Object.fromEntries(Object.entries(LIMB_END).map(([limb, joint]) => [limb, at.get(joint)!.map(round3) as V3])) as Record<LabLimb, V3>;
}

/** What breaks the joint law in a pose (empty: a pose a body can make). */
export const labPoseProblems = (pose: LabPose) => poseProblems(labPoseSkeleton(), pose);

/**
 * Asked slider values, each inside its range and all inside the joint law: a slider stops at the last pose a body can
 * make on the way there (the Avatar pose panel's rule). `stopped`: the asked sliders that did not get their value.
 */
export function labPoseLimit(pose: LabPose, asked: Readonly<Record<string, number>>): { pose: LabPose; stopped: string[]; problems: string[] } {
  const clamped = Object.fromEntries(Object.entries(asked).map(([k, v]) => [k, labClamp(k, v)]));
  const joints = Object.fromEntries(Object.entries(clamped).filter(([k]) => !k.startsWith('root.')));
  const result = Object.keys(joints).length ? limitPose(labPoseSkeleton(), pose, joints) : { values: pose, problems: labPoseProblems(pose) };
  const next: LabPose = { ...pose, ...result.values };
  for (const [k, v] of Object.entries(clamped)) if (k.startsWith('root.')) next[k] = v;
  for (const k of Object.keys(next)) next[k] = round2(next[k]!);
  const stopped = Object.entries(asked).filter(([k, v]) => Math.abs((next[k] ?? 0) - v) > 0.5 * (k.startsWith('root.') ? 0.01 : 1)).map(([k]) => k);
  return { pose: next, stopped, problems: labPoseProblems(next) };
}

// ---- keys and the frames between them
type Keyed = Pick<LabMadeMotion, 'frames' | 'loop' | 'keys' | 'draft'>;
/** The rows a key holds. */
export function labKeyRows(values: Readonly<Record<string, number>>): LabPoseRow[] {
  const rows = new Set(Object.keys(values).map(labPoseRow));
  return (['body', 'right_arm', 'right_hand', 'left_arm', 'left_hand', 'legs'] as const).filter((row) => rows.has(row));
}
/**
 * The pose on a frame: each slider from the key before it that holds the slider to the key after it (linear, smooth or
 * hold by the key before); a loop runs from the last key back into the first. Sliders no key holds stand as in
 * `labStandPose`. The draft (changes not keyed yet) shows on its own frame.
 */
export function labPoseAt(motion: Keyed, frame: number, draft = true): LabPose {
  const f = Math.max(0, Math.min(motion.frames - 1, Math.round(frame)));
  const pose = labStandPose();
  const keys = [...motion.keys].sort((a, b) => a.frame - b.frame);
  for (const key of LAB_POSE_KEYS) {
    const list = keys.filter((k) => key in k.values);
    if (!list.length) continue;
    let prev = [...list].reverse().find((k) => k.frame <= f), next = list.find((k) => k.frame > f);
    let prevFrame = prev?.frame ?? 0, nextFrame = next?.frame ?? 0;
    if (motion.loop && list.length > 1) {
      if (!prev) { prev = list.at(-1)!; prevFrame = prev.frame - motion.frames; }
      if (!next) { next = list[0]!; nextFrame = next.frame + motion.frames; }
    }
    if (!prev) { pose[key] = next!.values[key]!; continue; }
    if (!next || prev === next && list.length === 1 || prev.ease === 'hold') { pose[key] = prev.values[key]!; continue; }
    const p = (f - prevFrame) / Math.max(1, nextFrame - prevFrame);
    const e = prev.ease === 'smooth' ? p * p * (3 - 2 * p) : p;
    pose[key] = round2(prev.values[key]! + (next.values[key]! - prev.values[key]!) * e);
  }
  if (draft && motion.draft && motion.draft.frame === f) Object.assign(pose, motion.draft.values);
  return pose;
}

/** The asked sliders for one control on a side (`both`, his left `L`, his right `R`). */
export function labAsk(joint: string, side: LabPoseSide, value: number): Record<string, number> {
  const control = LAB_POSE_CONTROLS.find((c) => c.key === bare(joint));
  if (!control) throw new Error(`"${joint}" is not a pose slider. Ask pose_get for the names.`);
  if (!control.sided) return { [control.key]: value };
  const fixed = sideOf(joint);
  const sides = fixed ? [fixed] : side === 'both' ? ['L', 'R'] : [side];
  return Object.fromEntries(sides.map((s) => [`${s}.${control.key}`, value]));
}

// ---- reach: move a hand or foot and the limb follows (two bones)
const CHAINS = {
  hand: { sliders: ['arm.up', 'arm.forward', 'elbow.bend'], top: 'Arm', mid: 'ForeArm', end: 'Hand' },
  foot: { sliders: ['leg.forward', 'leg.out', 'knee.bend'], top: 'UpLeg', mid: 'Leg', end: 'Foot' },
} as const;
export const labLimbSliders = (limb: LabLimb) => CHAINS[limb.endsWith('hand') ? 'hand' : 'foot'].sliders.map((k) => `${limb.startsWith('left') ? 'L' : 'R'}.${k}`);

/**
 * Moves a wrist or ankle toward a point (metres, body space) and the arm or leg follows: the elbow or knee bend comes
 * from the distance (two bones), then the limb's swing is searched so the end lands on the point, and the result is held
 * to the joint law. `miss_cm`: how far the end stayed from the point (out of reach, or stopped by the law).
 */
export function labLimbMove(pose: LabPose, limb: LabLimb, target: V3, quick = false): { pose: LabPose; reached: V3; miss_cm: number; stopped: boolean } {
  const chain = CHAINS[limb.endsWith('hand') ? 'hand' : 'foot'];
  const Side = limb.startsWith('left') ? 'Left' : 'Right';
  const keys = labLimbSliders(limb);
  const rest = new Map(joints().map((j) => [j.name, j.at]));
  const a = len(sub(rest.get(`${Side}${chain.mid}`)!, rest.get(`${Side}${chain.top}`)!));
  const b = len(sub(rest.get(`${Side}${chain.end}`)!, rest.get(`${Side}${chain.mid}`)!));
  const ranges = keys.map((k) => labPoseControl(k)!);
  const with3 = (p: readonly number[]): LabPose => ({ ...pose, ...Object.fromEntries(keys.map((k, i) => [k, Math.max(ranges[i]!.min, Math.min(ranges[i]!.max, p[i]!))])) });
  const miss = (p: readonly number[]) => len(sub(labJointPositions(with3(p)).get(`${Side}${chain.end}`)!, target));
  const top = labJointPositions(pose).get(`${Side}${chain.top}`)!;
  const d = Math.max(Math.abs(a - b) + 1e-3, Math.min(a + b - 1e-3, len(sub(target, top))));
  const bend = 180 - Math.acos(Math.max(-1, Math.min(1, (a * a + b * b - d * d) / (2 * a * b)))) / RAD;
  let best = [pose[keys[0]!] ?? 0, pose[keys[1]!] ?? 0, bend];
  let error = miss(best);
  if (!quick) {
    // A coarse look over the whole swing first, so a far target is not missed from a poor start.
    for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
      const p = [ranges[0]!.min + ((ranges[0]!.max - ranges[0]!.min) * i) / 10, ranges[1]!.min + ((ranges[1]!.max - ranges[1]!.min) * j) / 10, bend];
      const e = miss(p);
      if (e < error) { error = e; best = p; }
    }
  }
  for (let step = quick ? 8 : 12; step > 0.2; ) {
    let moved = false;
    for (let dim = 0; dim < 3; dim++) for (const sign of [1, -1]) {
      const p = [...best]; p[dim]! += sign * step;
      const e = miss(p);
      if (e < error - 1e-5) { error = e; best = p; moved = true; }
    }
    if (!moved) step /= 2;
  }
  const limited = labPoseLimit(pose, Object.fromEntries(keys.map((k, i) => [k, round2(best[i]!)])));
  const reached = labJointPositions(limited.pose).get(`${Side}${chain.end}`)!;
  return { pose: limited.pose, reached: reached.map(round3) as V3, miss_cm: Math.round(len(sub(reached, target)) * 1000) / 10, stopped: limited.stopped.length > 0 };
}

/**
 * Pinned hands and feet stay where they were before a change: the hips move so the first pinned foot stays put (unless
 * the change was the hips themselves), and every other pinned limb reaches back to its place (unless the change was that
 * limb's own joints).
 */
export function labHoldPins(before: LabPose, after: LabPose, pins: readonly LabLimb[], asked: readonly string[]): LabPose {
  if (!pins.length) return after;
  const was = labLimbPositions(before);
  let next: LabPose = { ...after };
  const anchor = pins.find((p) => p.endsWith('foot'));
  if (anchor && !asked.some((k) => k.startsWith('root.'))) {
    const now = labLimbPositions(next)[anchor];
    for (const [i, k] of (['root.x', 'root.y', 'root.z'] as const).entries()) next[k] = round3(labClamp(k, (next[k] ?? 0) + was[anchor][i]! - now[i]!));
  }
  for (const limb of pins) {
    if (limb === anchor && !asked.some((k) => k.startsWith('root.'))) continue;
    if (asked.some((k) => labLimbSliders(limb).includes(k))) continue;
    if (len(sub(labLimbPositions(next)[limb], was[limb])) < 0.005) continue;
    next = labLimbMove(next, limb, was[limb], true).pose;
  }
  return next;
}

/** Sliders whose sign is his left or right: a mirror turns them the other way. */
const MIRROR_TURN = new Set(['head.turn', 'head.tilt', 'spine.turn', 'spine.side', 'root.x']);
/** His left and right swapped, or one side copied onto the other. */
export function labMirror(pose: LabPose, mode: 'swap' | 'left_to_right' | 'right_to_left' = 'swap'): LabPose {
  const out: LabPose = { ...pose };
  for (const key of LAB_POSE_KEYS) {
    const side = sideOf(key);
    if (!side) { if (mode === 'swap' && MIRROR_TURN.has(key)) out[key] = -(pose[key] ?? 0) || 0; continue; }
    const other = `${side === 'L' ? 'R' : 'L'}.${bare(key)}`;
    if (mode === 'swap' || (mode === 'left_to_right' && side === 'R') || (mode === 'right_to_left' && side === 'L')) {
      if (other in pose) out[key] = pose[other]!; else delete out[key];
    }
  }
  return out;
}

/**
 * A made motion's natural pace, measured from its feet: the foot lower to the floor is the planted one, and how fast it
 * moves back under the body is the walking speed (0 when the motion does not travel); stride = ground covered per step.
 */
export function labMadeMotionPace(motion: Keyed): { speed: number; stride: number } {
  const step = Math.max(1, Math.ceil(motion.frames / 240));
  let back = 0, switches = 0, last: 'L' | 'R' | null = null, prev: Record<LabLimb, V3> | null = null;
  for (let f = 0; f <= motion.frames; f += step) {
    const feet = labLimbPositions(labPoseAt(motion, motion.loop ? f % motion.frames : Math.min(f, motion.frames - 1), false));
    const planted = feet.left_foot[1] <= feet.right_foot[1] ? 'L' : 'R';
    if (prev && planted === last) {
      const foot = planted === 'L' ? 'left_foot' : 'right_foot';
      back += Math.max(0, prev[foot][2] - feet[foot][2]);
    }
    if (last && planted !== last) switches++;
    last = planted; prev = feet;
  }
  const seconds = motion.frames / LAB_POSE_FPS;
  const speed = back / seconds;
  return { speed: Math.round(speed * 100) / 100, stride: Math.round((back / Math.max(1, switches)) * 100) / 100 };
}

function round2(n: number) { return Math.round(n * 100) / 100; }
function round3(n: number) { return Math.round(n * 1000) / 1000; }
