import { describe, expect, it } from 'vitest';
import { LabCourse, LabProjectData, LabRunSettings, MotionLabOperation, MOTION_LAB_KINDS } from '../src/motion-lab.js';

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
});
