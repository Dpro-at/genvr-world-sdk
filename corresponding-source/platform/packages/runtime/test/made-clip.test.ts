import { describe, expect, it } from 'vitest';
import { LabMadeMotion } from '@genvr/contracts';
import { findBody } from '@genvr/core-library';
import { labStandPose, madeMotionClip } from '../src/lab/index.js';

describe('made motion as a clip (board M19)', () => {
  const motion = LabMadeMotion.parse({ id: 'made-wave', name: 'Wave', frames: 60, keys: [
    { frame: 0, ease: 'linear', values: { ...labStandPose(), 'R.arm.up': 150, 'R.index.base': 0 } },
    { frame: 30, ease: 'linear', values: { 'R.arm.up': 120, 'R.index.base': 80, 'root.y': -0.2 } }] });
  it('turns the keys into tracks on the body\'s own bones, fingers and hips included', () => {
    const robot = findBody('robot');
    const clip = madeMotionClip(motion, robot, 'motion:made-wave-v1');
    expect(clip.name).toBe('motion:made-wave-v1');
    expect(clip.duration).toBeCloseTo(1);
    const names = clip.tracks.map((t) => t.name);
    expect(names).toContain(`${robot.bonePrefix}RightArm.quaternion`);
    expect(names).toContain(`${robot.bonePrefix}RightHandIndex1.quaternion`);
    expect(names).toContain(`${robot.bonePrefix}Hips.position`);
    // A loop ends on its first frame: no seam.
    const arm = clip.tracks.find((t) => t.name === `${robot.bonePrefix}RightArm.quaternion`)!;
    const first = Array.from(arm.values.slice(0, 4)), last = Array.from(arm.values.slice(-4));
    first.forEach((v, i) => expect(v).toBeCloseTo(last[i]!, 5));
  });
  it('holds the last key when it does not loop', () => {
    const clip = madeMotionClip({ ...motion, loop: false }, findBody('robot'), 'once');
    expect(clip.duration).toBeCloseTo(59 / 60);
  });
});
