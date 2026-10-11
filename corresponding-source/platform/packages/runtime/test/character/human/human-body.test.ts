import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Bone, Matrix4, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { findBody } from '@genvr/core-library';
import { decodeHuman, encodeHuman } from '../../../src/character/human/format.js';
import { generateHuman, HUMAN_PRESETS, mixHuman } from '../../../src/character/human/generate.js';
import { STANDARD_BONES } from '../../../src/avatar.js';

const file = fileURLToPath(new URL('../../../../../apps/web/public/human/human-base.bin', import.meta.url));
const bytes = readFileSync(file);
const data = decodeHuman(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const boy = generateHuman(data, 'anime', 'boy')!;

/** World matrices of the joints with each joint's `bind` turn applied (the mesh's own pose). */
function worlds(joints: typeof boy.joints, posed: boolean): Matrix4[] {
  const index = new Map(joints.map((joint, i) => [joint.name, i]));
  const out: Matrix4[] = [];
  joints.forEach((joint, i) => {
    const parent = joint.parent ? index.get(joint.parent)! : -1;
    const local = new Matrix4().compose(
      parent < 0
        ? new Vector3(...joint.at)
        : new Vector3(...joint.at).sub(new Vector3(...joints[parent]!.at)),
      posed && joint.bind ? new Quaternion(...joint.bind) : new Quaternion(),
      new Vector3(1, 1, 1),
    );
    out[i] = parent < 0 ? local : out[parent]!.clone().multiply(local);
  });
  return out;
}

describe('generated anime boy (CHAR-02)', () => {
  it('has exactly the 52 standard bones in the Core order', () => {
    expect(boy.joints.map((joint) => joint.name).sort()).toEqual([...STANDARD_BONES].sort());
    expect(findBody('human').joints.map((joint) => joint.name)).toEqual(boy.joints.map((joint) => joint.name));
  });

  it('matches the Core body joints written by the bake', () => {
    const core = findBody('human').joints;
    boy.joints.forEach((joint, i) => {
      expect(core[i]!.parent).toBe(joint.parent);
      for (let k = 0; k < 3; k += 1) expect(core[i]!.at[k]).toBeCloseTo(joint.at[k]!, 4);
      // The bind turns are what keep the A-pose mesh on its bones (they were once dropped: arms crossed).
      expect(core[i]!.bind ? [...core[i]!.bind!] : undefined).toEqual(joint.bind);
    });
  });

  it('is deterministic and round-trips through the format', () => {
    const again = generateHuman(data, 'anime', 'boy')!;
    expect(again.positions).toEqual(boy.positions);
    const copy = encodeHuman({
      positions: data.positions,
      drawn: data.header.drawn,
      quads: data.quads,
      regions: data.header.regions,
      region: data.region,
      skinIndex: data.skinIndex,
      skinWeight: data.skinWeight,
      joints: data.joints.map((joint) => ({ ...joint, vertices: [...joint.vertices] })),
      targets: [...data.targets.values()],
      sources: data.header.sources,
    });
    const back = decodeHuman(copy.slice().buffer);
    expect(back.positions).toEqual(data.positions);
    expect(back.targets.size).toBe(data.targets.size);
  });

  it('stands on the ground, faces +z and has no NaN', () => {
    let min = Infinity;
    for (let i = 0; i < boy.positions.length; i += 1) {
      expect(Number.isFinite(boy.positions[i])).toBe(true);
      if (i % 3 === 1) min = Math.min(min, boy.positions[i]!);
    }
    expect(min).toBeCloseTo(0, 6);
    expect(boy.height).toBeGreaterThan(1.55);
    expect(boy.height).toBeLessThan(1.8);
    const toe = boy.joints.find((joint) => joint.name === 'LeftToeBase')!;
    const ankle = boy.joints.find((joint) => joint.name === 'LeftFoot')!;
    expect(toe.at[2]).toBeGreaterThan(ankle.at[2]);
    expect(boy.joints.find((joint) => joint.name === 'LeftArm')!.at[0]).toBeGreaterThan(0);
  });

  it('is all quads within the desktop budget, with a quad-edge wireframe', () => {
    expect(boy.triangles.length / 3).toBe((boy.quads.length / 4) * 2);
    // Desktop body budget (owner, 2026-10-05: "go to 100k quads, we try it and lighten later"): ~107k quads on the
    // MakeHuman topology (old vertex ids kept, 32-bit indices); the lighter LOD is the original quads.
    expect(boy.triangles.length / 3).toBeLessThanOrEqual(230000);
    expect(boy.lodTriangles!.length / 3).toBeLessThanOrEqual(30000);
    // Every quad edge once, as a degenerate triangle (a, b, b).
    for (let i = 0; i < boy.quadEdges.length; i += 3) expect(boy.quadEdges[i + 1]).toBe(boy.quadEdges[i + 2]);
    expect(boy.quadEdges.length / 3).toBeGreaterThan(boy.quads.length / 4);
  });

  it('weights every vertex with at most four bones summing to 1', () => {
    for (let v = 0; v < boy.positions.length / 3; v += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) {
        sum += boy.skinWeight[v * 4 + k]!;
        expect(boy.skinIndex[v * 4 + k]).toBeLessThan(52);
      }
      expect(sum).toBeCloseTo(1, 5);
    }
  });

  it('binds in the mesh pose: skinned at the T-pose, a hand vertex sits by the T-pose hand joint', () => {
    const bindWorld = worlds(boy.joints, true);
    const restWorld = worlds(boy.joints, false);
    const hand = boy.joints.findIndex((joint) => joint.name === 'LeftHand');
    const handAt = new Vector3().setFromMatrixPosition(bindWorld[hand]!);
    // The mesh vertex nearest the bound hand joint.
    let best = -1;
    let distance = Infinity;
    for (let v = 0; v < boy.positions.length / 3; v += 1) {
      const d = handAt.distanceTo(new Vector3().fromArray(boy.positions, v * 3));
      if (d < distance) {
        distance = d;
        best = v;
      }
    }
    expect(distance).toBeLessThan(0.05);
    const skinned = new Vector3();
    const p = new Vector3().fromArray(boy.positions, best * 3);
    for (let k = 0; k < 4; k += 1) {
      const w = boy.skinWeight[best * 4 + k]!;
      if (!w) continue;
      const j = boy.skinIndex[best * 4 + k]!;
      const m = restWorld[j]!.clone().multiply(bindWorld[j]!.clone().invert());
      skinned.addScaledVector(p.clone().applyMatrix4(m), w);
    }
    const restHand = new Vector3(...boy.joints[hand]!.at);
    expect(skinned.distanceTo(restHand)).toBeLessThan(0.06);
  });

  it('mixes targets linearly', () => {
    const preset = HUMAN_PRESETS['anime:boy']!;
    const half = mixHuman(data, Object.fromEntries(Object.entries(preset).map(([k, w]) => [k, w / 2])));
    const full = mixHuman(data, preset);
    for (let i = 0; i < 300; i += 3)
      expect(half[i]!).toBeCloseTo((data.positions[i]! + full[i]!) / 2, 5);
  });
});
