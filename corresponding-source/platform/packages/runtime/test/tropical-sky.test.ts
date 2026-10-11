import { describe, expect, it } from 'vitest';
import { presetSky } from '../src/sky-cycle.js';

describe('tropical sky settings', () => {
  it('uses the Tidewater afternoon path and accepts validated overrides', () => {
    const afternoon = presetSky('tropical');
    expect((Math.asin(afternoon.sun[1]) * 180) / Math.PI).toBeCloseTo(27.06, 1);
    expect(afternoon.look.tidewater?.exposure).toBe(0.55);
    expect(presetSky('tropical', { timeOfDay: 12 }).sun[1]).toBeGreaterThan(afternoon.sun[1]);
    expect(presetSky('tropical', { timeOfDay: 99 }).sun).toEqual(afternoon.sun);
    expect(presetSky('tropical', { timeOfDay: 1 }).night).toBeGreaterThan(0.9);
    expect(presetSky('tropical', { sunAzimuth: 90 }).sun[1]).toBeCloseTo(afternoon.sun[1]);
  });

  it('preserves the fixed legacy preset behavior', () => {
    for (const preset of ['day', 'sunset', 'night', 'storm'] as const) {
      expect(presetSky(preset, { timeOfDay: 1 })).toEqual(presetSky(preset));
    }
  });
});
