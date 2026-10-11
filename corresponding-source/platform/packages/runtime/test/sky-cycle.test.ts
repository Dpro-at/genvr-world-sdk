import { getSky } from '@genvr/core-library';
import { describe, expect, it } from 'vitest';
import { cycleSky, presetSky, timeOfDay } from '../src/sky-cycle.js';

describe('day-night cycle (P2-02)', () => {
  it('takes the time of day from the wall clock', () => {
    const minute = 60_000;
    expect(timeOfDay(0, 20)).toBe(0);
    expect(timeOfDay(10 * minute, 20)).toBe(0.5);
    expect(timeOfDay(25 * minute, 20)).toBe(0.25);
    // Two players with the same clock see the same time.
    expect(timeOfDay(1_789_000_123_456, 20)).toBe(timeOfDay(1_789_000_123_456, 20));
  });

  it('shows day at noon and night at midnight, with the moon at night only', () => {
    const noon = cycleSky(0.5);
    expect(noon.look).toEqual(getSky('day').look);
    expect(noon.night).toBe(0);
    expect(noon.moon).toBeNull();
    expect(noon.phase).toBe('day');
    expect(cycleSky(0.26).phase).toBe('sunset');
    expect(cycleSky(0).phase).toBe('night');
    expect(noon.light[1]).toBeGreaterThan(0.9); // the sun high up

    const midnight = cycleSky(0);
    expect(midnight.look).toEqual(getSky('night').look);
    expect(midnight.night).toBe(1);
    expect(midnight.moon![1]).toBeGreaterThan(0.9);
    expect(midnight.light).toEqual(midnight.moon);
  });

  it('passes through sunset colors and hands the light from sun to moon without a jump', () => {
    // Just after sunrise the sky mixes sunset and day colors.
    const morning = cycleSky(0.27);
    expect(morning.look.skyTop).not.toBe(getSky('day').look.skyTop);
    expect(morning.look.skyTop).not.toBe(getSky('sunset').look.skyTop);
    // The light fades out where it hands over, so the switch is not seen.
    const shares = Array.from({ length: 200 }, (_, i) => cycleSky(0.7 + i * 0.0005).lightShare);
    expect(Math.min(...shares)).toBeLessThan(0.05);
    for (let i = 0; i < 300; i += 1) expect(cycleSky(i / 300).light[1]).toBeGreaterThan(0.1);
  });

  it('keeps fixed skies as they are', () => {
    expect(presetSky('day')).toMatchObject({ night: 0, moon: null, lightShare: 1 });
    expect(presetSky('night').night).toBe(1);
    expect(presetSky('night').moon).not.toBeNull();
  });
});

describe('the real sun for the physical sky (P2-36)', () => {
  it('keeps the sun where it really is, below the horizon at night', () => {
    expect(cycleSky(0.5).sun[1]).toBeGreaterThan(0.8);
    expect(cycleSky(0).sun[1]).toBeLessThan(0);
    expect(presetSky('night').sun[1]).toBeLessThan(0);
    expect(presetSky('day').sun).toEqual(presetSky('day').light);
    expect(presetSky('sunset').sun).toEqual(presetSky('sunset').light);
  });
});

describe('physical sky values through the cycle (P2-36)', () => {
  it('mixes the haze between sunset and night at dusk', () => {
    const dusk = cycleSky(0.76).look.physical.turbidity;
    const [a, b] = [getSky('sunset').look.physical.turbidity, getSky('night').look.physical.turbidity];
    expect(dusk).toBeLessThanOrEqual(Math.max(a, b));
    expect(dusk).toBeGreaterThanOrEqual(Math.min(a, b));
    expect(dusk).not.toBe(a);
  });
});
