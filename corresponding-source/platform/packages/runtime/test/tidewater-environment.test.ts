import { describe, expect, it } from 'vitest';
import { environmentCubeDirection, environmentDiffuse, environmentGGX, environmentHammersley, environmentSH,
  ENVIRONMENT_GGX_SAMPLES, ENVIRONMENT_LEVELS, ENVIRONMENT_SIZE } from '../src/tidewater-sky/environment-math.js';
describe('Tidewater environment reference', () => {
  it('pins source cube and filter quality', () => {
    expect([ENVIRONMENT_SIZE, ENVIRONMENT_LEVELS, ENVIRONMENT_GGX_SAMPLES]).toEqual([128, 6, 96]);
    expect(Array.from({ length: 6 }, (_, i) => environmentCubeDirection(i, 0, 0, 1))).toEqual([
      [1, -0, -0], [-1, -0, 0], [0, 1, 0], [0, -1, -0], [0, -0, 1], [-0, -0, -1]]);
  });
  it('convolves a constant sky to the same diffuse radiance in all directions', () => {
    const color = [0.3, 0.4, 0.6] as const, sh = environmentSH(() => color);
    for (const normal of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [-1, 0, 0], [0, -1, 0]] as const)
      environmentDiffuse(sh, normal).forEach((v, c) => expect(v).toBeCloseTo(color[c]!, 3));
    for (let k = 1; k < 9; k++) sh[k]!.forEach(v => expect(Math.abs(v)).toBeLessThan(1e-12));
  });
  it('retains constant GGX energy at all six roughness levels', () => {
    const color = [2, 0.7, 4] as const;
    for (let i = 0; i < 6; i++) environmentGGX(() => color, i / 5).forEach((v, c) => expect(v).toBeCloseTo(color[c]!, 12));
  });
  it('uses deterministic low-discrepancy Hammersley points', () => {
    expect(environmentHammersley(0)).toEqual([0, 0]); expect(environmentHammersley(1)).toEqual([1 / 96, 0.5]);
    expect(environmentHammersley(2)).toEqual([2 / 96, 0.25]);
    expect(new Set(Array.from({ length: 96 }, (_, i) => environmentHammersley(i).join(','))).size).toBe(96);
  });
});
