import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { decodeHuman } from '../../../src/character/human/format.js';
import { HUMAN_PRESETS, fitJoints, generateHuman, mixHuman } from '../../../src/character/human/generate.js';
import { POSE_CONTROLS, clipPose, coupledPose, limitPose, poseRest, poseBody, poseProblems, poseValue, restElbowBend, type PoseSkeleton } from '../../../src/character/human/paint-pose.js';

const bytes = readFileSync(fileURLToPath(new URL('../../../../../apps/web/public/human/human-base.bin', import.meta.url)));
const data = decodeHuman(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const body = generateHuman(data, 'anime', 'boy')!;
const mixed = mixHuman(data, HUMAN_PRESETS['anime:boy']!);
const floor = mixed[1]! - body.positions[1]!;
const fitted = new Map(fitJoints(data, mixed).map((j) => [j.name, [j.at[0], j.at[1] - floor, j.at[2]] as [number, number, number]]));
const names = body.joints.map((j) => j.name);
const skeleton: PoseSkeleton = {
  names,
  parents: body.joints.map((j) => (j.parent ? names.indexOf(j.parent) : -1)),
  pivots: names.map((name) => fitted.get(name)!),
};
const pose = (values: Record<string, number>) => poseBody(body.positions, body.skinIndex, body.skinWeight, skeleton, values);
const moved = (a: Float32Array, v: number) =>
  Math.hypot(a[v * 3]! - body.positions[v * 3]!, a[v * 3 + 1]! - body.positions[v * 3 + 1]!, a[v * 3 + 2]! - body.positions[v * 3 + 2]!);
const lead = (v: number) => names[body.skinIndex[v * 4]!]!;

it('the empty pose is the A-pose body', () => {
  const out = pose({});
  let worst = 0;
  for (let v = 0; v < body.positions.length / 3; v += 1) worst = Math.max(worst, moved(out, v));
  expect(worst).toBeLessThan(1e-5);
});

it('every slider stays inside the joint law', () => {
  for (const control of POSE_CONTROLS) {
    expect(poseValue({ [control.key]: 999 }, control.key)).toBe(control.max);
    expect(poseValue({ [`L.${control.key}`]: -999 }, `L.${control.key}`)).toBe(control.min);
  }
  expect(restElbowBend(skeleton)).toBeGreaterThan(5);
});

it('a nod moves the head, never the feet; raising his left arm leaves the right arm', () => {
  const nod = pose({ 'head.nod': 40 });
  const raise = pose({ 'L.arm.up': 130 });
  let head = 0;
  let feet = 0;
  let left = 0;
  let right = 0;
  for (let v = 0; v < body.positions.length / 3; v += 1) {
    const name = lead(v);
    if (name === 'Head') head = Math.max(head, moved(nod, v));
    if (/Foot|ToeBase/.test(name)) feet = Math.max(feet, moved(nod, v));
    if (name === 'LeftHand') left = Math.max(left, moved(raise, v));
    if (name === 'RightHand') right = Math.max(right, moved(raise, v));
  }
  expect(head).toBeGreaterThan(0.05);
  expect(feet).toBe(0);
  expect(left).toBeGreaterThan(0.3);
  expect(right).toBe(0);
});

it('the shoulder does not pinch with the arm up (owner: it broke)', () => {
  const shoulder = skeleton.pivots[names.indexOf('LeftArm')]!;
  const elbow = skeleton.pivots[names.indexOf('LeftForeArm')]!;
  const along = [0, 1, 2].map((k) => elbow[k]! - shoulder[k]!);
  // A ring of the upper arm near the shoulder (15-30 % of the way to the elbow, A-pose).
  const ring: number[] = [];
  for (let v = 0; v < body.positions.length / 3; v += 1) {
    const r = [0, 1, 2].map((k) => body.positions[v * 3 + k]! - shoulder[k]!);
    const t = (r[0]! * along[0]! + r[1]! * along[1]! + r[2]! * along[2]!) / (along[0]! ** 2 + along[1]! ** 2 + along[2]! ** 2);
    if (lead(v) === 'LeftArm' && t >= 0.15 && t <= 0.3) ring.push(v);
  }
  // Its mean radius about its own centre (the ring takes in the armpit skin, which stretches as the arm goes up, so
  // it grows a little; a pinch shows as a drop).
  const radius = (positions: Float32Array) => {
    const c = [0, 1, 2].map((k) => ring.reduce((s, v) => s + positions[v * 3 + k]!, 0) / ring.length);
    return ring.reduce((s, v) => s + Math.hypot(...[0, 1, 2].map((k) => positions[v * 3 + k]! - c[k]!)), 0) / ring.length;
  };
  const rest = radius(body.positions);
  for (const raise of [100, 150, 175]) {
    const values = { 'L.arm.up': raise };
    const ratio = radius(pose(values)) / rest;
    const linear = radius(poseBody(body.positions, body.skinIndex, body.skinWeight, skeleton, values, undefined, 0)) / rest;
    if (process.env.DEFORM_REPORT) console.log(`arm raise ${raise}: shoulder ${ratio.toFixed(2)} (linear blend ${linear.toFixed(2)})`);
    expect(ratio).toBeGreaterThanOrEqual(linear - 0.01);
    expect(ratio).toBeGreaterThan(0.95);
    expect(ratio).toBeLessThan(1.3);
  }
});

it('the A-pose and full ranges pass the joint law; the elbow law hinge is the mesh hinge', () => {
  expect(poseProblems(skeleton, {})).toEqual([]);
  // The A-pose forearm is a pure bend about the law's hinge (-y on his left), no sideways part.
  const fore = clipPose(skeleton, {}).LeftForeArm!;
  expect(Math.abs(fore[0])).toBeLessThan(0.5);
  expect(Math.abs(fore[2])).toBeLessThan(0.5);
  for (const values of [{ 'L.arm.up': 180 }, { 'L.elbow.bend': 155 }, { 'L.elbow.bend': 0 }, { 'L.knee.bend': 155 }, { 'R.arm.up': 90, 'R.arm.forward': 90 }])
    expect(poseProblems(skeleton, values)).toEqual([]);
});

it('a slider stops at the last pose the joint law allows', () => {
  expect(poseProblems(skeleton, { 'head.nod': 80, 'head.turn': 0 })).toEqual([]);
  const limited = limitPose(skeleton, { 'head.nod': 60 }, { 'head.nod': 80, 'L.elbow.twist': 80 });
  expect(limited.problems).toEqual([]);
  const twist = limitPose(skeleton, {}, { 'L.elbow.twist': 80 });
  expect(twist.problems).toEqual([]);
  expect(twist.values['L.elbow.twist']).toBeLessThanOrEqual(80);
});

it('overhead, the palms face his midline, not outward (stable pole)', () => {
  // The hand's own frame: from the wrist to the middle finger, and across the knuckles index -> pinky.
  const at = (positions: Float32Array, name: string) => {
    const j = names.indexOf(name);
    let x = 0, y = 0, z = 0, n = 0;
    for (let v = 0; v < positions.length / 3; v += 1)
      if (body.skinIndex[v * 4] === j && body.skinWeight[v * 4]! > 0.8) {
        x += positions[v * 3]!; y += positions[v * 3 + 1]!; z += positions[v * 3 + 2]!; n += 1;
      }
    return [x / n, y / n, z / n];
  };
  const up = pose({ 'L.arm.up': 180, 'L.elbow.bend': 0 });
  const index = at(up, 'LeftHandIndex1');
  const pinky = at(up, 'LeftHandPinky1');
  // Overhead with the palm toward his head the knuckle line runs front-back; turned outward it would run across.
  const across = Math.abs(index[0]! - pinky[0]!);
  const frontBack = Math.abs(index[2]! - pinky[2]!);
  expect(frontBack).toBeGreaterThan(across);
});

it('the shoulder correctives leave the A-pose alone and smooth the raised shoulder', async () => {
  const { relaxShoulders, skinNeighbours } = await import('../../../src/character/human/paint-pose.js');
  const neighbours = skinNeighbours(body.triangles, body.region, body.positions.length / 3);
  const turns = new Float32Array((body.positions.length / 3) * 4);
  const still = poseBody(body.positions, body.skinIndex, body.skinWeight, skeleton, {}, undefined, undefined, turns);
  relaxShoulders(body.positions, still, turns, neighbours, skeleton, {});
  let worst = 0;
  for (let v = 0; v < body.positions.length / 3; v += 1) worst = Math.max(worst, moved(still, v));
  expect(worst).toBeLessThan(1e-5);
  // Raised: the most stretched skin edge round the shoulder gets shorter.
  const values = { 'L.arm.up': 150 };
  const raw = poseBody(body.positions, body.skinIndex, body.skinWeight, skeleton, values, undefined, undefined, turns);
  const fixed = Float32Array.from(raw);
  relaxShoulders(body.positions, fixed, turns, neighbours, skeleton, values);
  const stretch = (positions: Float32Array) => {
    let most = 0;
    for (let t = 0; t < body.triangles.length; t += 3)
      for (let k = 0; k < 3; k += 1) {
        const a = body.triangles[t + k]!;
        const c = body.triangles[t + ((k + 1) % 3)]!;
        if (body.region[a]! >= 2 || body.region[c]! >= 2) continue;
        const len = (p: Float32Array) => Math.hypot(p[a * 3]! - p[c * 3]!, p[a * 3 + 1]! - p[c * 3 + 1]!, p[a * 3 + 2]! - p[c * 3 + 2]!);
        most = Math.max(most, len(positions) / (len(body.positions) || 1e-9));
      }
    return most;
  };
  if (process.env.DEFORM_REPORT) console.log(`worst edge stretch arm up 150: ${stretch(raw).toFixed(1)} -> ${stretch(fixed).toFixed(1)}`);
  expect(stretch(fixed)).toBeLessThan(stretch(raw));
});

/** The owner's own test poses (2026-10-05 screenshots): each must stay natural under the law and smooth at the shoulder. */
const OWNER_POSES: Record<string, number>[] = [
  { 'collar.lift': 30, 'arm.up': 180, 'arm.forward': 62, 'arm.twist': 72 },
  { 'arm.up': 20, 'arm.forward': 24, 'arm.twist': 6 },
  { 'arm.up': 171, 'arm.forward': 101, 'arm.twist': 90 },
];

it("the owner's test poses are natural and the shoulder skin holds together", async () => {
  const { relaxShoulders, skinNeighbours } = await import('../../../src/character/human/paint-pose.js');
  const neighbours = skinNeighbours(body.triangles, body.region, body.positions.length / 3);
  const turns = new Float32Array((body.positions.length / 3) * 4);
  for (const one of OWNER_POSES) {
    const values = Object.fromEntries(Object.entries(one).flatMap(([k, v]) => [[`L.${k}`, v], [`R.${k}`, v]]));
    expect(poseProblems(skeleton, values)).toEqual([]);
    const posed = poseBody(body.positions, body.skinIndex, body.skinWeight, skeleton, values, undefined, undefined, turns);
    relaxShoulders(body.positions, posed, turns, neighbours, skeleton, values);
    let worst = 0;
    for (let t = 0; t < body.triangles.length; t += 3)
      for (let k = 0; k < 3; k += 1) {
        const a = body.triangles[t + k]!;
        const c = body.triangles[t + ((k + 1) % 3)]!;
        if (body.region[a]! >= 2 || body.region[c]! >= 2) continue;
        const len = (p: Float32Array) => Math.hypot(p[a * 3]! - p[c * 3]!, p[a * 3 + 1]! - p[c * 3 + 1]!, p[a * 3 + 2]! - p[c * 3 + 2]!);
        worst = Math.max(worst, len(posed) / (len(body.positions) || 1e-9));
      }
    if (process.env.DEFORM_REPORT) process.stdout.write(`owner pose ${JSON.stringify(one)}: worst edge stretch ${worst.toFixed(1)}\n`);
    // The worst edges are the 1-3 mm edges inside the armpit hollow's fold, which opens as the arm goes up (8.8x at
    // arm up 180 on the 48k-quad body, 10.9x on the 107k one: its edges there are half as long); worse is a tear.
    expect(worst).toBeLessThan(13);
  }
});

it('a fist brings every fingertip to the palm; a point keeps the index straight', () => {
  const tip = (positions: Float32Array, finger: string) => {
    const j = names.indexOf(`LeftHand${finger}3`);
    let best = -1;
    let far = -Infinity;
    const knuckle = skeleton.pivots[names.indexOf(`LeftHand${finger}1`)]!;
    for (let v = 0; v < body.positions.length / 3; v += 1) {
      if (body.skinIndex[v * 4] !== j || body.skinWeight[v * 4]! < 0.8) continue;
      const d = Math.hypot(body.positions[v * 3]! - knuckle[0], body.positions[v * 3 + 1]! - knuckle[1], body.positions[v * 3 + 2]! - knuckle[2]);
      if (d > far) [far, best] = [d, v];
    }
    return Math.hypot(positions[best * 3]! - knuckle[0], positions[best * 3 + 1]! - knuckle[1], positions[best * 3 + 2]! - knuckle[2]);
  };
  const open = pose({});
  const fist = pose({ 'L.hand.fist': 100 });
  for (const finger of ['Index', 'Middle', 'Ring', 'Pinky']) expect(tip(fist, finger)).toBeLessThan(tip(open, finger) * 0.6);
  const point = pose({ 'L.middle.base': 90, 'L.middle.mid': 100, 'L.middle.tip': 70, 'L.ring.base': 90, 'L.ring.mid': 100, 'L.ring.tip': 70, 'L.pinky.base': 90, 'L.pinky.mid': 100, 'L.pinky.tip': 70 });
  expect(tip(point, 'Index')).toBeGreaterThan(tip(open, 'Index') * 0.97);
  expect(tip(point, 'Middle')).toBeLessThan(tip(open, 'Middle') * 0.6);
  // Every finger slider stays in its range.
  expect(poseValue({ 'L.index.base': 200 }, 'L.index.base')).toBe(90);
  expect(poseValue({ 'L.index.mid': -50 }, 'L.index.mid')).toBe(-5);
  expect(poseValue({ 'L.pinky.side': 90 }, 'L.pinky.side')).toBe(25);
});

it('the joints limit each other as a body does (HUMAN_JOINT_CONSTRAINTS couplings)', () => {
  const rest = poseRest(skeleton);
  // A finger tip cannot bend 80 with its middle joint straight (one tendon); it can with the middle joint bent.
  expect(coupledPose({ 'L.index.tip': 80 }, rest)['L.index.tip']).toBe(30);
  expect(coupledPose({ 'L.index.tip': 80, 'L.index.mid': 90 }, rest)['L.index.tip']).toBe(80);
  // No spread with the knuckle bent 90.
  expect(coupledPose({ 'L.pinky.side': 25, 'L.pinky.base': 90 }, rest)['L.pinky.side']).toBe(0);
  // Hamstrings: 120 forward only with the knee bent.
  expect(coupledPose({ 'L.leg.forward': 120 }, rest)['L.leg.forward']).toBe(80);
  expect(coupledPose({ 'L.leg.forward': 120, 'L.knee.bend': 90 }, rest)['L.leg.forward']).toBe(120);
  // Calf: toes up 10 with a straight knee, 20 bent.
  expect(coupledPose({ 'L.ankle.bend': -20 }, rest)['L.ankle.bend']).toBe(-10);
  expect(coupledPose({ 'L.ankle.bend': -20, 'L.knee.bend': 60 }, rest)['L.ankle.bend']).toBe(-20);
  // A slider that asks past a coupling stops there.
  const stopped = limitPose(skeleton, {}, { 'L.index.tip': 80 });
  expect(stopped.values['L.index.tip']).toBe(30);
  // The A-pose itself is untouched by the couplings.
  expect(poseProblems(skeleton, coupledPose({}, rest))).toEqual([]);
});

it('the palm turn spreads along the forearm like the radius: little at the elbow, all of it at the wrist', () => {
  const elbow = skeleton.pivots[names.indexOf('LeftForeArm')]!;
  const wrist = skeleton.pivots[names.indexOf('LeftHand')]!;
  const axis = [0, 1, 2].map((k) => wrist[k]! - elbow[k]!);
  const len2 = axis[0]! ** 2 + axis[1]! ** 2 + axis[2]! ** 2;
  const turned = pose({ 'L.elbow.twist': 80 });
  const near: number[] = [];
  const far: number[] = [];
  for (let v = 0; v < body.positions.length / 3; v += 1) {
    if (lead(v) !== 'LeftForeArm') continue;
    const r = [0, 1, 2].map((k) => body.positions[v * 3 + k]! - elbow[k]!);
    const t = (r[0]! * axis[0]! + r[1]! * axis[1]! + r[2]! * axis[2]!) / len2;
    if (t > 0.05 && t < 0.2) near.push(moved(turned, v));
    if (t > 0.8 && t < 0.95) far.push(moved(turned, v));
  }
  const mean = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;
  // Near the elbow the skin hardly turns; near the wrist it turns with the hand.
  expect(mean(near)).toBeLessThan(mean(far) * 0.4);
  // The joint law still reads the turn on the forearm (as the clips store it): no wrist twist.
  expect(poseProblems(skeleton, { 'L.elbow.twist': 80 })).toEqual([]);
});
