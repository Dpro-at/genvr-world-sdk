import { describe, expect, it } from 'vitest';
import { CLOUD_PRESET, cloudDensity, cloudInterval, cloudLattice, cloudLightEnergy, cloudPhase, cloudPhases,
  cloudShellRoots } from '../src/tidewater-sky/cloud-math.js';

describe('Tidewater cloud transport reference', () => {
  it('pins the original partly-cloudy distances and quality', () => {
    expect(CLOUD_PRESET).toMatchObject({ altitude: 4000, thickness: 5200, coverage: 0.49, density: 0.019,
      maxSteps: 256, lightTaps: 6, stepMeters: 25, historyWeight: 0.9, shadowSize: 12000 });
  });
  it('intersects the radial layer vertically without cancellation', () => {
    expect(cloudInterval(1, 20)[0]).toBeCloseTo(3980, 6);
    expect(cloudInterval(1, 20)[1]).toBeCloseTo(9180, 6);
    expect(cloudInterval(-1, 20)[1]).toBeLessThanOrEqual(cloudInterval(-1, 20)[0]);
    expect(cloudInterval(1, 10000)[1]).toBeLessThanOrEqual(0);
    expect(cloudInterval(-1, 10000)).toEqual([800, 6000]);
  });
  it('keeps ground/tangent/root boundaries finite', () => {
    for (const h of [0, 0.001, 4000, 9200, 10000]) for (const y of [-1, -0.001, 0, 0.001, 1]) {
      expect(cloudShellRoots(y, 4000, h).every(Number.isFinite)).toBe(true);
      expect(cloudInterval(y, h).every(Number.isFinite)).toBe(true);
    }
  });
  it('has a strongly forward phase with a backscatter lobe', () => {
    expect(cloudPhases(1)[0]).toBeGreaterThan(cloudPhases(0)[0] * 50);
    expect(cloudPhases(-1)[0]).toBeGreaterThan(0);
    expect(cloudPhase(0.2, 0)).toBeCloseTo(1 / (4 * Math.PI), 12);
    expect(cloudLightEnergy(8, 0.5)).toBeGreaterThan(Math.exp(-8) * cloudPhases(0.5)[0]);
    expect(cloudLightEnergy(20, 0.5)).toBeLessThan(cloudLightEnergy(8, 0.5));
  });
  it('samples each quarter-rate pixel exactly once in sixteen frames', () => {
    expect(new Set(Array.from({ length: 16 }, (_, i) => cloudLattice(i).join(','))).size).toBe(16);
    expect(cloudLattice(16)).toEqual(cloudLattice(0));
  });
  it('erodes boundaries while preserving dense interiors and the clear preset', () => {
    const base = [0.9, 0.9, 0.9] as const;
    expect(cloudDensity(0.2, 0.8, base, [0, 0, 0], 0)).toBe(0);
    expect(cloudDensity(-0.2, 0.8, base, [0, 0, 0])).toBe(0);
    expect(cloudDensity(1.4, 0.8, base, [0, 0, 0])).toBe(0);
    expect(cloudDensity(0.1, 0.8, base, [0, 0, 0])).toBeGreaterThan(cloudDensity(0.1, 0.8, base, [1, 1, 1]));
    expect(cloudDensity(0.3, 0.95, [1, 1, 1], [0, 0, 0])).toBe(1);
  });
});
