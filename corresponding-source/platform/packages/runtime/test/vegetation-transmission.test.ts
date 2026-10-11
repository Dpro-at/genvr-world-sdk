import { describe, it, expect } from 'vitest';
import { DirectionalLight, MeshPhysicalNodeMaterial } from 'three/webgpu';
import { registerPlantTransmission, copyPlantTransmission } from '../src/vegetation/transmission.js';
/* eslint-disable @typescript-eslint/no-explicit-any -- isolated lighting-model protocol probe */
class Scalar {
  constructor(readonly value: number) {}
  mul(other: Scalar): Scalar { return new Scalar(this.value * other.value); }
}
function fixture() {
  const source = new MeshPhysicalNodeMaterial(), target = source.clone(), sun = new DirectionalLight();
  let baseCalls = 0;
  const original = () => ({ direct: () => { baseCalls++; } });
  target.setupLightingModel = original as any;
  const run = (light = sun) => {
    let added = 0;
    const model: any = (target as any).setupLightingModel({});
    model.direct({ lightNode: { light }, lightColor: new Scalar(5),
      reflectedLight: { directDiffuse: { addAssign: (v: Scalar) => { added += v.value; } } } }, {});
    return added;
  };
  return { source, target, sun, original, run, calls: () => baseCalls };
}
describe('plant sun transmission through cloned materials', () => {
  it('is opt-in, preserves the base model and applies terrain visibility exactly once', () => {
    const f = fixture();
    expect(copyPlantTransmission(f.source, f.target, f.sun)).toBeNull();
    registerPlantTransmission(f.source, new Scalar(2));
    copyPlantTransmission(f.source, f.target, f.sun, new Scalar(.25));
    expect(f.run()).toBe(2.5);
    expect(f.run(new DirectionalLight())).toBe(0);
    expect(f.calls()).toBe(2);
  });
  it('can transfer a registered clone and fully suppress terrain-shadowed transmission', () => {
    const f = fixture();
    registerPlantTransmission(f.source, new Scalar(2));
    copyPlantTransmission(f.source, f.target, f.sun);
    const next = fixture();
    copyPlantTransmission(f.target, next.target, next.sun, new Scalar(0));
    expect(next.run()).toBe(0);
    expect(next.calls()).toBe(1);
  });
  it('reinstallation does not double add and a stale restore cannot remove the current hook', () => {
    const f = fixture();
    registerPlantTransmission(f.source, new Scalar(2));
    const first = copyPlantTransmission(f.source, f.target, f.sun)!;
    const second = copyPlantTransmission(f.source, f.target, f.sun)!;
    const installedVersion = f.target.version;
    first();
    expect(f.target.version).toBe(installedVersion);
    expect(f.run()).toBe(10);
    const third = copyPlantTransmission(f.source, f.target, f.sun)!;
    second();
    expect(f.run()).toBe(10);
    const beforeRestore = f.target.version;
    third(); third();
    expect(f.target.version).toBe(beforeRestore + 1);
    expect(f.target.setupLightingModel).toBe(f.original);
    expect(f.run()).toBe(0);
  });
});
