import { describe, expect, it } from 'vitest';
import { realisticQuality } from '../src/realistic-quality.js';
import { SunShadows, shadowSetup } from '../src/shadows.js';
import { DirectionalLight } from 'three/webgpu';

describe('sun shadows (P2-36)', () => {
  it('keeps one 2048 map over 40 m for styles lit by a hemisphere light', () => {
    expect(shadowSetup(null)).toEqual({ cascades: 1, mapSize: 2048, far: 40 });
  });

  it('reaches far with cascades on computers and fewer on phones', () => {
    const computer = shadowSetup(realisticQuality({ quality: 0, touchDevice: false }));
    expect(computer.cascades).toBe(4);
    expect(computer.far).toBeGreaterThan(400);
    const phone = shadowSetup(realisticQuality({ quality: 0, touchDevice: true }));
    expect(phone.cascades).toBe(2);
    expect(phone.far).toBeLessThan(computer.far);
  });

  it('uses the source three 2048 cascades reaching 400m only for the Tidewater gate', () => {
    expect(shadowSetup(realisticQuality({ quality: 8, touchDevice: false, webgpu: true }))).toEqual({
      cascades: 3,
      mapSize: 2048,
      far: 400,
    });
  });

  it('leaves no custom shadow node for the plain map (P11: null was compiled as "* null")', () => {
    // three.js multiplies the light colour by any `shadowNode` that is not undefined, so a null
    // one became the WGSL "nodeUniform * null" and every lit material failed to build.
    const sun = new DirectionalLight();
    const shadows = new SunShadows(sun);
    shadows.apply(realisticQuality({ quality: 0, touchDevice: true }));
    expect(sun.shadow.shadowNode).toBeDefined();
    shadows.apply(null);
    expect('shadowNode' in sun.shadow && sun.shadow.shadowNode !== undefined).toBe(false);
    shadows.dispose();
  });
});
