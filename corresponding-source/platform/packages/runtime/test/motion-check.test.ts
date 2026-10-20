import { describe, expect, it } from 'vitest';
import { DEFAULT_MOTION_STYLES, MotionCheckCell, defaultMotionStyle } from '@genvr/contracts';
import { checkMove, hingeBend, rankCells, type CheckFrame, type Vec3 } from '../src/lab/motion-check.js';
import { checkAllMoves, sampleMoves } from '../src/lab/motion-check-sample.js';

/** A person standing still, facing +z, +x is the left: legs straight down, arms out (T-pose). */
function stand(t: number, change: (f: Mutable) => void = () => {}): CheckFrame {
  const f: Mutable = {
    t, hips: [0, 0.95, 0], chest: [0, 1.3, 0], neck: [0, 1.5, 0], head: [0, 1.65, 0],
    feet: [{ heel: [0.1, 0, -0.05], toe: [0.1, 0, 0.12] }, { heel: [-0.1, 0, -0.05], toe: [-0.1, 0, 0.12] }],
    legs: [{ root: [0.1, 0.95, 0], mid: [0.1, 0.5, 0], end: [0.1, 0.08, 0], axis: [1, 0, 0] }, { root: [-0.1, 0.95, 0], mid: [-0.1, 0.5, 0], end: [-0.1, 0.08, 0], axis: [1, 0, 0] }],
    arms: [{ root: [0.2, 1.45, 0], mid: [0.5, 1.45, 0], end: [0.75, 1.45, 0], axis: [0, -1, 0] }, { root: [-0.2, 1.45, 0], mid: [-0.5, 1.45, 0], end: [-0.75, 1.45, 0], axis: [0, 1, 0] }],
  };
  change(f); return f;
}
type Mutable = { -readonly [K in keyof CheckFrame]: CheckFrame[K] extends readonly [infer A, infer B] ? [A, B] : CheckFrame[K] };
const frames = (n: number, change?: (f: Mutable, i: number) => void) => Array.from({ length: n }, (_, i) => stand(i / 60, f => change?.(f, i)));
const realistic = DEFAULT_MOTION_STYLES.realistic.limits;
const run = (list: CheckFrame[], loop = false, style: 'realistic' | 'game' | 'anime' = 'realistic') => checkMove({ move: 'Test', body: 'robot', style, loop, frames: list, torsoRadius: 0.12 }, DEFAULT_MOTION_STYLES[style].limits);
const checks = (cell: MotionCheckCell) => [...new Set(cell.issues.map(issue => issue.check))];

describe('board M16 · motion check', () => {
  it('a clean standing pose scores 100 with no issues', () => {
    const cell = run(frames(60), true);
    expect(cell).toMatchObject({ score: 100, issues: [], frames: 60 });
    expect(MotionCheckCell.parse(cell)).toEqual(cell);
  });
  it('a sliding planted foot is caught with its frames and centimetres', () => {
    const cell = run(frames(30, (f, i) => { if (i >= 10) f.feet[0] = { heel: [0.1, 0, -0.05 + (i - 9) * 0.002], toe: [0.1, 0, 0.12 + (i - 9) * 0.002] }; }));
    expect(checks(cell)).toEqual(['foot_slide']);
    expect(cell.issues[0]).toMatchObject({ check: 'foot_slide', from: 15, to: 29, value: 4, limit: 1, unit: 'cm' });
    expect(cell.score).toBe(100 - 12);
    // Game allows 1.5 cm.
    expect(run(frames(30, (f, i) => { if (i >= 10) f.feet[0] = { heel: [0.1, 0, -0.05 + (i - 9) * 0.0006], toe: [0.1, 0, 0.12 + (i - 9) * 0.0006] }; }), false, 'game').issues).toEqual([]);
  });
  it('a foot through the floor is caught', () => {
    const cell = run(frames(10, (f, i) => { if (i === 5) f.feet[1] = { heel: [-0.1, -0.03, -0.05], toe: [-0.1, -0.02, 0.12] }; }));
    expect(cell.issues).toContainEqual(expect.objectContaining({ check: 'ground', from: 5, to: 5, value: 3 }));
  });
  it('a knee bent forward is caught; a normal bend is fine; anime allows 15° more', () => {
    const bend = (deg: number) => { const r = deg * Math.PI / 180; return [0.1, 0.5 - 0.42 * Math.cos(r), -0.42 * Math.sin(r)] as Vec3; };
    expect(hingeBend({ root: [0.1, 0.95, 0], mid: [0.1, 0.5, 0], end: bend(40), axis: [1, 0, 0] })).toBeCloseTo(40, 3);
    expect(run(frames(10, f => { f.legs[0] = { ...f.legs[0], end: bend(60) }; })).issues.filter(i => i.check === 'joint_limits')).toEqual([]);
    const forward = run(frames(10, f => { f.legs[0] = { ...f.legs[0], end: bend(-20) }; }));
    expect(forward.issues[0]).toMatchObject({ check: 'joint_limits', value: 15, unit: 'deg' });
    expect(run(frames(10, f => { f.legs[0] = { ...f.legs[0], end: bend(-20) }; }), false, 'anime').issues.filter(i => i.check === 'joint_limits')).toEqual([]);
  });
  it('an elbow bent backward is caught', () => {
    const cell = run(frames(10, f => { f.arms[0] = { ...f.arms[0], end: [0.5 + 0.25 * Math.cos(0.5), 1.45, -0.25 * Math.sin(0.5)] }; }));
    expect(cell.issues[0]).toMatchObject({ check: 'joint_limits' });
    expect(run(frames(10, f => { f.arms[0] = { ...f.arms[0], end: [0.5 + 0.25 * Math.cos(1.2), 1.45, 0.25 * Math.sin(1.2)] }; })).issues).toEqual([]);
  });
  it('a hand inside the chest is caught', () => {
    const cell = run(frames(10, (f, i) => { if (i > 3) f.arms[1] = { ...f.arms[1], end: [0.02, 1.3, 0.03] }; }));
    expect(cell.issues).toContainEqual(expect.objectContaining({ check: 'body_clash', from: 4, to: 9 }));
    expect(cell.score).toBeLessThan(100);
  });
  it('weight outside the feet while standing is caught; anime does not score balance', () => {
    const lean = frames(30, f => { f.hips = [0, 0.95, 0.4]; f.chest = [0, 1.3, 0.5]; f.head = [0, 1.65, 0.6]; });
    expect(run(lean).issues).toContainEqual(expect.objectContaining({ check: 'balance', unit: 's' }));
    expect(run(lean, false, 'anime').issues.filter(i => i.check === 'balance')).toEqual([]);
  });
  it('moves in the air or in water skip the floor checks but keep the body checks', () => {
    const sunk = frames(10, f => { f.feet[0] = { heel: [0.1, -0.2, -0.05], toe: [0.1, -0.2, 0.12] }; f.arms[1] = { ...f.arms[1], end: [0.02, 1.3, 0.03] }; });
    const cell = checkMove({ move: 'Swim', body: 'robot', style: 'realistic', loop: false, frames: sunk, torsoRadius: 0.12, offFloor: true }, realistic);
    expect(checks(cell)).toEqual(['body_clash']);
  });
  it('a loop whose last frame differs from the first is caught', () => {
    const cell = run(frames(20, (f, i) => { if (i === 19) f.arms[0] = { ...f.arms[0], mid: [0.5, 1.35, 0], end: [0.75, 1.3, 0] }; }), true);
    expect(cell.issues).toContainEqual(expect.objectContaining({ check: 'loop_seam', from: 19 }));
    expect(run(frames(20), true).issues).toEqual([]);
  });
  it('feet that move under the body at the wrong speed are caught', () => {
    // The body moves forward 1.4 m/s but the planted feet travel with it (moonwalk).
    const cell = run(frames(30, (f, i) => { const z = i / 60 * 1.4; f.hips = [0, 0.95, z]; f.chest = [0, 1.3, z]; f.neck = [0, 1.5, z]; f.head = [0, 1.65, z];
      f.feet = [{ heel: [0.1, 0, z - 0.05], toe: [0.1, 0, z + 0.12] }, { heel: [-0.1, 0, z - 0.05], toe: [-0.1, 0, z + 0.12] }]; }));
    expect(checks(cell)).toContain('speed_match');
  });
  it('the same frames give the same report, and the list ranks the worst first', () => {
    const bad = frames(10, f => { f.legs[0] = { ...f.legs[0], end: [0.1, 0.1, 0.2] }; });
    expect(run(bad)).toEqual(run(bad));
    const ranked = rankCells([{ ...run(frames(5)), move: 'B' }, { ...run(bad), move: 'A' }, { ...run(frames(5)), move: 'A' }]);
    expect(ranked.map(cell => [cell.move, cell.score])).toEqual([['A', run(bad).score], ['A', 100], ['B', 100]]);
  });
  it('places pick their default style', () => {
    expect([defaultMotionStyle('realistic'), defaultMotionStyle('blocky'), defaultMotionStyle('voxel'), defaultMotionStyle('anime')]).toEqual(['realistic', 'game', 'game', 'anime']);
    expect(realistic).toMatchObject({ foot_slide_cm: 1, loop_seam_deg: 2 });
  });
});

describe('board M16 · headless run on the Standard robot', () => {
  it('records every move at the fixed step, and the same seed gives the same report', () => {
    const [walk] = sampleMoves(undefined, ['Walk']);
    expect(walk!.frames.length).toBeGreaterThan(30);
    expect(walk!.frames[1]!.t).toBeCloseTo(1 / 60, 6);
    // Standing in the rest pose, the soles touch the floor.
    const [idle] = sampleMoves(undefined, ['Idle']);
    expect(Math.abs(idle!.frames[0]!.feet[0].heel[1])).toBeLessThan(0.05);
    const first = checkAllMoves(undefined, ['realistic']);
    expect(first.length).toBeGreaterThanOrEqual(30);
    expect(checkAllMoves(undefined, ['realistic'])).toEqual(first);
    for (const cell of first) expect(MotionCheckCell.parse(cell)).toEqual(cell);
  }, 60000);
  it('fix the base: no move puts a sole under the floor (swims are in water)', () => {
    for (const move of sampleMoves()) {
      if (move.move.startsWith('Swim')) continue;
      const lowest = Math.min(...move.frames.flatMap(f => f.feet.flatMap(foot => [foot.heel[1], foot.toe[1]])));
      expect(lowest, move.move).toBeGreaterThan(-0.01);
    }
    // Feet locked while planted: walking, crouch walking, backing up and landings score at least 90 and slide at most 3 cm
    // (a heel coming down within 3 cm of the floor already counts as planted); turns and the sprint stop score at least 85.
    const cells = checkAllMoves(undefined, ['realistic']);
    for (const move of ['TurnLeft90', 'TurnRight90', 'Turn180', 'SprintStop']) expect(cells.find(row => row.move === move)!.score, move).toBeGreaterThanOrEqual(85);
    for (const move of ['Walk', 'CrouchWalk', 'Sneak', 'Backpedal', 'SoftLanding', 'HardLanding']) {
      const cell = cells.find(row => row.move === move)!;
      expect(cell.score, move).toBeGreaterThanOrEqual(90);
      expect(Math.max(0, ...cell.issues.filter(issue => issue.check === 'foot_slide').map(issue => issue.value)), move).toBeLessThanOrEqual(3);
    }
    // Crouch walk travels at its Lab speed.
    expect(sampleMoves(undefined, ['CrouchWalk'])[0]!.velocity).toEqual([0, 0.9]);
  }, 60000);
});
