import { describe, expect, it } from 'vitest';
import { LabCourse, LabMadeMotion, LabProjectData, LabRunSettings, MotionLabOperation, MOTION_LAB_KINDS } from '../src/motion-lab.js';

describe('motion lab contracts (MOTION-LAB L1)', () => {
  it('fills a course with sizes in metres', () => {
    const course = LabCourse.parse({ obstacles: [{ id: 'step-1', kind: 'step', z: 3 }, { id: 'gap-1', kind: 'gap', z: 10 }] });
    expect(course.obstacles[0]).toMatchObject({ kind: 'step', height: 0.3, depth: 0.6, width: 3, x: 0 });
    expect(course.obstacles[1]).toMatchObject({ kind: 'gap', width: 1, height: 0.8 });
    expect(course).toMatchObject({ format: 1, seed: 4127, street: null, cars: [], finish_z: 30 });
  });
  it('refuses unknown kinds, sizes out of range, double ids, cars on a missing lane and a red light longer than its cycle', () => {
    expect(() => LabCourse.parse({ obstacles: [{ id: 'b', kind: 'beam', z: 1 }] })).toThrow();
    expect(() => LabCourse.parse({ obstacles: [{ id: 's', kind: 'step', z: 1, height: 2 }] })).toThrow();
    expect(() => LabCourse.parse({ obstacles: [{ id: 'a', kind: 'step', z: 1 }, { id: 'a', kind: 'ramp', z: 5 }] })).toThrow(/share the id/);
    expect(() => LabCourse.parse({ street: { lanes: 1 }, cars: [{ id: 'car', lane: 2 }] })).toThrow(/lane 2/);
    expect(() => LabCourse.parse({ street: { light: { cycle_s: 10, red_s: 12 } } })).toThrow(/red time/);
  });
  it('has run settings for the lab robot by default', () => {
    expect(LabRunSettings.parse({})).toMatchObject({ motion: 'Walk', character: 'robot', speed: 1.6, wait_for_green: true });
  });
  it('keeps at most 20 runs in a lab project', () => {
    const run = { id: 'r', at: 'now', seed: 1, settings: {}, course: {}, events: [], score: { foot_slide_cm: 0, penetration_cm: 0, fell: false, car_hit: false, finished: true, time_s: 1, smoothness: 1, total: 100 } };
    expect(() => LabProjectData.parse({ runs: Array.from({ length: 21 }, (_, i) => ({ ...run, id: `r-${i}` })) })).toThrow();
    expect(LabProjectData.parse({}).best_pending).toBeNull();
  });
  it('lists the agent operations and asks for confirm before deleting a version', () => {
    expect(MOTION_LAB_KINDS).toEqual(expect.arrayContaining(['course_set', 'obstacle_add', 'run', 'scores', 'save_version', 'save_best', 'rollback']));
    expect(() => MotionLabOperation.parse({ kind: 'version_delete', version: 'v-1' })).toThrow();
    expect(MotionLabOperation.parse({ kind: 'course_from_seed', seed: 7 })).toMatchObject({ obstacles: 5, hardness: 2, street: true });
    expect(MotionLabOperation.parse({ kind: 'obstacle_set', id: 'gap-1', set: { width: 1.4 } })).toMatchObject({ set: { width: 1.4 } });
    expect(() => MotionLabOperation.parse({ kind: 'view_set', speed: 3 })).toThrow();
  });
  it('changes only the run settings that are named', () => {
    expect(MotionLabOperation.parse({ kind: 'settings_set', settings: { speed: 2 } })).toEqual({ kind: 'settings_set', settings: { speed: 2 } });
    expect(MotionLabOperation.parse({ kind: 'run', settings: { stride: 0.6 } })).toEqual({ kind: 'run', settings: { stride: 0.6 } });
    expect(() => MotionLabOperation.parse({ kind: 'run', settings: { stride: 3 } })).toThrow();
  });
});

describe('lab character (board M17)', () => {
  it('follows the Avatar tab by default and accepts imported character ids', () => {
    expect(LabProjectData.parse({}).who).toBe('avatar');
    const id = 'user.mixamo.' + 'f'.repeat(64) + '.character';
    expect(LabRunSettings.parse({ character: id }).character).toBe(id);
    expect(MotionLabOperation.parse({ kind: 'who_set', who: id })).toMatchObject({ kind: 'who_set' });
    expect(MOTION_LAB_KINDS).toEqual(expect.arrayContaining(['characters', 'who_set']));
  });
});

describe('made motions by pose and key frames (board M11)', () => {
  it('keeps keys of pose sliders on frames inside the motion, one key per frame', () => {
    const motion = LabMadeMotion.parse({ id: 'made-punch', name: 'Punch', keys: [{ frame: 0, values: { 'R.elbow.bend': 12, 'root.y': 0 } }] });
    expect(motion).toMatchObject({ frames: 120, loop: true, pins: [], draft: null });
    expect(motion.keys[0]!.ease).toBe('smooth');
    expect(() => LabMadeMotion.parse({ ...motion, keys: [...motion.keys, { frame: 0, values: {} }] })).toThrow(/Two keys/);
    expect(() => LabMadeMotion.parse({ ...motion, keys: [{ frame: 200, values: {} }] })).toThrow(/120 frames/);
    expect(() => LabMadeMotion.parse({ ...motion, keys: [{ frame: 1, values: { 'Right elbow': 3 } }] })).toThrow();
    expect(() => LabProjectData.parse({ motions: [motion, { ...motion, id: 'made-punch-2', name: 'punch' }] })).toThrow(/called/);
  });
  it('has the M11 operations, with sides, rows, eases and limbs checked', () => {
    expect(MOTION_LAB_KINDS).toEqual(expect.arrayContaining(['pose_get', 'pose_set', 'key_add', 'key_remove', 'limb_move', 'pin', 'pose_mirror', 'pose_test', 'pose_save_version']));
    expect(MotionLabOperation.parse({ kind: 'pose_set', frame: 412, joint: 'elbow.bend', value: 38 })).toMatchObject({ side: 'both' });
    expect(() => MotionLabOperation.parse({ kind: 'key_add', frame: 1, rows: ['tail'] })).toThrow();
    expect(() => MotionLabOperation.parse({ kind: 'key_ease', frame: 1, ease: 'bouncy' })).toThrow();
    expect(() => MotionLabOperation.parse({ kind: 'pin', limb: 'head' })).toThrow();
    expect(MotionLabOperation.parse({ kind: 'limb_move', frame: 0, limb: 'right_hand', by: [0, 0.1, 0] })).toMatchObject({ limb: 'right_hand' });
  });
});
