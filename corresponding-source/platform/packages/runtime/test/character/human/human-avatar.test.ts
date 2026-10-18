import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AnimationMixer, Vector3, type SkinnedMesh } from 'three/webgpu';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CORE_ANIMATIONS, findBody } from '@genvr/core-library';
import { decodeHuman } from '../../../src/character/human/format.js';
import { animeShapeWeights, buildWeights, generateHuman } from '../../../src/character/human/generate.js';
import { HUMAN_FACE_LANDMARKS } from '@genvr/core-library';
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

  it('fits the skeleton and animation rest positions to a changed generated body', () => {
    const build = { muscle: .5, 'face.headLength': -.5, 'face.jawWidth': .4 };
    const changed = createGenvrAvatar({ ...DEFAULT_LOOK, body: 'human', animeShape: 1, build });
    const data = decodeHuman(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const expected = generateHuman(data, 'anime', 'boy', HUMAN_FACE_LANDMARKS, {
      ...animeShapeWeights(1), ...buildWeights(build),
    })!;
    changed.root.updateMatrixWorld(true);
    const rootPosition = changed.mesh.getWorldPosition(new Vector3());
    for (const joint of expected.joints) {
      // Compare rest pivots against helper positions fitted from the changed mesh.
      const actual = changed.mesh.skeleton.bones.find(one => one.name === body.bonePrefix + joint.name)!;
      expect(actual).toBeDefined();
      expect(actual.getWorldPosition(new Vector3()).sub(rootPosition).distanceTo(new Vector3(...joint.at))).toBeLessThan(.00001);
    }
    const expectedHips = expected.joints.find(one => one.name === 'Hips')!;
    const hips = changed.mesh.skeleton.bones.find(one => one.name.endsWith('Hips'))!;
    expect(hips.position.y).toBeCloseTo(expectedHips.at[1], 5);
    expect(changed.headTop).toBeCloseTo(expected.height, 5);
    changed.dispose();
  });

  it('updates brow and lash color with the existing hair color without replacing the mesh', () => {
    const look = { ...DEFAULT_LOOK, body: 'human' as const, hair: '#2b1d18' };
    const colored = createGenvrAvatar(look), original = colored.mesh;
    const uniforms = (original.material as import('three/webgpu').Material).userData.face;
    expect(uniforms.browColor.value.getHexString()).toBe('2b1d18');
    colored.setLook({ ...look, hair: '#794d31' });
    expect(colored.mesh).toBe(original);
    expect(uniforms.browColor.value.getHexString()).toBe('794d31');
    colored.dispose();
  });

  it('has nonempty finite expression geometry confined to the face', () => {
    const position = mesh.geometry.getAttribute('position');
    const shared = mesh.geometry.getAttribute('blink') as import('three/webgpu').InterleavedBufferAttribute;
    for (const name of ['faceSmile', 'faceAngry', 'faceSad', 'faceSurprised', 'faceThinking']) {
      const delta = mesh.geometry.getAttribute(name);
      expect(delta.count).toBe(position.count);
      expect((delta as import('three/webgpu').InterleavedBufferAttribute).data).toBe(shared.data);
      let changed = 0;
      for (let i = 0; i < delta.count; i++) {
        const length = Math.hypot(delta.getX(i), delta.getY(i), delta.getZ(i));
        expect(Number.isFinite(length)).toBe(true);
        if (length > 1e-8) {
          changed++;
          expect(position.getY(i)).toBeGreaterThan(1);
          expect(length).toBeLessThan(.15);
        }
      }
      expect(changed).toBeGreaterThan(10);
    }
  });

  it('keeps facial paint coordinates unchanged when editor positions are resized', () => {
    const geometry = mesh.geometry.clone();
    const position = geometry.getAttribute('position');
    const face = geometry.getAttribute('facePosition');
    const eyeVertex = Array.from({length: position.count}, (_, i) => i).find(i => position.getY(i) > 1.5)!;
    const before = face.getY(eyeVertex);
    position.setY(eyeVertex, position.getY(eyeVertex) * 1.2);
    expect(face.getY(eyeVertex)).toBe(before);
    expect(position.getY(eyeVertex)).not.toBe(before);
    geometry.dispose();
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
