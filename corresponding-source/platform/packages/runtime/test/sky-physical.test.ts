import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three/webgpu';
import { cycleSky, presetSky } from '../src/sky-cycle.js';
import { PhysicalSky } from '../src/sky-physical.js';

const NOW = Date.UTC(2024, 0, 25, 17, 54); // a full moon

describe('physical sky (P2-36)', () => {
  it('puts the sun high at noon and hides the moon by day', () => {
    const sky = new PhysicalSky();
    sky.show(cycleSky(0.5), 1, NOW);
    expect(sky.sky.sunPosition.value.y).toBeGreaterThan(0);
    expect(sky.moon.visible).toBe(false);
    sky.dispose();
  });

  it('shows the moon above the horizon at midnight', () => {
    const sky = new PhysicalSky();
    sky.show(cycleSky(0), 1, NOW);
    sky.update(new Vector3(10, 0, 10));
    expect(sky.moon.visible).toBe(true);
    expect(sky.moon.position.y).toBeGreaterThan(0);
    sky.dispose();
  });

  it('covers the sky in a storm and in bad weather', () => {
    const sky = new PhysicalSky();
    sky.show(presetSky('storm'), 1, NOW);
    expect(sky.sky.cloudCoverage.value).toBeGreaterThan(0.9);
    sky.show(presetSky('day'), 0.4, NOW);
    expect(sky.sky.cloudCoverage.value).toBeGreaterThan(presetSky('day').look.physical.cloudCoverage);
    sky.dispose();
  });
});

describe('moon phase lighting (P2-36)', () => {
  it('lights the side facing the viewer at full moon and hides the new moon', () => {
    const sky = new PhysicalSky();
    sky.show(cycleSky(0), 1, NOW);
    // Full moon: the light on the moon comes from the viewer's side (opposite the moon).
    expect(sky.moonLight.dot(new Vector3(...cycleSky(0).moon!))).toBeLessThan(-0.95);
    sky.show(cycleSky(0), 1, Date.UTC(2024, 1, 9, 22, 59));
    expect(sky.moon.visible).toBe(false);
    sky.dispose();
  });
});

describe('storm skies are dark (P2-36)', () => {
  it('dims an overcast sky and bad weather, not a clear day', async () => {
    const { skyDim } = await import('../src/sky-physical.js');
    expect(skyDim(0.35, 1)).toBe(1);
    expect(skyDim(0.95, 1)).toBeLessThan(0.6);
    expect(skyDim(0.95, 0.4)).toBeLessThan(skyDim(0.95, 1));
  });
});
