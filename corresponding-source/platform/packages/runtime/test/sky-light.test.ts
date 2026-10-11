import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three/webgpu';
import { envDue, sunColor } from '../src/sky-light.js';

describe('light from the physical sky (P2-36)', () => {
  it('turns the sunlight golden and red near the horizon, white up high', () => {
    const low = sunColor(0.05);
    expect(low.r).toBeGreaterThan(low.b * 1.5);
    const high = sunColor(0.9);
    expect(high.b).toBeGreaterThan(0.8);
    expect(high.r).toBeGreaterThan(0.95);
  });

  it('makes the environment map again only when the sun moved enough', () => {
    const a = new Vector3(0, 1, 0);
    expect(envDue(null, a, 1)).toBe(true);
    const turn = (deg: number) =>
      new Vector3(Math.sin((deg * Math.PI) / 180), Math.cos((deg * Math.PI) / 180), 0);
    expect(envDue(a, turn(0.5), 1)).toBe(false);
    expect(envDue(a, turn(1.5), 1)).toBe(true);
    expect(envDue(a, turn(3), 4)).toBe(false);
  });
});
