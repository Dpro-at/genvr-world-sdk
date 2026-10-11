import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three/webgpu';
import { bindCanopyInstanceAttributes } from '../src/vegetation/canopy-instance.js';

describe('canopy item instance adapter', () => {
  it('combines authored shape and instance transform without normalizing source stretch', () => {
    const source = new BoxGeometry(),
      pose = source.clone(),
      material = new MeshBasicMaterial();
    const mesh = new InstancedMesh(pose, material, 2);
    mesh.count = 1;
    const original = new Matrix4().compose(
      new Vector3(3, 4, 5),
      new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.7),
      new Vector3(2, 3, 2),
    );
    mesh.setMatrixAt(0, original);
    mesh.instanceMatrix.needsUpdate = true;
    const binding = bindCanopyInstanceAttributes(mesh, source, {
      kind: 'shrub',
      appearanceSeed: 0.37,
      size: 1.2,
      stretch: 0.8,
    });
    expect(binding.update()).toBe(true);
    expect(binding.data[3]).toBeCloseTo(2.4);
    expect(binding.data[4]).toBeCloseTo(0.7);
    expect(binding.data[5]).toBeCloseTo(-1.2);
    expect(binding.data[6]).toBeCloseTo(1.6 * 1.2 * 0.8 * 3);
    expect(binding.data[7]).toBeCloseTo(0.37);
    expect(binding.data[24]).toBe(1);
    const matrix = new Matrix4().fromArray(binding.data, 8);
    const expected = original.clone().multiply(new Matrix4().makeScale(1.2, 0.96, 1.2));
    matrix.elements.forEach((value, i) => expect(value).toBeCloseTo(expected.elements[i]!, 5));
    const untouched = new Matrix4();
    mesh.getMatrixAt(0, untouched);
    untouched.elements.forEach((value, i) => expect(value).toBeCloseTo(original.elements[i]!, 6));
    expect(binding.update()).toBe(false);
    const disposed = vi.fn();
    mesh.geometry.addEventListener('dispose', disposed);
    binding.dispose();
    binding.dispose();
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(mesh.geometry).toBe(pose);
    expect(pose.getAttribute('iPos')).toBeUndefined();
    source.dispose();
    pose.dispose();
    material.dispose();
    mesh.dispose();
  });
  it('preserves unsupported authored transforms through the disabled shader flag', () => {
    const source = new BoxGeometry(),
      mesh = new InstancedMesh(source.clone(), new MeshBasicMaterial(), 3);
    const transforms = [
      new Matrix4().makeRotationX(0.4),
      new Matrix4().makeScale(-1, 1, 1),
      new Matrix4().makeScale(1, 1, 2),
    ];
    transforms.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    const binding = bindCanopyInstanceAttributes(mesh, source, {
      kind: 'tree',
      appearanceSeed: 0.5,
      size: 1,
      stretch: 1,
    });
    binding.update();
    for (let i = 0; i < 3; i++) expect(binding.data[i * 25 + 24]).toBe(0);
    binding.dispose();
    mesh.geometry.dispose();
    mesh.material.dispose();
    source.dispose();
    mesh.dispose();
  });
});
