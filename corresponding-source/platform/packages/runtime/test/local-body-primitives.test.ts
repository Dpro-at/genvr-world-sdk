import { Bone, BufferAttribute, BufferGeometry, Group, MeshStandardMaterial, Skeleton, SkinnedMesh } from 'three/webgpu';
import { expect, it } from 'vitest';
import { findBody } from '@genvr/core-library';
import { mergeLocalBodyPrimitives } from '../src/avatar.js';
it('keeps all imported material primitives and removes unused shared vertices', () => {
  const body = findBody('starter')!, scene = new Group();
  for (const offset of [0, 10]) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([offset,0,0, offset+1,0,0, offset,1,0, 999,999,999]), 3));
    geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(16), 4));
    geometry.setAttribute('skinWeight', new BufferAttribute(new Float32Array([1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0]), 4));
    geometry.setIndex([0,1,2]);
    const mesh = new SkinnedMesh(geometry, new MeshStandardMaterial()), bone = new Bone(); bone.name = 'mixamorigHips'; mesh.add(bone); mesh.bind(new Skeleton([bone])); scene.add(mesh);
  }
  const model = mergeLocalBodyPrimitives(body, scene);
  expect(model.geometry.getAttribute('position').count).toBe(6);
  expect(model.geometry.getAttribute('position').getX(3)).toBe(10);
  expect(model.geometry.groups).toEqual([{ start: 0, count: 3, materialIndex: 0 }, { start: 3, count: 3, materialIndex: 1 }]);
  expect(model.material).toHaveLength(2);
});
it('keeps the face shapes of one primitive beside a primitive without shapes, with the mouth table (FACE-IMPORT)', () => {
  const body = findBody('starter')!, scene = new Group();
  for (const shapes of [['jawOpen', 'mouthFunnel', 'mouthSmileLeft'], []]) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([0,0,0, 1,0,0, 0,1,0]), 3));
    geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(12), 4));
    geometry.setAttribute('skinWeight', new BufferAttribute(new Float32Array([1,0,0,0,1,0,0,0,1,0,0,0]), 4));
    geometry.morphAttributes.position = shapes.map((name, i) => { const a = new BufferAttribute(new Float32Array(9), 3); a.setY(0, -(i + 1) / 10); a.name = name; return a; });
    geometry.morphTargetsRelative = true;
    const mesh = new SkinnedMesh(geometry, new MeshStandardMaterial()), bone = new Bone(); bone.name = 'mixamorigHips'; mesh.add(bone); mesh.bind(new Skeleton([bone])); mesh.updateMorphTargets(); scene.add(mesh);
  }
  const model = mergeLocalBodyPrimitives(body, scene);
  expect(model.morphs).toEqual({ jawOpen: 0, mouthFunnel: 1, mouthSmileLeft: 2 });
  expect(model.geometry.morphTargetsRelative).toBe(true);
  expect(model.geometry.morphAttributes.position!.map(a => [a.count, a.getY(0), a.getY(3)])).toEqual([[6, expect.closeTo(-0.1), 0], [6, expect.closeTo(-0.2), 0], [6, expect.closeTo(-0.3), 0]]);
  expect(model.mouth?.D.length).toBeGreaterThan(0);
});
