import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  octDecode, octEncode, frameBasis, vegetationLodScale, vegetationLodVisible, impostorThinning,
} from '../src/vegetation/index.js';

const source = readFileSync(new URL(
  '../../../../tooling/other-programs/tidewater/src/world/vegetation/Impostors.js', import.meta.url,
), 'utf8');
// Execute the pinned source functions verbatim without loading its custom WebGPU engine.
const functions = source.slice(source.indexOf('export function octDecode'), source.indexOf('// WGSL counterparts'));
const oracle = new Function('THREE', functions.replaceAll('export function', 'function')
  + '; return { octDecode, frameBasis };')({ Vector3 }) as {
    octDecode: typeof octDecode; frameBasis: typeof frameBasis;
  };

describe('Tidewater vegetation foundation', () => {
  it('matches executable source decode/basis across the hemisphere, including zenith and horizon', () => {
    for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) {
      const u = i / 10 - 1, v = j / 10 - 1;
      const direction = octDecode(u, v), basis = frameBasis(direction);
      const expected = oracle.octDecode(u, v), expectedBasis = oracle.frameBasis(expected);
      expect(direction.distanceTo(expected)).toBe(0);
      expect(basis.right.distanceTo(expectedBasis.right)).toBe(0);
      expect(basis.up.distanceTo(expectedBasis.up)).toBe(0);
      const encoded = octEncode(direction);
      expect(encoded.x).toBeCloseTo(u, 12);
      expect(encoded.y).toBeCloseTo(v, 12);
      expect(basis.right.dot(direction)).toBeCloseTo(0, 12);
      expect(basis.up.dot(direction)).toBeCloseTo(0, 12);
      expect(basis.right.clone().cross(basis.up).distanceTo(direction)).toBeLessThan(1e-12);
    }
  });

  it('covers each pixel exactly once through the full near/far transition and temporal pattern', () => {
    for (const range of [45, 75, 100]) for (let step = -8; step <= 8; step++) {
      const distance = range * (1 + step / 100);
      for (let frame = 0; frame < 16; frame++) for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const near = vegetationLodScale(distance, [0, range, range + 0.01]) > 0
          && vegetationLodVisible(distance, [0, range, range + 0.01], x, y, frame);
        const far = vegetationLodScale(distance, [range, 900, 1000]) > 0
          && vegetationLodVisible(distance, [range, 900, 1000], x, y, frame);
        expect(Number(near) + Number(far)).toBe(1);
      }
    }
  });

  it('soft windows shrink without applying a hard-end screen-door fade', () => {
    expect(vegetationLodScale(42, [0, 42, 58])).toBe(1);
    expect(vegetationLodScale(50, [0, 42, 58])).toBe(0.5);
    expect(vegetationLodScale(58, [0, 42, 58])).toBe(0);
    expect(vegetationLodVisible(50, [0, 42, 58], 0, 0)).toBe(true);
    expect(vegetationLodScale(70.49, [75, 100, 110])).toBe(0);
    expect(vegetationLodScale(70.5, [75, 100, 110])).toBe(1);
  });

  it('preserves all near crowns and removes half of a uniformly sampled hash population at320m', () => {
    let kept = 0;
    for (let i = 0; i < 1000; i++) {
      // Uniformly sample one complete source hash period; avoid claiming arbitrary seeds are exactly50%.
      const seed = (i + 0.5) / 1000 / 91.7;
      expect(impostorThinning(140, seed)).toEqual({ keep: true, scale: 1 });
      kept += Number(impostorThinning(320, seed).keep);
    }
    expect(kept).toBe(500);
    expect(impostorThinning(320, 0.01).scale).toBeCloseTo(Math.SQRT2, 12);
    expect(impostorThinning(230, 0.01).scale).toBeCloseTo(1 + (Math.SQRT2 - 1) / 2, 12);
  });
});
