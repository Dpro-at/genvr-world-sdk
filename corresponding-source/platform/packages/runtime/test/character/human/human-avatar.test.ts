import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AnimationMixer, Vector3, type SkinnedMesh } from 'three/webgpu';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CORE_ANIMATIONS, findBody } from '@genvr/core-library';
import { clipFromAnimation, createGenvrAvatar, DEFAULT_LOOK, loadBodyModel } from '../../../src/avatar.js';

const file = fileURLToPath(new URL('../../../../../apps/web/public/human/human-base.bin', import.meta.url));

// The model must be fetched (from the file) before any avatar asks for it.
const bytes = readFileSync(file);
vi.stubGlobal('fetch', async () => new Response(bytes));
beforeAll(async () => {
  expect(await loadBodyModel(findBody('human'))).not.toBeNull();
});

/** The skinned (drawn) position of a vertex now. */
function skinned(mesh: SkinnedMesh, v: number): Vector3 {
  const p = new Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'), v);
  mesh.applyBoneTransform(v, p);
  return p.applyMatrix4(mesh.matrixWorld);
}

/** The vertices whose strongest bone is `bone`. */
function verticesOf(mesh: SkinnedMesh, bone: number): number[] {
  const index = mesh.geometry.getAttribute('skinIndex');
  const weight = mesh.geometry.getAttribute('skinWeight');
  const out: number[] = [];
  for (let v = 0; v < index.count; v += 1) if (index.getX(v) === bone && weight.getX(v) > 0.9) out.push(v);
  return out;
}

const centre = (mesh: SkinnedMesh, list: number[]) =>
  list.reduce((sum, v) => sum.add(skinned(mesh, v)), new Vector3()).divideScalar(list.length);

describe('generated body on the game avatar (CHAR-02)', () => {
  let avatar: ReturnType<typeof createGenvrAvatar>;
  let mesh: SkinnedMesh;
  beforeAll(() => {
    avatar = createGenvrAvatar({ ...DEFAULT_LOOK, body: 'human' });
    mesh = avatar.mesh;
  });
  const body = findBody('human');
  const bone = (name: string) => body.joints.findIndex((joint) => joint.name === name);
  const jointAt = (name: string) => {
    avatar.root.updateMatrixWorld(true);
    return mesh.skeleton.bones[bone(name)]!.getWorldPosition(new Vector3());
  };

  it('wears the generated mesh with 52 bones', () => {
    expect(avatar.body).toBe('human');
    expect(mesh.skeleton.bones).toHaveLength(52);
  });

  it('left-side vertices follow only left bones, right-side only right bones', () => {
    const names = body.joints.map((joint) => joint.name);
    const position = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.getAttribute('skinIndex');
    const weight = mesh.geometry.getAttribute('skinWeight');
    for (let v = 0; v < position.count; v += 1) {
      const x = position.getX(v);
      if (Math.abs(x) < 0.12) continue;
      for (let k = 0; k < 4; k += 1) {
        if (weight.getComponent(v, k) < 0.05) continue;
        const name = names[index.getComponent(v, k)]!;
        if (x > 0) expect(name.startsWith('Right'), `vertex ${v} at x ${x} on ${name}`).toBe(false);
        else expect(name.startsWith('Left'), `vertex ${v} at x ${x} on ${name}`).toBe(false);
      }
    }
  });

  it('at the T-pose rest, hand vertices sit at the hand joints (left on +x)', () => {
    avatar.root.updateMatrixWorld(true);
    for (const side of ['Left', 'Right']) {
      const hand = centre(mesh, verticesOf(mesh, bone(`${side}Hand`)));
      expect(hand.distanceTo(jointAt(`${side}Hand`))).toBeLessThan(0.07);
      expect(Math.sign(hand.x)).toBe(side === 'Left' ? 1 : -1);
    }
  });

  it.each(['Idle', 'Wave', 'Walk', 'Cheer'])('in %s the hands and feet stay with their joints', (name) => {
    const animation = CORE_ANIMATIONS.find((one) => one.clip === name)!;
    const mixer = new AnimationMixer(avatar.root);
    mixer.clipAction(clipFromAnimation(animation, body)).play();
    for (const t of [0, animation.duration * 0.37, animation.duration * 0.71]) {
      mixer.setTime(t);
      avatar.root.updateMatrixWorld(true);
      for (const part of ['LeftHand', 'RightHand', 'LeftFoot', 'RightFoot', 'LeftForeArm', 'RightForeArm']) {
        const list = verticesOf(mesh, bone(part));
        expect(list.length, part).toBeGreaterThan(5);
        const parent = body.joints.find((joint) => joint.name === part)!.parent!;
        // The bone's vertices stay near the segment from this joint toward its parent's joint.
        const a = jointAt(part);
        const tip = centre(mesh, list);
        expect(tip.distanceTo(a), `${name} ${part} at ${t.toFixed(2)}`).toBeLessThan(0.16);
        void parent;
      }
    }
    mixer.stopAllAction();
    mixer.uncacheRoot(avatar.root);
  });

  it('turning a limb bone moves its vertices the way the bone tip moves', () => {
    for (const name of ['LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftUpLeg', 'RightUpLeg']) {
      const b = mesh.skeleton.bones[bone(name)]!;
      const child = b.children.find((one) => (one as { isBone?: boolean }).isBone)!;
      const list = verticesOf(mesh, bone(name));
      avatar.root.updateMatrixWorld(true);
      const tipBefore = child.getWorldPosition(new Vector3());
      const before = centre(mesh, list);
      b.rotation.set(0.4, 0.3, 0.5);
      avatar.root.updateMatrixWorld(true);
      const tipMove = child.getWorldPosition(new Vector3()).sub(tipBefore);
      const move = centre(mesh, list).sub(before);
      b.rotation.set(0, 0, 0);
      expect(move.normalize().dot(tipMove.normalize()), name).toBeGreaterThan(0.8);
    }
  });
});

describe('shoulders follow raised arms (CHAR-02)', () => {
  const cheer = CORE_ANIMATIONS.find((animation) => animation.clip === 'Cheer')!;
  const shoulderTrack = (bodyId: string) =>
    clipFromAnimation(cheer, findBody(bodyId)).tracks.find((track) => /LeftShoulder\.quaternion$/.test(track.name));

  it('lifts the collarbone of a body that has one', () => {
    const track = shoulderTrack('human');
    expect(track).toBeDefined();
    // Some key turns the shoulder (raised arms), the rest key does not.
    const turned = Array.from({ length: track!.times.length }, (_, i) => 1 - Math.abs(track!.values[i * 4 + 3]!));
    expect(Math.max(...turned)).toBeGreaterThan(1e-3);
  });

  it('keeps the arm pointing where the clip says', async () => {
    const { Euler, Quaternion } = await import('three/webgpu');
    const body = findBody('human');
    const clip = clipFromAnimation(cheer, body);
    const quaternionAt = (bone: string, key: number) => {
      const track = clip.tracks.find((t) => t.name.endsWith(`${bone}.quaternion`))!;
      return new Quaternion().fromArray(Array.from(track.values.slice(key * 4, key * 4 + 4)));
    };
    const [, pose] = cheer.keys[1]!;
    const [x, y, z] = pose.LeftArm!.map((d) => (d * Math.PI) / 180) as [number, number, number];
    const wanted = new Vector3(1, 0, 0).applyQuaternion(new Quaternion().setFromEuler(new Euler(x, y, z, 'XYZ')));
    const got = new Vector3(1, 0, 0).applyQuaternion(quaternionAt('LeftShoulder', 1).multiply(quaternionAt('LeftArm', 1)));
    expect(got.distanceTo(wanted)).toBeLessThan(1e-4);
  });
});
