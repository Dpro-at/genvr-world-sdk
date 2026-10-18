import { Bone, BufferAttribute, BufferGeometry, Group, MeshStandardMaterial, Skeleton, SkinnedMesh } from 'three';
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
