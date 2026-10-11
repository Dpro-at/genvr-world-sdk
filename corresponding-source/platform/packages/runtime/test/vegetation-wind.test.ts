import { describe, it, expect } from 'vitest';
import { TidewaterGround } from '../src/tidewater-ground/index.js';
import { vegetationWind, type VegetationWindProvider } from '../src/vegetation/wind.js';
import { TSL } from 'three/webgpu';

describe('vegetation borrows ground wind', () => {
  it('uses the existing provider without resetting gust phase or allocating another detail texture', () => {
    const ground = new TidewaterGround({ half: 4, heightAt: () => 0 });
    const provider: VegetationWindProvider = ground;
    const detail = ground.detail;
    ground.windDirection.value.set(1, 0);
    ground.windSpeed.value = 7;
    ground.update(20, 2);
    const phase = ground.gustOffset.value.clone();
    const graph = vegetationWind(provider, TSL.vec2(0));
    expect(graph.gust.isNode).toBe(true);
    expect(ground.detail).toBe(detail);
    expect(ground.gustOffset.value.equals(phase)).toBe(true);
    expect(phase.x).toBeCloseTo(12.8, 12);
    ground.windDirection.value.set(0, 1);
    ground.windSpeed.value = 0;
    ground.update(20, 2);
    expect(ground.gustOffset.value.x).toBeCloseTo(phase.x, 12);
    expect(ground.gustOffset.value.y).toBeCloseTo(3, 12);
    ground.dispose();
  });
});
