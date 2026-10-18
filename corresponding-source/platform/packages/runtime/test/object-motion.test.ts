import { expect, it } from 'vitest';
import { Bone, Matrix4, Object3D, Vector3 } from 'three/webgpu';
import { ObjectMotionHistory } from '../src/post/object-motion.js';

it('keeps the previous object transform across multiple render passes', () => {
  const history = new ObjectMotionHistory(), object = new Object3D();
  object.updateMatrixWorld();
  expect(history.previous(object, 1).equals(new Matrix4())).toBe(true);
  object.position.x = 2; object.updateMatrixWorld();
  expect(new Vector3().setFromMatrixPosition(history.previous(object, 2)).x).toBe(0);
  expect(new Vector3().setFromMatrixPosition(history.previous(object, 2)).x).toBe(0);
  expect(new Vector3().setFromMatrixPosition(history.previous(object, 3)).x).toBe(2);
});
it('does not turn a stationary skeletal pose into object motion', () => {
  const history = new ObjectMotionHistory(), object = new Object3D(), bone = new Bone();
  object.position.set(2, 3, 4); object.add(bone); object.updateMatrixWorld();
  history.previous(object, 1);
  bone.rotation.z = 1; object.updateMatrixWorld();
  const previous = history.previous(object, 2);
  const deformed = new Vector3(.3, .7, .1);
  expect(deformed.clone().applyMatrix4(previous).distanceTo(deformed.clone().applyMatrix4(object.matrixWorld))).toBe(0);
  const second = new Object3D(); second.position.x = 8; second.updateMatrixWorld();
  expect(new Vector3().setFromMatrixPosition(history.previous(second, 2)).x).toBe(8);
});
