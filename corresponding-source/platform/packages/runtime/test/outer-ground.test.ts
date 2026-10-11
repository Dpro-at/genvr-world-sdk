import { describe, expect, it } from 'vitest';
import { outerGroundGeometry } from '../src/outer-ground.js';

describe('outer ground (R2k)', () => {
  it('starts at the border heights and eases out to their mean, with nothing under the place', () => {
    // A place on a hill: 16 m on its west border, 20 m on its east border.
    const half = 250;
    const heightAt = (x: number) => 18 + (x / half) * 2;
    const geometry = outerGroundGeometry(heightAt, half, 4);
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex()!;
    for (let k = 0; k < position.count; k += 1) {
      const x = position.getX(k);
      const y = position.getY(k);
      const z = position.getZ(k);
      // On the border: the place's own height, a few centimetres under it.
      if (Math.abs(Math.abs(x) - half) < 1e-6 && Math.abs(z) <= half) expect(y).toBeCloseTo(heightAt(x) - 0.05, 3);
      // Far out: the mean border height (18 m), no cliff down to 0.
      if (Math.abs(x) === 2 * half && Math.abs(z) === 2 * half) expect(y).toBeCloseTo(18 - 0.05, 1);
    }
    // No triangle lies inside the place.
    for (let t = 0; t < index.count; t += 3) {
      const cx = [0, 1, 2].reduce((sum, k) => sum + position.getX(index.getX(t + k)), 0) / 3;
      const cz = [0, 1, 2].reduce((sum, k) => sum + position.getZ(index.getX(t + k)), 0) / 3;
      expect(Math.abs(cx) < half - 1 && Math.abs(cz) < half - 1).toBe(false);
    }
    // Faces up.
    const normal = geometry.getAttribute('normal');
    expect(normal.getY(0)).toBeGreaterThan(0.9);
  });
});
