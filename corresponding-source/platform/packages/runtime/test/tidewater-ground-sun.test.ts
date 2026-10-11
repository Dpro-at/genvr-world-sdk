import { describe, it, expect } from 'vitest';
import { DirectionalLight, MeshStandardNodeMaterial, TSL, Vector3 } from 'three/webgpu';
import {
  meadowSunFactor,
  attachGroundSunModulation,
  copyGroundSunModulation,
} from '../src/tidewater-ground/sun-modulation.js';
describe('source meadow sunlight integration', () => {
  it('matches source low and high sun and painted coverage', () => {
    expect(meadowSunFactor(-1, 1)).toBe(0.62);
    expect(meadowSunFactor(1, 1)).toBeCloseTo(0.97);
    expect(meadowSunFactor(-1, 0.5)).toBeCloseTo(0.81);
    expect(meadowSunFactor(0, 0)).toBe(1);
  });
  it('transfers original registration to clone and filters actual sun identity', () => {
    const source = new MeshStandardNodeMaterial(),
      target = source.clone(),
      sun = new DirectionalLight(),
      other = new DirectionalLight();
    attachGroundSunModulation(source, TSL.float(1));
    const calls: unknown[] = [];
    const setup = () => ({
      direct(data: unknown) {
        calls.push(data);
      },
    });
    Object.assign(target, { setupLightingModel: setup });
    const restore = copyGroundSunModulation(source, target, sun, TSL.uniform(new Vector3(0, -1, 0)))!;
    const model = (
      target as unknown as { setupLightingModel: () => { direct: (data: unknown) => void } }
    ).setupLightingModel();
    const color = { mul: (factor: unknown) => ({ factor }) };
    const local = { lightColor: color },
      unrelated = { lightNode: { light: other }, lightColor: color },
      key = { lightNode: { light: sun }, lightColor: color };
    model.direct(local);
    model.direct(unrelated);
    model.direct(key);
    expect(calls[0]).toBe(local);
    expect(calls[1]).toBe(unrelated);
    expect(calls[2]).not.toBe(key);
    restore();
    restore();
    expect(target.setupLightingModel).toBe(setup);
  });
  it('leaves unregistered materials untouched', () => {
    const source = new MeshStandardNodeMaterial(),
      target = source.clone(),
      before = target.setupLightingModel;
    expect(copyGroundSunModulation(source, target, new DirectionalLight(), TSL.vec3(0, 1, 0))).toBeNull();
    expect(target.setupLightingModel).toBe(before);
  });
});
