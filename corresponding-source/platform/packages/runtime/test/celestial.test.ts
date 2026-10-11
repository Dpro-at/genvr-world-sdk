import { describe, expect, it } from 'vitest';
import { moonPhase } from '../src/celestial.js';

const near = (value: number, target: number) =>
  Math.min(Math.abs(value - target), Math.abs(value - target - 1), Math.abs(value - target + 1));

describe('moon phase (P2-36)', () => {
  it('finds known full and new moons', () => {
    expect(near(moonPhase(Date.UTC(2024, 0, 25, 17, 54)), 0.5)).toBeLessThan(0.02);
    expect(near(moonPhase(Date.UTC(2024, 1, 9, 22, 59)), 0)).toBeLessThan(0.02);
  });

  it('stays between 0 and 1', () => {
    for (let day = -400; day < 400; day += 7) {
      const phase = moonPhase(Date.UTC(2026, 0, 1) + day * 86_400_000);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(1);
    }
  });
});
