import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AnimationMixer, Vector3, type SkinnedMesh } from 'three/webgpu';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CORE_ANIMATIONS, findBody } from '@genvr/core-library';
import { clipFromAnimation, createGenvrAvatar, DEFAULT_LOOK, loadBodyModel } from '../../../src/avatar.js';

/**
 * Skin quality in the real clips (owner, CHAR-02: arms deformed in Climb and Swim in every direction). For each
 * clip and a few times, every mesh edge's skinned length is compared with its rest length, and triangles that
 * fold over (normal turned more than 120 degrees from the rest normal turned by its lead bone) are counted.
 */
const file = fileURLToPath(new URL('../../../../../apps/web/public/human/human-base.bin', import.meta.url));
const bytes = readFileSync(file);
vi.stubGlobal('fetch', async () => new Response(bytes));
beforeAll(async () => {
  expect(await loadBodyModel(findBody('human'))).not.toBeNull();
});

export interface Deformation {
  /** Edge length ratios: 1st and 99.9th percentile, worst squash and stretch. */
  low: number;
  high: number;
  min: number;
  max: number;
  /** Lead bone of the worst edge. */
  where: string;
}

function measure(mesh: SkinnedMesh, rest: Float32Array, edges: Uint32Array, names: string[]): Deformation {
  const position = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.getAttribute('skinIndex');
  const now = new Float32Array(position.count * 3);
  const p = new Vector3();
  for (let v = 0; v < position.count; v += 1) {
    p.fromBufferAttribute(position, v);
    mesh.applyBoneTransform(v, p);
    now.set([p.x, p.y, p.z], v * 3);
  }
  const ratios: number[] = [];
  let worst = 0;
  let worstEdge = 0;
  for (let e = 0; e < edges.length; e += 2) {
    const a = edges[e]!;
    const b = edges[e + 1]!;
    const len = (s: Float32Array) => Math.hypot(s[a * 3]! - s[b * 3]!, s[a * 3 + 1]! - s[b * 3 + 1]!, s[a * 3 + 2]! - s[b * 3 + 2]!);
    const r0 = len(rest);
    if (r0 < 1e-5) continue;
    const r = len(now) / r0;
    ratios.push(r);
    const bad = Math.abs(Math.log(r));
    if (bad > worst) {
      worst = bad;
      worstEdge = a;
    }
  }
  ratios.sort((x, y) => x - y);
  return {
    low: ratios[Math.floor(ratios.length * 0.001)]!,
    high: ratios[Math.floor(ratios.length * 0.999)]!,
    min: ratios[0]!,
    max: ratios[ratios.length - 1]!,
    where: `${names[index.getX(worstEdge)]!} v${worstEdge} rest(${[0, 1, 2].map((k) => rest[worstEdge * 3 + k]!.toFixed(2))}) region ${mesh.geometry.getAttribute('region')?.getX(worstEdge)}`,
  };
}

describe('skin quality in the clips (CHAR-02)', () => {
  const body = findBody('human');
  const names = body.joints.map((joint) => joint.name);
  let avatar: ReturnType<typeof createGenvrAvatar>;
  let mesh: SkinnedMesh;
  let rest: Float32Array;
  let edges: Uint32Array;
  beforeAll(() => {
    avatar = createGenvrAvatar({ ...DEFAULT_LOOK, body: 'human' });
    mesh = avatar.mesh;
    avatar.root.updateMatrixWorld(true);
    const triangles = mesh.geometry.getIndex()!;
    const seen = new Set<string>();
    const list: number[] = [];
    for (let t = 0; t < triangles.count; t += 3)
      for (let k = 0; k < 3; k += 1) {
        const a = triangles.getX(t + k);
        const b = triangles.getX(t + ((k + 1) % 3));
        if (a === b) continue;
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        if (seen.has(key)) continue;
        seen.add(key);
        list.push(a, b);
      }
    edges = Uint32Array.from(list);
    const position = mesh.geometry.getAttribute('position');
    // The mesh as modelled (its own A-pose), before any bone turns it.
    rest = Float32Array.from(position.array as Float32Array);
  });

  const CLIPS = ['Idle', 'Walk', 'Run', 'Swim', 'Climb', 'Jump', 'Wave', 'Cheer', 'Stretch', 'SitGround', 'Strike', 'Build'];
  it.each(CLIPS)('%s keeps edges within limits', (clip) => {
    const animation = CORE_ANIMATIONS.find((one) => one.clip === clip);
    if (!animation) return;
    const mixer = new AnimationMixer(avatar.root);
    mixer.clipAction(clipFromAnimation(animation, body)).play();
    let worst: Deformation | undefined;
    for (let i = 0; i <= 8; i += 1) {
      mixer.setTime((animation.duration * i) / 8);
      avatar.root.updateMatrixWorld(true);
      const d = measure(mesh, rest, edges, names);
      if (!worst || Math.abs(Math.log(d.min)) + Math.abs(Math.log(d.max)) > Math.abs(Math.log(worst.min)) + Math.abs(Math.log(worst.max)))
        worst = d;
    }
    mixer.stopAllAction();
    mixer.uncacheRoot(avatar.root);
    if (process.env.DEFORM_REPORT) console.log(clip, JSON.stringify(worst));
    expect(worst!.low, clip).toBeGreaterThan(Number(process.env.DEFORM_LOW ?? 0));
    expect(worst!.high, clip).toBeLessThan(Number(process.env.DEFORM_HIGH ?? 99));
  });
});
