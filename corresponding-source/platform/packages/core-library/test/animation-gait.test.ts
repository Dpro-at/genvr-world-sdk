import { describe, expect, it } from 'vitest';
import { CORE_ANIMATIONS } from '../src/index.js';

describe('walk and run gait (P2-35)', () => {
  for (const clip of ['Walk', 'Run']) {
    it(`${clip}: the pelvis turns with the forward leg, the chest back, and the pelvis drops on the lifted side`, () => {
      const keys = CORE_ANIMATIONS.find((a) => a.clip === clip)!.keys;
      const [first, pass, second] = [keys[0]![1], keys[1]![1], keys[2]![1]];
      // Contact poses turn the pelvis one way, then the other; the chest turns against it.
      expect(first.Hips![1]).toBeLessThan(0);
      expect(second.Hips![1]).toBeGreaterThan(0);
      expect(Math.sign(first.Spine2![1])).toBe(-Math.sign(first.Hips![1]));
      // The passing pose tilts the pelvis, and the legs undo that tilt so the feet stay put.
      expect(pass.Hips![2]).not.toBe(0);
      expect(pass.LeftUpLeg![2]).toBe(-pass.Hips![2]);
      // The neck keeps the head facing ahead.
      expect(Math.sign(first.Neck![1])).toBe(Math.sign(first.Hips![1]));
    });
  }
});
