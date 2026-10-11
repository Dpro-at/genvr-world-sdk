import { describe, expect, it } from 'vitest';
import { buildPaving, PavingMaterials, pavingLevels } from '../src/paving-view.js';

describe('paved areas (R2l)', () => {
  it('lie on the ground with an exact edge, facing up, under the streets', () => {
    // An L-shaped square on a slope.
    const heightAt = (x: number, z: number) => x * 0.1 + z * 0.05;
    const area: Array<[number, number]> = [[0, 0], [20, 0], [20, 8], [8, 8], [8, 20], [0, 20]];
    const materials = new PavingMaterials();
    const mesh = buildPaving({ id: 'p', area, materialId: 'genvr.core.ground.large-grey-tiles' }, heightAt, materials);
    const position = mesh.geometry.getAttribute('position');
    const normal = mesh.geometry.getAttribute('normal');
    expect(position.count).toBeGreaterThan(30);
    let longest = 0;
    for (let k = 0; k < position.count; k += 1) {
      const x = position.getX(k);
      const z = position.getZ(k);
      // Inside the outline (its notch at x > 8, z > 8 stays open), on the ground just under the 6 cm of a road.
      expect(x > 8 + 1e-6 && z > 8 + 1e-6).toBe(false);
      expect(position.getY(k) - heightAt(x, z)).toBeCloseTo(0.03, 5);
      expect(normal.getY(k)).toBeGreaterThan(0.9);
    }
    for (let t = 0; t < position.count; t += 3)
      for (const [a, b] of [[0, 1], [1, 2], [2, 0]] as const)
        longest = Math.max(
          longest,
          Math.hypot(position.getX(t + a) - position.getX(t + b), position.getZ(t + a) - position.getZ(t + b)),
        );
    expect(longest).toBeLessThanOrEqual(2 + 1e-6);
    materials.dispose();
  });
});

describe('overlapping paved areas (R2l)', () => {
  it('put a smaller area on a bigger one a level up, so they never flicker', () => {
    const square = (id: string, r: number, cx = 0) => ({
      id,
      area: [[cx - r, -r], [cx + r, -r], [cx + r, r], [cx - r, r]] as Array<[number, number]>,
      materialId: 'genvr.core.ground.asphalt-02',
    });
    const levels = pavingLevels([square('car-park', 10), square('retail', 40), square('far', 5, 100)]);
    expect(levels.get('retail')).toBe(0);
    expect(levels.get('car-park')).toBe(1);
    expect(levels.get('far')).toBe(0);
  });
});
