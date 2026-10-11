import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three/webgpu';
import { bindPalmInstanceAttributes } from '../src/vegetation/instance-attributes.js';

function fixture() {
  const source = new BoxGeometry(), pose = source.clone();
  const mesh = new InstancedMesh(pose, new MeshBasicMaterial(), 2);
  mesh.count = 1;
  const binding = bindPalmInstanceAttributes(mesh, source, { height: 8, seed: .37, lean: .12, leanAngle: .3 });
  return { source, pose, mesh, binding };
}
const transform = (scale = new Vector3(2, 2, 2), axis = new Vector3(0, 1, 0)) =>
  new Matrix4().compose(new Vector3(3, 4, 5), new Quaternion().setFromAxisAngle(axis, .7), scale);

describe('palm ItemsView instance bindings', () => {
  it('preserves authoritative matrices and packs source dimensions without modifying shared geometry', () => {
    const f = fixture(), matrix = transform();
    f.mesh.setMatrixAt(0, matrix); f.mesh.instanceMatrix.needsUpdate = true;
    expect(f.binding.update()).toBe(true);
    expect(Array.from(f.binding.data.slice(0, 4))).toEqual([3, 4, 5, 2]);
    expect(f.binding.data[4]).toBeCloseTo(-.4);
    const rotatedLean = new Vector3(Math.cos(.3), 0, Math.sin(.3))
      .applyQuaternion(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), .7));
    expect(Math.cos(f.binding.data[4]!)).toBeCloseTo(rotatedLean.x);
    expect(Math.sin(f.binding.data[4]!)).toBeCloseTo(rotatedLean.z);
    expect(f.binding.data[6]).toBe(16);
    expect(f.binding.data[24]).toBe(1);
    expect(Array.from(f.binding.data.slice(8, 24))).toEqual(Array.from(f.mesh.instanceMatrix.array.slice(0, 16)));
    expect(f.pose.getAttribute('iPos')).toBeUndefined();
    expect(f.source.getAttribute('twPalmSourceNormal')).toBeUndefined();
    const version = f.binding.buffer.version;
    expect(f.binding.update()).toBe(false);
    expect(f.binding.buffer.version).toBe(version);
    f.mesh.count = 2;
    expect(f.binding.update()).toBe(true);
    f.binding.dispose();
  });
  it.each([
    [new Vector3(1, 2, 1), new Vector3(0, 1, 0)],
    [new Vector3(1, 1, 1), new Vector3(1, 0, 0)],
    [new Vector3(-1, 1, 1), new Vector3(0, 1, 0)],
  ])('selects a static pose for unsupported transforms and retains their matrix', (scale, axis) => {
    const f = fixture(); f.mesh.setMatrixAt(0, transform(scale, axis));
    f.binding.update();
    expect(f.binding.data[24]).toBe(0);
    expect(Array.from(f.binding.data.slice(8, 24))).toEqual(Array.from(f.mesh.instanceMatrix.array.slice(0, 16)));
    f.binding.dispose();
  });
  it('restores batch-owned state once without disposing borrowed geometry', () => {
    const f = fixture(), owned = f.mesh.geometry;
    const ownDispose = vi.fn(), borrowedDispose = vi.fn();
    owned.addEventListener('dispose', ownDispose); f.pose.addEventListener('dispose', borrowedDispose);
    expect(f.mesh.frustumCulled).toBe(false);
    f.binding.dispose(); f.binding.dispose();
    expect(f.mesh.geometry).toBe(f.pose);
    expect(f.mesh.frustumCulled).toBe(true);
    expect(ownDispose).toHaveBeenCalledTimes(1);
    expect(borrowedDispose).not.toHaveBeenCalled();
    expect(f.binding.update()).toBe(false);
  });
  it('refreshes visible and shadow passes and restores existing callbacks', () => {
    const source = new BoxGeometry(), mesh = new InstancedMesh(source.clone(), new MeshBasicMaterial(), 1);
    const visible = vi.fn(), shadow = vi.fn();
    mesh.onBeforeRender = visible; mesh.onBeforeShadow = shadow;
    const binding = bindPalmInstanceAttributes(mesh, source, { height: 8, seed: 0, lean: 0, leanAngle: 0 });
    mesh.setMatrixAt(0, transform()); mesh.instanceMatrix.needsUpdate = true;
    // The old callbacks accept no arguments; only binding lifecycle is exercised here.
    Reflect.apply(mesh.onBeforeShadow, mesh, []);
    expect(binding.data[0]).toBe(3); expect(shadow).toHaveBeenCalledOnce();
    mesh.setMatrixAt(0, new Matrix4().makeTranslation(9, 0, 0)); mesh.instanceMatrix.needsUpdate = true;
    Reflect.apply(mesh.onBeforeRender, mesh, []);
    expect(binding.data[0]).toBe(9); expect(visible).toHaveBeenCalledOnce();
    binding.dispose();
    expect(mesh.onBeforeRender).toBe(visible); expect(mesh.onBeforeShadow).toBe(shadow);
  });
  it('rejects invalid definitions, nonfinite matrices and capacity overflow', () => {
    const f = fixture();
    expect(() => bindPalmInstanceAttributes(f.mesh, f.source, { height: 0, seed: 0, lean: 0, leanAngle: 0 })).toThrow('definition');
    const matrix = new Matrix4(); matrix.elements[0] = NaN;
    f.mesh.setMatrixAt(0, matrix);
    expect(f.binding.update).toThrow('finite');
    f.mesh.count = 3;
    expect(f.binding.update).toThrow('capacity');
    f.binding.dispose();
  });
});
