import { describe, expect, it } from 'vitest';
import { CORE_SKIES, STYLE_PACKS } from '../src/index.js';

describe('realistic sky and light in the Core Library (P2-36)', () => {
  it('gives every sky physical parameters in range', () => {
    for (const sky of CORE_SKIES) {
      const p = sky.look.physical;
      expect(p.turbidity, sky.preset).toBeGreaterThanOrEqual(1);
      expect(p.turbidity, sky.preset).toBeLessThanOrEqual(20);
      expect(p.rayleigh, sky.preset).toBeGreaterThan(0);
      expect(p.mie, sky.preset).toBeGreaterThan(0);
      expect(p.mie, sky.preset).toBeLessThan(0.1);
      for (const share of [p.cloudCoverage, p.cloudDensity]) {
        expect(share, sky.preset).toBeGreaterThanOrEqual(0);
        expect(share, sky.preset).toBeLessThanOrEqual(1);
      }
      expect(p.exposure, sky.preset).toBeGreaterThan(0);
    }
  });

  it('lights only the realistic style from the sky', () => {
    for (const pack of STYLE_PACKS)
      expect(pack.look.lighting ?? 'hemisphere', pack.style).toBe(
        pack.style === 'realistic' ? 'sky' : 'hemisphere',
      );
  });
});
