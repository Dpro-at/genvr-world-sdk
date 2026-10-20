import { Bone, BufferAttribute, BufferGeometry, Group, MeshStandardMaterial, Skeleton, SkinnedMesh, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { canonicalCharacter } from '../studio/user-avatar-import';
it('normalizes numbered namespaces, duplicate hierarchy aliases and character height', () => {
  const root = new Group(), bones: Bone[] = [];
  const add = (name: string, parent?: Bone) => { const bone = new Bone(); bone.name = 'mixamorig12' + name; (parent ?? root).add(bone); bones.push(bone); return bone; };
  const hips = add('Hips'), alias = add('Hips', hips), spine = add('Spine', alias), spine1 = add('Spine1', spine), spine2 = add('Spine2', spine1), neck = add('Neck', spine2); add('Head', neck);
  for (const side of ['Left', 'Right']) {
    let parent = spine2; for (const part of ['Shoulder', 'Arm', 'ForeArm', 'Hand']) parent = add(side + part, parent);
    parent = hips; for (const part of ['UpLeg', 'Leg', 'Foot']) parent = add(side + part, parent);
  }
  const geometry = new BufferGeometry(); geometry.setAttribute('position', new BufferAttribute(new Float32Array([0,0,0, 1,0,0, 0,200,0]), 3));
  geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(12), 4)); geometry.setAttribute('skinWeight', new BufferAttribute(new Float32Array([1,0,0,0, 1,0,0,0, 1,0,0,0]), 4));
  const mesh = new SkinnedMesh(geometry, new MeshStandardMaterial()); root.add(mesh); root.updateMatrixWorld(true); mesh.bind(new Skeleton(bones));
  const character = canonicalCharacter(root);
  expect(character.height).toBe(1.8);
  expect(character.joints.filter(joint => joint.name === 'Hips')).toHaveLength(1);
  expect(character.joints.find(joint => joint.name === 'Spine')?.parent).toBe('Hips');
  expect(character.joints.every(joint => joint.parent !== joint.name)).toBe(true);
  const output = character.root.children[0] as SkinnedMesh;
  expect(output.geometry.getAttribute('position').getY(2)).toBeCloseTo(1.8);
});

/** A metre-scale humanoid whose arms hang `drop` degrees below the shoulder line; one vertex rides each hand. */
function humanoid(drop: number) {
  const root = new Group(), bones: Bone[] = [], world = new Map<Bone, Vector3>();
  const add = (name: string, at: [number, number, number], parent?: Bone) => {
    const bone = new Bone(); bone.name = name; const p = new Vector3(...at);
    bone.position.copy(parent ? p.clone().sub(world.get(parent)!) : p); (parent ?? root).add(bone); bones.push(bone); world.set(bone, p); return bone;
  };
  const hips = add('Hips', [0, 1, 0]), spine = add('Spine', [0, 1.1, 0], hips), spine1 = add('Spine1', [0, 1.2, 0], spine), spine2 = add('Spine2', [0, 1.3, 0], spine1);
  const neck = add('Neck', [0, 1.5, 0], spine2); add('Head', [0, 1.6, 0], neck);
  const r = drop * Math.PI / 180, hands: Bone[] = [];
  for (const [side, s] of [['Left', 1], ['Right', -1]] as const) {
    const step = (from: Vector3) => [from.x + s * .3 * Math.cos(r), from.y - .3 * Math.sin(r), 0] as [number, number, number];
    const shoulder = add(side + 'Shoulder', [s * .05, 1.45, 0], spine2), arm = add(side + 'Arm', [s * .15, 1.45, 0], shoulder);
    const fore = add(side + 'ForeArm', step(world.get(arm)!), arm); hands.push(add(side + 'Hand', step(world.get(fore)!), fore));
    const up = add(side + 'UpLeg', [s * .1, .95, 0], hips), leg = add(side + 'Leg', [s * .1, .5, 0], up); add(side + 'Foot', [s * .1, .05, 0], leg);
  }
  const head = bones.findIndex(bone => bone.name === 'Head'), foot = bones.findIndex(bone => bone.name === 'LeftFoot');
  const points = [world.get(hands[0]!)!, world.get(hands[1]!)!, new Vector3(0, 1.8, 0), new Vector3(.1, 0, 0)];
  const owners = [bones.indexOf(hands[0]!), bones.indexOf(hands[1]!), head, foot];
  const geometry = new BufferGeometry(); geometry.setAttribute('position', new BufferAttribute(new Float32Array(points.flatMap(p => p.toArray())), 3));
  geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(owners.flatMap(i => [i, 0, 0, 0])), 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(new Float32Array(owners.flatMap(() => [1, 0, 0, 0])), 4));
  const mesh = new SkinnedMesh(geometry, new MeshStandardMaterial()); root.add(mesh); root.updateMatrixWorld(true); mesh.bind(new Skeleton(bones));
  return root;
}
const joint = (character: ReturnType<typeof canonicalCharacter>, name: string) => character.joints.find((row: { name: string }) => row.name === name)!.at;

it('turns A-pose arms out to the T-pose the native clips start from', () => {
  const character = canonicalCharacter(humanoid(60));
  expect(character.restPose).toBe('t-from-a');
  for (const [side, s] of [['Left', 1], ['Right', -1]] as const) {
    const fore = joint(character, side + 'ForeArm'), hand = joint(character, side + 'Hand');
    expect(fore[0]).toBeCloseTo(s * .45, 4); expect(fore[1]).toBeCloseTo(1.45, 4); expect(fore[2]).toBeCloseTo(0, 4);
    expect(hand[0]).toBeCloseTo(s * .75, 4); expect(hand[1]).toBeCloseTo(1.45, 4);
  }
  const positions = (character.root.children[0] as SkinnedMesh).geometry.getAttribute('position');
  expect(positions.getX(0)).toBeCloseTo(.75, 4); expect(positions.getY(0)).toBeCloseTo(1.45, 4);
  expect(positions.getX(1)).toBeCloseTo(-.75, 4);
  expect(joint(character, 'LeftFoot')[1]).toBeCloseTo(.05, 4);
});

it('leaves T-pose and near-T arms exactly where they are', () => {
  for (const drop of [0, 15]) {
    const character = canonicalCharacter(humanoid(drop)), r = drop * Math.PI / 180;
    expect(character.restPose).toBeUndefined();
    const hand = joint(character, 'LeftHand');
    expect(hand[0]).toBeCloseTo(.15 + .6 * Math.cos(r), 6); expect(hand[1]).toBeCloseTo(1.45 - .6 * Math.sin(r), 6);
  }
});

it('combines a part with face morphs and a part without (hair added to a body)', () => {
  const root = humanoid(0), body = root.children.find(child => (child as SkinnedMesh).isSkinnedMesh) as SkinnedMesh;
  const hair = new SkinnedMesh(body.geometry.clone(), new MeshStandardMaterial()); root.add(hair); hair.bind(body.skeleton);
  body.geometry.morphAttributes.position = [body.geometry.getAttribute('position').clone()]; body.geometry.morphTargetsRelative = true;
  const output = canonicalCharacter(root).root.children[0] as SkinnedMesh;
  expect(output.geometry.getAttribute('position').count).toBe(8);
  expect(output.geometry.groups).toHaveLength(2);
});

it('keeps the face shapes (blend shapes) through the import, also when another part has none (FACE-IMPORT)', () => {
  const root = humanoid(0), face = root.children.find(child => (child as SkinnedMesh).isSkinnedMesh) as SkinnedMesh;
  // The head vertex opens its jaw 10 cm down; a hair part on the same skeleton has no shapes.
  const jaw = new BufferAttribute(new Float32Array(12), 3); jaw.setXYZ(2, 0, -.1, 0); jaw.name = 'jawOpen';
  face.geometry.morphAttributes.position = [jaw]; face.geometry.morphTargetsRelative = true; face.updateMorphTargets();
  const hairGeometry = face.geometry.clone(); hairGeometry.morphAttributes = {};
  const hair = new SkinnedMesh(hairGeometry, new MeshStandardMaterial()); root.add(hair); root.updateMatrixWorld(true); hair.bind(face.skeleton);
  const output = canonicalCharacter(root).root.children[0] as SkinnedMesh;
  expect(output.morphTargetDictionary).toEqual({ jawOpen: 0 });
  const shape = output.geometry.morphAttributes.position![0]!;
  expect(shape.count).toBe(8);
  expect(shape.getY(2)).toBeCloseTo(-.1, 4);
  expect(shape.getY(6)).toBe(0);
  expect(output.geometry.morphTargetsRelative).toBe(true);
});
