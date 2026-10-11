import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AnimationMixer, Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import { beforeAll, expect, it, vi } from 'vitest';
import { CORE_ANIMATIONS, findBody } from '@genvr/core-library';
import { clipFromAnimation, createGenvrAvatar, DEFAULT_LOOK, loadBodyModel } from '../../../src/avatar.js';
import { DQS_SHARE } from '../../../src/character/dual-quaternion-skinning.js';
const bytes = readFileSync(fileURLToPath(new URL('../../../../../apps/web/public/human/human-base.bin', import.meta.url)));
vi.stubGlobal('fetch', async () => new Response(bytes));
beforeAll(async () => void (await loadBodyModel(findBody('human'))));

/**
 * Shoulder volume (owner, CHAR-02: "the shoulder gets smaller when he moves"). Linear blend skinning thins the upper
 * arm near the shoulder when the arm goes up (Climb about 0.71 of its thickness); the body draws with dual quaternion
 * skinning blended with the linear blend (DQS_SHARE) (`character/dual-quaternion-skinning.ts`; pure dual
 * quaternions swelled the shoulder when the arms went straight up), whose math is repeated here on the CPU: the
 * drawn thickness must stay between 0.72 and 1.12. Run with DEFORM_REPORT=1 to print both.
 */
it('dual quaternion skinning keeps the shoulder thickness', () => {
  const body = findBody('human');
  const avatar = createGenvrAvatar({ ...DEFAULT_LOOK, body: 'human' });
  const mesh = avatar.mesh;
  const g = mesh.geometry;
  const pos = g.getAttribute('position');
  const si = g.getAttribute('skinIndex');
  const sw = g.getAttribute('skinWeight');
  const tri = g.getIndex()!;
  const edges: number[] = [];
  const seen = new Set<string>();
  for (let t = 0; t < tri.count; t += 3)
    for (let k = 0; k < 3; k++) {
      const a = tri.getX(t + k), b = tri.getX(t + ((k + 1) % 3));
      if (a === b) continue;
      const key = a < b ? a + ',' + b : b + ',' + a;
      if (!seen.has(key)) { seen.add(key); edges.push(a, b); }
    }
  const names = body.joints.map((j) => j.name);
  const shoulderZone = (v: number) => {
    for (let k = 0; k < 4; k++) { const n = names[si.getComponent(v, k)]!; if (sw.getComponent(v, k) > 0.1 && /Shoulder|Arm$|Spine2/.test(n)) return true; }
    return false;
  };
  for (const clip of ['Climb', 'Stretch', 'Swim', 'Cheer', 'Walk', 'SitGround']) {
    const animation = CORE_ANIMATIONS.find((a) => a.clip === clip)!;
    const mixer = new AnimationMixer(avatar.root);
    mixer.clipAction(clipFromAnimation(animation, body)).play();
    const stats = { lbs: [] as number[], dqs: [] as number[] };
    for (let i = 0; i <= 6; i++) {
      mixer.setTime((animation.duration * i) / 6);
      avatar.root.updateMatrixWorld(true);
      mesh.skeleton.update();
      // skin transforms in mesh space
      const inv = mesh.bindMatrixInverse, bm = mesh.bindMatrix;
      const mats = mesh.skeleton.bones.map((_, b) => new Matrix4().fromArray(mesh.skeleton.boneMatrices, b * 16).premultiply(inv).multiply(bm));
      const dq = mats.map((m) => {
        const q = new Quaternion(), t = new Vector3(), s = new Vector3();
        m.decompose(t, q, s);
        const d = new Quaternion(t.x, t.y, t.z, 0).multiply(q); // dual part *2
        return { q, d: [d.x * 0.5, d.y * 0.5, d.z * 0.5, d.w * 0.5] };
      });
      const lbs = new Float32Array(pos.count * 3), dqs = new Float32Array(pos.count * 3);
      const p = new Vector3();
      for (let v = 0; v < pos.count; v++) {
        p.fromBufferAttribute(pos, v);
        const l = new Vector3();
        let r = [0, 0, 0, 0], du = [0, 0, 0, 0];
        const q0 = dq[si.getX(v)]!.q;
        for (let k = 0; k < 4; k++) {
          const w = sw.getComponent(v, k); if (!w) continue;
          const b = si.getComponent(v, k);
          l.add(p.clone().applyMatrix4(mats[b]!).multiplyScalar(w));
          const { q, d } = dq[b]!;
          const s = q.x * q0.x + q.y * q0.y + q.z * q0.z + q.w * q0.w < 0 ? -w : w;
          r = [r[0]! + q.x * s, r[1]! + q.y * s, r[2]! + q.z * s, r[3]! + q.w * s];
          du = [du[0]! + d[0]! * s, du[1]! + d[1]! * s, du[2]! + d[2]! * s, du[3]! + d[3]! * s];
        }
        const n = Math.hypot(...r);
        const rq = new Quaternion(r[0]! / n, r[1]! / n, r[2]! / n, r[3]! / n);
        const dd = new Quaternion(du[0]! / n, du[1]! / n, du[2]! / n, du[3]! / n);
        // translation = 2 * d * conj(r)
        const tq = dd.clone().multiply(rq.clone().conjugate());
        const out = p.clone().applyQuaternion(rq).add(new Vector3(tq.x * 2, tq.y * 2, tq.z * 2));
        lbs.set(l.toArray(), v * 3); dqs.set(out.toArray(), v * 3);
      }
      {
        // Upper-arm thickness near the shoulder: mean distance of blend-zone vertices to the arm bone line.
        const ia = names.indexOf('LeftArm'), ib = names.indexOf('LeftForeArm');
        const jointRest = (j: number) => new Vector3().setFromMatrixPosition(mesh.skeleton.boneInverses[j]!.clone().invert().premultiply(inv));
        const jointNow = (j: number) => new Vector3().setFromMatrixPosition(mesh.skeleton.bones[j]!.matrixWorld.clone().premultiply(inv));
        const radius = (pt: Vector3, a: Vector3, b: Vector3) => {
          const d = b.clone().sub(a).normalize();
          const ap = pt.clone().sub(a);
          return ap.sub(d.multiplyScalar(ap.dot(d))).length();
        };
        const ra = jointRest(ia), rb = jointRest(ib), na = jointNow(ia), nb = jointNow(ib);
        let n = 0, r0 = 0, rl = 0, rd = 0;
        for (let v = 0; v < pos.count; v++) {
          let wa = 0;
          for (let k = 0; k < 4; k++) if (si.getComponent(v, k) === ia) wa += sw.getComponent(v, k);
          if (wa < 0.3 || wa > 0.85) continue;
          const pr = new Vector3().fromBufferAttribute(pos, v);
          const along = pr.clone().sub(ra).dot(rb.clone().sub(ra).normalize());
          if (along < -0.02 || along > 0.12) continue;
          n++;
          r0 += radius(pr, ra, rb);
          rl += radius(new Vector3().fromArray(lbs, v * 3), na, nb);
          rd += radius(new Vector3().fromArray(dqs, v * 3), na, nb);
        }
        (stats as Record<string, number[]>)['thick'] ??= [];
        (stats as Record<string, number[]>)['thick']!.push(rl / r0, rd / r0);
        if (process.env.DEFORM_REPORT) console.log('THICK', clip, i, (rl / r0).toFixed(3), (rd / r0).toFixed(3));
        // Drawn: DQS_SHARE of dual quaternions, the rest linear blend (pure dual quaternions bulged the shoulder).
        const drawn = (rl / r0) * (1 - DQS_SHARE) + (rd / r0) * DQS_SHARE;
        expect(drawn, `${clip} at ${i}/6`).toBeGreaterThan(0.72);
        expect(drawn, `${clip} at ${i}/6`).toBeLessThan(1.12);
      }
      for (const [name, arr] of [['lbs', lbs], ['dqs', dqs]] as const) {
        let worst = 0;
        const rs: number[] = [];
        for (let e = 0; e < edges.length; e += 2) {
          const a = edges[e]!, b = edges[e + 1]!;
          if (!shoulderZone(a)) continue;
          const len = (s: ArrayLike<number>) => Math.hypot(s[a * 3]! - s[b * 3]!, s[a * 3 + 1]! - s[b * 3 + 1]!, s[a * 3 + 2]! - s[b * 3 + 2]!);
          const r0 = len(pos.array); if (r0 < 1e-5) continue;
          const r1 = Math.abs(Math.log(len(arr) / r0)); rs.push(r1); worst = Math.max(worst, r1);
        }
        rs.sort((x, y) => x - y);
        stats[name].push(rs[Math.floor(rs.length * 0.99)]!);
      }
    }
    if (process.env.DEFORM_REPORT) console.log(clip, 'shoulder p99 |log ratio| lbs', Math.max(...stats.lbs).toFixed(3), 'dqs', Math.max(...stats.dqs).toFixed(3));
    mixer.stopAllAction(); mixer.uncacheRoot(avatar.root);
  }
}, 60_000);
