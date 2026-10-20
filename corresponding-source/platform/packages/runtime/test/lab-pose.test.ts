import { describe, expect, it } from 'vitest';
import { LabMadeMotion } from '@genvr/contracts';
import {
  labAsk, labClipPose, labHoldPins, labJointPositions, labKeyRows, labLimbMove, labLimbPositions, labMadeMotionPace, labMirror, labPoseAt,
  labPoseLimit, labPoseProblems, labPoseRow, labRowsOf, labStandPose, labTPose, LAB_POSE_KEYS, simulateLabRun, defaultLabCourse,
} from '../src/lab/index.js';

const dist = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

describe('motion lab pose (board M11)', () => {
  it('names every slider of the Avatar pose panel, both sides, plus the hips', () => {
    expect(LAB_POSE_KEYS).toEqual(expect.arrayContaining(['head.nod', 'L.elbow.bend', 'R.elbow.bend', 'R.index.tip', 'L.thumb.turn', 'R.knee.bend', 'root.y']));
    expect(labPoseRow('R.elbow.bend')).toBe('right_arm');
    expect(labPoseRow('L.pinky.mid')).toBe('left_hand');
    expect(labPoseRow('R.knee.bend')).toBe('legs');
    expect(labPoseRow('root.y')).toBe('body');
    expect(labRowsOf('Elbow', 'both')).toEqual(['right_arm', 'left_arm']);
    expect(labRowsOf('Index', 'R')).toEqual(['right_hand']);
    expect(labAsk('elbow.bend', 'R', 40)).toEqual({ 'R.elbow.bend': 40 });
    expect(labAsk('elbow.bend', 'both', 40)).toEqual({ 'L.elbow.bend': 40, 'R.elbow.bend': 40 });
  });

  it('gives a T-pose straight arms out to the side and stands on the floor', () => {
    const { bones } = labClipPose(labTPose());
    for (const bone of ['LeftForeArm', 'LeftUpLeg', 'Spine', 'Head'])
      for (const angle of bones[bone] ?? [0, 0, 0]) expect(Math.abs(angle)).toBeLessThan(3);
    const at = labJointPositions(labTPose());
    // Straight out to his side; the collarbone lifts a little with the raised arm (the shoulder rhythm).
    expect(at.get('LeftHand')![0]).toBeGreaterThan(0.6);
    expect(Math.abs(at.get('LeftHand')![1] - at.get('LeftArm')![1])).toBeLessThan(0.08);
    expect(at.get('LeftFoot')![1]).toBeCloseTo(0.1, 2);
    expect(labPoseProblems(labStandPose())).toEqual([]);
  });

  it('turns each finger joint (the stage shows the fingers by their own names)', () => {
    const bent = labClipPose({ ...labStandPose(), 'R.index.base': 80, 'R.index.mid': 90 }).bones;
    const flat = labClipPose({ ...labStandPose(), 'R.hand.fist': 0 }).bones;
    const turn = (v: number[] | undefined) => Math.hypot(...(v ?? [0, 0, 0]));
    expect(turn(bent.RightHandIndex1)).toBeGreaterThan(60);
    expect(turn(bent.RightHandIndex2)).toBeGreaterThan(60);
    expect(turn(flat.RightHandIndex1)).toBeLessThan(10);
  });

  it('lowers the hands when the arms come down, and his left hand is on his left', () => {
    const hands = labLimbPositions(labStandPose());
    expect(hands.left_hand[0]).toBeGreaterThan(0.1);
    expect(hands.right_hand[0]).toBeLessThan(-0.1);
    expect(hands.left_hand[1]).toBeLessThan(1);
  });

  it('stops a slider at the joint law and inside its range', () => {
    const stand = labStandPose();
    const out = labPoseLimit(stand, { 'R.elbow.bend': 400 });
    expect(out.pose['R.elbow.bend']).toBeLessThanOrEqual(150);
    expect(out.stopped).toEqual(['R.elbow.bend']);
    expect(labPoseLimit(stand, { 'R.elbow.bend': 38 }).pose['R.elbow.bend']).toBe(38);
    // A finger tip only as far as its middle joint lets it (a coupling of the law).
    expect(labPoseLimit(stand, { 'R.index.tip': 80 }).stopped).toEqual(['R.index.tip']);
  });

  it('fills the frames between keys: linear, smooth and hold, and loops back to the first key', () => {
    const motion = LabMadeMotion.parse({ id: 'm', name: 'M', frames: 100, keys: [
      { frame: 0, ease: 'linear', values: { 'R.elbow.bend': 0 } }, { frame: 50, ease: 'hold', values: { 'R.elbow.bend': 100 } }] });
    expect(labPoseAt(motion, 25)['R.elbow.bend']).toBe(50);
    expect(labPoseAt(motion, 75)['R.elbow.bend']).toBe(100);
    const smooth = LabMadeMotion.parse({ ...motion, keys: [{ ...motion.keys[0], ease: 'smooth' }, motion.keys[1]] });
    expect(labPoseAt(smooth, 12)['R.elbow.bend']).toBeLessThan(20);
    const loop = LabMadeMotion.parse({ ...motion, keys: [motion.keys[0], { ...motion.keys[1], ease: 'linear' }] });
    expect(labPoseAt(loop, 75)['R.elbow.bend']).toBe(50);
    expect(labPoseAt({ ...loop, loop: false }, 75)['R.elbow.bend']).toBe(100);
    // Sliders no key holds stand as in the standing pose; the draft shows on its own frame only.
    expect(labPoseAt(motion, 10)['L.arm.up']).toBe(8);
    expect(labPoseAt({ ...motion, draft: { frame: 10, values: { 'L.arm.up': 40 } } }, 10)['L.arm.up']).toBe(40);
    expect(labKeyRows({ 'R.elbow.bend': 1, 'L.knee.bend': 2 })).toEqual(['right_arm', 'legs']);
  });

  it('mirrors left and right', () => {
    const pose = { ...labStandPose(), 'R.elbow.bend': 90, 'head.turn': 30 };
    const swapped = labMirror(pose);
    expect(swapped['L.elbow.bend']).toBe(90);
    expect(swapped['R.elbow.bend']).toBe(12);
    expect(swapped['head.turn']).toBe(-30);
    expect(labMirror(pose, 'right_to_left')['L.elbow.bend']).toBe(90);
    expect(labMirror(pose, 'right_to_left')['head.turn']).toBe(30);
  });

  it('moves a hand to a point and the arm follows; out of reach it stops short', () => {
    const stand = labStandPose();
    const target: [number, number, number] = [-0.3, 1.35, 0.35];
    const out = labLimbMove(stand, 'right_hand', target);
    expect(out.miss_cm).toBeLessThan(3);
    expect(dist(labLimbPositions(out.pose).right_hand, target)).toBeLessThan(0.03);
    expect(labPoseProblems(out.pose)).toEqual([]);
    expect(labLimbMove(stand, 'right_hand', [-2, 1.3, 0]).miss_cm).toBeGreaterThan(50);
  });

  it('keeps a pinned foot on its spot when the knees bend (the hips go down)', () => {
    const stand = labStandPose();
    const before = labLimbPositions(stand).left_foot;
    const asked = { 'L.knee.bend': 60, 'L.leg.forward': 30 };
    const bent = labPoseLimit(stand, asked).pose;
    const held = labHoldPins(stand, bent, ['left_foot'], Object.keys(asked));
    expect(dist(labLimbPositions(held).left_foot, before)).toBeLessThan(0.01);
    expect(held['root.y']).toBeLessThan(-0.02);
  });

  it('measures the pace of a made walk from its feet, and none for a motion in place', () => {
    const still = LabMadeMotion.parse({ id: 'p', name: 'Punch', frames: 60, keys: [{ frame: 0, values: { 'R.elbow.bend': 20 } }, { frame: 30, values: { 'R.elbow.bend': 120 } }] });
    expect(labMadeMotionPace(still).speed).toBe(0);
    const walk = LabMadeMotion.parse({ id: 'w', name: 'My walk', frames: 60, keys: [
      { frame: 0, ease: 'linear', values: { 'L.leg.forward': 25, 'R.leg.forward': -20 } },
      { frame: 30, ease: 'linear', values: { 'L.leg.forward': -20, 'R.leg.forward': 25 } }] });
    const pace = labMadeMotionPace(walk);
    expect(pace.speed).toBeGreaterThan(0.3);
    expect(pace.stride).toBeGreaterThan(0.15);
    // The run uses the made motion's pace; the same seed gives the same run.
    const course = defaultLabCourse();
    const made = { 'My walk': { ...pace, clip: 'My walk' } };
    const a = simulateLabRun(course, { motion: 'My walk', speed: Math.max(0.5, pace.speed) }, course.seed, made);
    expect(a.frames.some((f) => f.clip === 'My walk')).toBe(true);
    expect(simulateLabRun(course, { motion: 'My walk', speed: Math.max(0.5, pace.speed) }, course.seed, made).frames.length).toBe(a.frames.length);
  });
});
