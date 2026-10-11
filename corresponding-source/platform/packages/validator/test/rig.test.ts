import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { findBody } from '@genvr/core-library';
import { describe, expect, it } from 'vitest';
import { inspectRig } from '../src/index.js';

// Uploaded bodies (plan 2026-10-03, Task 1): the rig read from a GLB. Our own mesh bodies are the reference: the
// anime boy's file must give back the joints written in its body file; the warrior stands in an A-pose.

const body = (name: string) =>
  new Uint8Array(
    readFileSync(fileURLToPath(new URL(`../../../apps/web/public/bodies/${name}.glb`, import.meta.url))),
  );

describe('inspectRig', () => {
  it("reads the anime boy's 52 bones at the rest positions its body file has, in a T-pose", () => {
    const rig = inspectRig(body('anime-boy'));
    expect(rig.ok, rig.ok ? '' : rig.problems.join('; ')).toBe(true);
    if (!rig.ok) return;
    expect(rig.pose).toBe('t-pose');
    expect(rig.missing).toEqual([]);
    const expected = findBody('anime-boy').joints;
    // The same bones (in an order where every parent comes first).
    expect(rig.joints.map((joint) => joint.name).sort()).toEqual(expected.map((joint) => joint.name).sort());
    const seen = new Set<string>();
    for (const joint of rig.joints) {
      if (joint.parent) expect(seen.has(joint.parent), joint.name).toBe(true);
      seen.add(joint.name);
    }
    for (const joint of expected) {
      const got = rig.joints.find((one) => one.name === joint.name)!;
      expect(got.parent, joint.name).toBe(joint.parent);
      for (let axis = 0; axis < 3; axis += 1)
        expect(got.at[axis]!, `${joint.name}[${axis}]`).toBeCloseTo(joint.at[axis]!, 3);
    }
    expect(rig.height).toBeGreaterThan(1.5);
    expect(rig.height).toBeLessThan(1.7);
  });

  it('finds the warrior in an A-pose and lists its swing bones as extra', () => {
    const rig = inspectRig(body('warrior'));
    expect(rig.ok).toBe(false);
    if (rig.ok) return;
    expect(rig.problems.join(' ')).toMatch(/A-pose|T-pose/);
    expect(rig.found?.extra.length).toBeGreaterThan(0);
  });

  it('refuses a file that is not a rigged character', () => {
    expect(inspectRig(new Uint8Array([1, 2, 3]))).toMatchObject({ ok: false });
  });
});
