import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, DataTexture, DirectionalLight, InstancedMesh, Matrix4, MeshBasicMaterial, TSL, Vector2, Vector3 } from 'three/webgpu';
import { PalmWorldBindings } from '../src/vegetation/palm-bindings.js';

function fixture() {
  const detail = new DataTexture(), sun = new DirectionalLight();
  const wind = { detail, gustOffset: TSL.uniform(new Vector2()), windDirection: TSL.uniform(new Vector2(1, 0)), windSpeed: TSL.uniform(7) };
  const world = { wind, sun, time: TSL.uniform(0), mainCamera: TSL.uniform(new Vector3()), frame: TSL.uniform(0, 'uint'), sunDirection: TSL.uniform(new Vector3(1, 1, 0).normalize()), night: TSL.uniform(0) };
  const source = new BoxGeometry(), geometry = source.clone(), material = new MeshBasicMaterial();
  const part = { geometry, material, matrix: new Matrix4() };
  const owner = new PalmWorldBindings(world);
  const definition = { height: 8, seed: .37, lean: .12, leanAngle: .3 };
  return { detail, world, source, part, owner, definition };
}

describe('per-world palm material ownership', () => {
  it('keeps previews static and shares a live material only inside one world', () => {
    const f = fixture();
    const prepared = f.owner.prepare(f.part, f.source, f.definition, [0, 120, 120]);
    const second = f.owner.prepare(f.part, f.source, f.definition, [0, 120, 120]);
    expect(prepared.material).toBe(f.part.material);
    expect(prepared.geometry).toBe(f.part.geometry);
    expect(f.part).not.toHaveProperty('setupInstance');
    const a = new InstancedMesh(prepared.geometry, prepared.material, 1), b = new InstancedMesh(second.geometry, second.material, 1);
    const releaseA = prepared.setupInstance!(a)!, releaseB = second.setupInstance!(b)!;
    expect(a.material).not.toBe(f.part.material); expect(a.material).toBe(b.material);
    expect(a.geometry).not.toBe(b.geometry);
    const other = new PalmWorldBindings(f.world), alternate = other.prepare(f.part, f.source, f.definition, [0, 120, 120]);
    const c = new InstancedMesh(alternate.geometry, alternate.material, 1);
    alternate.setupInstance!(c);
    expect(c.material).not.toBe(a.material);
    releaseA(); releaseB(); f.owner.dispose(); other.dispose();
  });
  it('releases its resources once and never disposes the borrowed provider or static model', () => {
    const f = fixture(), prepared = f.owner.prepare(f.part, f.source, f.definition, [120, 2600, 2800], false);
    const mesh = new InstancedMesh(prepared.geometry, prepared.material, 1); mesh.castShadow = true;
    const release = prepared.setupInstance!(mesh)!;
    expect(mesh.castShadow).toBe(false);
    const owned = vi.fn(), borrowed = vi.fn();
    const material = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
    material.addEventListener('dispose', owned);
    f.detail.addEventListener('dispose', borrowed); f.source.addEventListener('dispose', borrowed);
    f.part.geometry.addEventListener('dispose', borrowed); f.part.material.addEventListener('dispose', borrowed);
    f.owner.dispose(); release(); f.owner.dispose();
    expect(owned).toHaveBeenCalledTimes(1); expect(borrowed).not.toHaveBeenCalled();
    expect(mesh.material).toBe(f.part.material); expect(mesh.geometry).toBe(f.part.geometry); expect(mesh.castShadow).toBe(true);
    expect(() => prepared.setupInstance!(mesh)).toThrow('disposed');
  });
  it('separates near/far graphs and rejects incompatible bindings before replacing anything', () => {
    const f = fixture();
    const near = f.owner.prepare(f.part, f.source, f.definition, [0, 120, 120]);
    const far = f.owner.prepare(f.part, f.source, f.definition, [120, 2600, 2800], false);
    const a = new InstancedMesh(near.geometry, near.material, 1), b = new InstancedMesh(far.geometry, far.material, 1);
    near.setupInstance!(a); far.setupInstance!(b);
    expect(a.material).not.toBe(b.material);
    expect(() => f.owner.prepare(near, f.source, f.definition, [0, 120, 120])).toThrow('already');
    expect(() => f.owner.prepare(f.part, f.source, f.definition, [120, 10, 20])).toThrow('range');
    expect(() => f.owner.prepare(f.part, f.source, { ...f.definition, height: NaN }, [0, 120, 120])).toThrow('definition');
    f.owner.dispose();
  });
});
