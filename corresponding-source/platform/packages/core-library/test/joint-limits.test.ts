import { describe, expect, it } from 'vitest';
import { CORE_ANIMATIONS } from '../src/avatar-appearance/index.js';
import { armPose, legPose, type V3 } from '../src/avatar-appearance/_animation.js';
import { jointProblems } from '../src/avatar-appearance/_joint-limits.js';
import { dot3, qFromEuler, qMul, qRotate, unit3 } from '../src/avatar-appearance/_joint-math.js';

/**
 * The joint law (owner rule, CHAR-02): every Core move, and every move added later, keeps every joint where a
 * human joint can go. A failure names the clip, the key time, the bone and what is wrong.
 */
describe('joint law', () => {
  it('every Core move keeps every joint in its natural range', () => {
    const problems: string[] = [];
    for (const animation of CORE_ANIMATIONS)
      for (const [time, pose] of animation.keys)
        for (const problem of jointProblems(pose)) problems.push(`${animation.clip} @${time.toFixed(2)}s ${problem}`);
    expect(problems).toEqual([]);
  });

  it('catches an elbow bent backward and a knee bent forward', () => {
    expect(jointProblems({ LeftForeArm: [0, 40, 0] }).join()).toMatch(/elbow bent backward/);
    expect(jointProblems({ RightForeArm: [0, -40, 0] }).join()).toMatch(/elbow bent backward/);
    expect(jointProblems({ LeftLeg: [-30, 0, 0] }).join()).toMatch(/knee bent forward/);
    expect(jointProblems({ LeftForeArm: [0, 0, 60] }).join()).toMatch(/elbow bent sideways/);
  });

  it('builds arms and legs with real hinges that reach the asked directions', () => {
    const cases: [V3, V3][] = [
      [[0.3, -0.9, 0.2], [0.1, -0.2, 1]],
      [[0, 1, 0], [0.4, 0.6, 0.7]],
      [[0.7, 0.1, -0.7], [0.3, 0.7, 0.6]],
      [[0.1, -1, 0.1], [0.1, -1, 0.15]],
    ];
    for (const side of ['Left', 'Right'] as const) {
      const along: V3 = side === 'Left' ? [1, 0, 0] : [-1, 0, 0];
      for (const [upper, fore] of cases) {
        const u: V3 = side === 'Left' ? upper : [-upper[0], upper[1], upper[2]];
        const f: V3 = side === 'Left' ? fore : [-fore[0], fore[1], fore[2]];
        const pose = armPose(side, u, f, [0, 0, 1]);
        const arm = qFromEuler(pose.arm);
        const reachedUpper = qRotate(arm, along);
        const reachedFore = qRotate(qMul(arm, qFromEuler(pose.fore)), along);
        expect(dot3(reachedUpper, unit3(u))).toBeGreaterThan(0.999);
        expect(dot3(reachedFore, unit3(f))).toBeGreaterThan(0.999);
        expect(jointProblems({ [`${side}Arm`]: pose.arm, [`${side}ForeArm`]: pose.fore })).toEqual([]);
      }
    }
    for (const [thigh, shin] of [
      [[0.1, -0.9, 0.3], [0.1, -0.6, -0.8]],
      [[0, -0.2, 1], [0, -1, 0]],
      [[0.25, -0.78, 0.2], [0.35, 0.15, -0.35]],
    ] as [V3, V3][]) {
      const pose = legPose(thigh, shin);
      const q = qFromEuler(pose.thigh);
      expect(dot3(qRotate(q, [0, -1, 0]), unit3(thigh))).toBeGreaterThan(0.999);
      expect(dot3(qRotate(qMul(q, qFromEuler(pose.shin)), [0, -1, 0]), unit3(shin))).toBeGreaterThan(0.999);
      expect(jointProblems({ LeftUpLeg: pose.thigh, LeftLeg: pose.shin })).toEqual([]);
    }
  });
});
