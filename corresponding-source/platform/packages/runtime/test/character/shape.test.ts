import { Bone, BufferAttribute, Matrix4, Quaternion, Skeleton, Vector3 } from 'three/webgpu';
import { CORE_ANIMATIONS, findBody } from '@genvr/core-library';
import { describe, expect, it } from 'vitest';
import { clipFromAnimation, createGenvrAvatar, DEFAULT_LOOK } from '../../src/avatar.js';
import {
  armsOnlyIndex,
  boneRoles,
  CHARACTER_VIEW_MODES,
  shapedBody,
  shapeSkin,
  viewModeSetup,
  type ShapeInput,
} from '../../src/character/index.js';

/** The shaping input of a freshly made avatar (bind data straight from its skeleton). */
function inputOf(body: 'starter' | 'classic') {
  const avatar = createGenvrAvatar({ ...DEFAULT_LOOK, body });
  const mesh = avatar.mesh;
  const skeleton = mesh.skeleton;
  const roles = boneRoles(findBody(body));
  const input: ShapeInput = {
    positions: mesh.geometry.getAttribute('position').array,
    skinIndex: mesh.geometry.getAttribute('skinIndex').array,
    skinWeight: mesh.geometry.getAttribute('skinWeight').array,
    bones: skeleton.bones.map((bone, i) => ({
      parent: skeleton.bones.indexOf(bone.parent as Bone),
      bind: skeleton.boneInverses[i]!.clone().invert(),
      rest: bone.position.clone(),
      role: roles[i]!,
    })),
  };
  return { avatar, input, roles, skeleton };
}

const span = (positions: ArrayLike<number>, axis: number) => {
  let min = Infinity;
  let max = -Infinity;
  for (let i = axis; i < positions.length; i += 3) {
    min = Math.min(min, positions[i]!);
    max = Math.max(max, positions[i]!);
  }
  return { min, max, size: max - min };
};

/** Horizontal width of the vertices bound mostly to one bone. */
function boneWidth(input: ShapeInput, positions: ArrayLike<number>, bone: number) {
  let min = Infinity;
  let max = -Infinity;
  for (let v = 0; v < positions.length / 3; v += 1)
    if (input.skinIndex[v * 4] === bone && input.skinWeight[v * 4]! > 0.5) {
      min = Math.min(min, positions[v * 3]!);
      max = Math.max(max, positions[v * 3]!);
    }
  return max - min;
}

describe('character shaping (CHAR-01)', () => {
  it('names the role of every joint of the 52-bone rig and of Classic', () => {
    const starter = boneRoles(findBody('starter'));
    const names = findBody('starter').joints.map((joint) => joint.name);
    const role = (name: string) => starter[names.indexOf(name)];
    expect(role('Hips')).toBe('spine');
    expect(role('Head')).toBe('head');
    expect(role('LeftArm')).toBe('arm');
    expect(role('LeftHandIndex2')).toBe('hand');
    expect(role('RightUpLeg')).toBe('leg');
    expect(role('RightToeBase')).toBe('foot');
    expect(role('Neck')).toBe('neck');
    const classic = boneRoles(findBody('classic'));
    expect(classic).toContain('arm');
    expect(classic).toContain('leg');
    expect(classic[findBody('classic').joints.findIndex((joint) => joint.name === 'Head')]).toBe('head');
  });

  it('changes nothing at the normal shape', () => {
    const { input } = inputOf('starter');
    const out = shapeSkin(input, { height: 1, weight: 1, scale: 1 });
    for (let i = 0; i < out.positions.length; i += 1)
      expect(out.positions[i]).toBeCloseTo(input.positions[i]!, 5);
    input.bones.forEach((bone, i) => {
      expect(out.rest[i]!.distanceTo(bone.rest)).toBeLessThan(1e-6);
      expect(out.bind[i]!.equals(bone.bind)).toBe(true);
    });
  });

  for (const body of ['starter', 'classic'] as const)
    it(`keeps the ${body} feet on the ground and the skeleton's hierarchy for every shape`, () => {
      const { input } = inputOf(body);
      const ground = span(input.positions, 1).min;
      for (const shape of [
        { height: 1.15, weight: 1, scale: 1 },
        { height: 0.85, weight: 1.35, scale: 1 },
        { height: 1, weight: 0.75, scale: 1.6 },
        { height: 1.1, weight: 1.2, scale: 0.6 },
      ]) {
        const out = shapeSkin(input, shape);
        expect(span(out.positions, 1).min).toBeCloseTo(ground * shape.scale, 4);
        expect(out.rest).toHaveLength(input.bones.length);
        expect(out.bind).toHaveLength(input.bones.length);
        // Rest links keep their direction (rotations and clips stay valid).
        input.bones.forEach((bone, i) => {
          if (bone.rest.length() < 1e-6 || bone.parent < 0) return;
          expect(out.rest[i]!.clone().normalize().dot(bone.rest.clone().normalize())).toBeCloseTo(1, 5);
        });
      }
    });

  it('height lengthens the body and keeps the head size; size scales it all', () => {
    const { input, roles } = inputOf('starter');
    const before = span(input.positions, 1).size;
    const tall = shapeSkin(input, { height: 1.1, weight: 1, scale: 1 });
    const grown = span(tall.positions, 1).size;
    expect(grown).toBeGreaterThan(before * 1.05);
    expect(grown).toBeLessThan(before * 1.1);
    const head = roles.indexOf('head');
    const headTop = (positions: ArrayLike<number>) => {
      let top = -Infinity;
      let low = Infinity;
      for (let v = 0; v < positions.length / 3; v += 1)
        if (roles[input.skinIndex[v * 4]!] === 'head' && input.skinWeight[v * 4]! > 0.5) {
          top = Math.max(top, positions[v * 3 + 1]!);
          low = Math.min(low, positions[v * 3 + 1]!);
        }
      return top - low;
    };
    expect(head).toBeGreaterThanOrEqual(0);
    expect(headTop(tall.positions)).toBeCloseTo(headTop(input.positions), 4);
    const big = shapeSkin(input, { height: 1, weight: 1, scale: 1.5 });
    expect(span(big.positions, 1).size).toBeCloseTo(before * 1.5, 3);
  });

  it('weight widens the torso without lengthening the legs', () => {
    const { input } = inputOf('classic');
    const names = findBody('classic').joints.map((joint) => joint.name);
    const torso = names.indexOf('UpperTorso');
    const heavy = shapeSkin(input, { height: 1, weight: 1.3, scale: 1 });
    expect(boneWidth(input, heavy.positions, torso)).toBeCloseTo(
      boneWidth(input, input.positions, torso) * 1.3,
      3,
    );
    expect(span(heavy.positions, 1).size).toBeCloseTo(span(input.positions, 1).size, 4);
  });

  it('shapes a model bound in its own pose (bind rotations) the same way', () => {
    // Two bones: a hip at 1 m and a leg bone turned 30 degrees in the bind pose, one vertex on each.
    const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 6);
    const hip = new Matrix4().makeTranslation(0, 1, 0);
    const leg = new Matrix4().compose(new Vector3(0.1, 0.5, 0), turn, new Vector3(1, 1, 1));
    const input: ShapeInput = {
      positions: [0, 1.1, 0, 0.12, 0, 0],
      skinIndex: [0, 0, 0, 0, 1, 0, 0, 0],
      skinWeight: [1, 0, 0, 0, 1, 0, 0, 0],
      bones: [
        { parent: -1, bind: hip, rest: new Vector3(0, 1, 0), role: 'spine' },
        { parent: 0, bind: leg, rest: new Vector3(0.1, -0.5, 0), role: 'leg' },
      ],
    };
    const out = shapeSkin(input, { height: 1.1, weight: 1, scale: 1 });
    const p = new Vector3();
    const q = new Quaternion();
    const s = new Vector3();
    out.bind[1]!.decompose(p, q, s);
    expect(q.angleTo(turn)).toBeLessThan(1e-6);
    // The ground vertex stays at y = 0; the hip rises by the leg's extra length.
    expect(out.minY.after).toBeCloseTo(0, 6);
    expect(out.rest[1]!.length()).toBeCloseTo(input.bones[1]!.rest.length() * 1.1, 6);
  });

  it('the shaped body plays every clip on the same bones, Hips drop scaled', () => {
    const { input } = inputOf('starter');
    const out = shapeSkin(input, { height: 1.1, weight: 1, scale: 1.2 });
    const body = shapedBody(findBody('starter'), out.rest, { height: 1.1, weight: 1, scale: 1.2 });
    expect(body.joints.map((joint) => joint.name)).toEqual(
      findBody('starter').joints.map((joint) => joint.name),
    );
    expect(body.joints[0]!.at[1]).toBeGreaterThan(findBody('starter').joints[0]!.at[1] * 1.2);
    for (const animation of CORE_ANIMATIONS) {
      const plain = clipFromAnimation(animation, findBody('starter'));
      const shaped = clipFromAnimation(animation, body);
      expect(shaped.tracks.map((track) => track.name)).toEqual(plain.tracks.map((track) => track.name));
    }
  });

  it('a reshaped skeleton stays bound: the rest pose matches the shaped vertices', () => {
    const { input, skeleton, avatar } = inputOf('starter');
    const out = shapeSkin(input, { height: 1.12, weight: 1.2, scale: 0.8 });
    skeleton.bones.forEach((bone, i) => {
      bone.position.copy(out.rest[i]!);
      skeleton.boneInverses[i]!.copy(out.bind[i]!).invert();
    });
    // At rest every bone world matrix equals its bind matrix, so skinning leaves the shaped vertices in place.
    avatar.mesh.position.set(0, 0, 0);
    avatar.mesh.updateMatrixWorld(true);
    const world = new Matrix4();
    skeleton.bones.forEach((bone, i) => {
      world.copy(bone.matrixWorld).multiply(skeleton.boneInverses[i]!);
      expect(new Vector3().setFromMatrixPosition(world).length()).toBeLessThan(1e-5);
    });
    expect(skeleton).toBeInstanceOf(Skeleton);
  });
});

describe('character view modes (CHAR-01)', () => {
  it('lists every mode with a setup', () => {
    expect(CHARACTER_VIEW_MODES).toEqual([
      'normal',
      'first-person',
      'skeleton',
      'skeleton-mesh',
      'wireframe',
      'clay',
      'normals',
      'muscles',
      'fat',
    ]);
    expect(viewModeSetup('first-person')).toEqual({ body: 'arms', bones: false, camera: 'eye' });
    expect(viewModeSetup('skeleton').body).toBe('none');
    expect(viewModeSetup('skeleton-mesh').bones).toBe(true);
    expect(viewModeSetup('normal').body).toBe('own');
  });

  it('first person keeps only arm and hand triangles', () => {
    const { input, roles, avatar } = inputOf('starter');
    const geometry = avatar.mesh.geometry;
    const index = armsOnlyIndex(
      geometry.index!.array,
      geometry.getAttribute('position').count,
      input.skinIndex,
      input.skinWeight,
      roles,
    );
    expect(index.length).toBeGreaterThan(0);
    expect(index.length).toBeLessThan(geometry.index!.count);
    for (const v of index) expect(['arm', 'hand']).toContain(roles[input.skinIndex[v * 4]!]);
    // A body without arms draws nothing in first person.
    expect(
      armsOnlyIndex(
        null,
        3,
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
        ['spine'],
      ),
    ).toHaveLength(0);
    expect(new BufferAttribute(index, 1).count).toBe(index.length);
  });
});
