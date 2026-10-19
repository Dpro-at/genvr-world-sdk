import { describe, expect, it } from 'vitest';
import { LabCourse, LabScore } from '@genvr/contracts';
import { carBoxes, courseBoxes, courseFromSeed, defaultLabCourse, groundAt, scoreLabRun, simulateLabRun, walkerGreen } from '../src/lab/index.js';

describe('motion lab course (MOTION-LAB L1)', () => {
  const course = defaultLabCourse();
  it('builds the M1 course: step 30 cm, ramp to 0.8 m, a 1 m gap, low wall, window, street with a car', () => {
    expect(course.obstacles.map((o) => o.kind)).toEqual(['step', 'ramp', 'gap', 'low_wall', 'window']);
    expect(groundAt(course, 0, 3.3)).toBeCloseTo(0.3);
    expect(groundAt(course, 0, 7.5)).toBeCloseTo(0.4);
    expect(groundAt(course, 0, 9.5)).toBeCloseTo(0.8);
    expect(groundAt(course, 0, 10.5)).toBe(-1);
    expect(groundAt(course, 0, 11.5)).toBeCloseTo(0.8);
    expect(courseBoxes(course).filter((b) => b.id === 'window-1')).toHaveLength(4);
  });
  it('makes the same course from the same seed, and a valid one', () => {
    expect(courseFromSeed(99)).toEqual(courseFromSeed(99));
    expect(courseFromSeed(99)).not.toEqual(courseFromSeed(100));
    expect(() => LabCourse.parse(courseFromSeed(7, 8, 5))).not.toThrow();
  });
  it('runs the light and the car: walkers wait 20 s of red, the car stops while walkers have green', () => {
    const street = course.street!;
    expect(walkerGreen(street, 5)).toBe(false);
    expect(walkerGreen(street, 25)).toBe(true);
    const car = carBoxes(course, 9)[0]!;
    expect(Math.abs((car.min[0] + car.max[0]) / 2)).toBeLessThan(1);
  });
});

describe('motion lab runs and scores (MOTION-LAB L2)', () => {
  const course = defaultLabCourse();
  it('is repeatable: the same course, settings and seed give the same frames and score', () => {
    const a = simulateLabRun(course, { speed: 1.7 }), b = simulateLabRun(course, { speed: 1.7 });
    expect(a.frames.length).toBe(b.frames.length);
    expect(a.frames.at(-1)).toEqual(b.frames.at(-1));
    expect(scoreLabRun(course, a)).toEqual(scoreLabRun(course, b));
  });
  it('finishes the default course with a valid score and the obstacles in order', () => {
    const run = simulateLabRun(course);
    const score = LabScore.parse(scoreLabRun(course, run));
    expect(run.end).toBe('finish');
    expect(score).toMatchObject({ fell: false, car_hit: false, finished: true, penetration_cm: 0 });
    expect(score.total).toBeGreaterThan(70);
    expect(run.events.map((e) => e.kind)).toEqual(expect.arrayContaining(['step', 'ramp', 'gap_jump', 'land', 'vault', 'window', 'wait', 'crossing', 'finish']));
  });
  it('slides more when the stride does not fit the speed', () => {
    const good = scoreLabRun(course, simulateLabRun(course, {}));
    const bad = scoreLabRun(course, simulateLabRun(course, { stride: 0.55 }));
    expect(bad.foot_slide_cm).toBeGreaterThan(good.foot_slide_cm * 2);
    expect(bad.total).toBeLessThan(good.total);
  });
  it('falls into the gap when the jump is too late, and trips when the feet lift too little', () => {
    const late = simulateLabRun(course, { jump_timing_ms: 250 });
    expect(late.end).toBe('fall');
    expect(scoreLabRun(course, late)).toMatchObject({ fell: true, finished: false });
    const low = simulateLabRun(course, { step_height: 0.08 });
    const s = scoreLabRun(course, low);
    expect(s.fell).toBe(true);
    expect(s.penetration_cm).toBeGreaterThan(10);
  });
  it('is hit by the car when it crosses on red', () => {
    const run = simulateLabRun(course, { wait_for_green: false });
    expect(run.end).toBe('car');
    expect(scoreLabRun(course, run)).toMatchObject({ car_hit: true, finished: false });
  });
  it('uses Walk for a move name that is not a ground move, never an object key', () => {
    expect(simulateLabRun(course, { motion: 'constructor' }).frames.length).toBe(simulateLabRun(course, { motion: 'Walk' }).frames.length);
  });
  it('is blocked honestly by a window too small to climb through', () => {
    const tight = LabCourse.parse({ ...course, obstacles: course.obstacles.map((o) => (o.kind === 'window' ? { ...o, opening_height: 0.5 } : o)) });
    const run = simulateLabRun(tight);
    expect(run.end).toBe('blocked');
    expect(run.events.at(-1)?.label).toMatch(/too small/);
  });
});
