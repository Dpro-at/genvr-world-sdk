import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FACE_FEATURES } from '@genvr/contracts';
import { decodeHuman } from '../../../src/character/human/format.js';
import { buildWeights, generateHuman } from '../../../src/character/human/generate.js';

const file = fileURLToPath(new URL('../../../../../apps/web/public/human/human-base.bin', import.meta.url));
const bytes = readFileSync(file);
const data = decodeHuman(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

describe('face controls (FACE-01)', () => {
  const base = generateHuman(data, 'anime', 'boy')!;
  let top = -Infinity;
  for (let v = 1; v < base.positions.length; v += 3) top = Math.max(top, base.positions[v]!);

  it('has a baked + and - target for every face feature', () => {
    for (const feature of FACE_FEATURES) {
      expect(data.targets.has(`face.${feature}+`), feature).toBe(true);
      expect(data.targets.has(`face.${feature}-`), feature).toBe(true);
    }
  });

  it('turns each control into its + or - target weight', () => {
    expect(buildWeights({ 'face.noseWidth': 0.6, 'face.eyeSize': -0.3 })).toEqual({
      'face.noseWidth+': 0.6,
      'face.eyeSize-': 0.3,
    });
  });

  it('every control changes the head, and only the head', { timeout: 60_000 }, () => {
    for (const feature of FACE_FEATURES)
      for (const value of [1, -1]) {
        const body = generateHuman(data, 'anime', 'boy', {}, buildWeights({ [`face.${feature}`]: value }))!;
        expect(body.positions.every(Number.isFinite)).toBe(true);
        let moved = 0;
        let lowest = Infinity;
        for (let v = 0; v < base.positions.length; v += 3) {
          const d = Math.hypot(
            body.positions[v]! - base.positions[v]!,
            body.positions[v + 1]! - base.positions[v + 1]!,
            body.positions[v + 2]! - base.positions[v + 2]!,
          );
          if (d < 0.0005) continue;
          moved = Math.max(moved, d);
          lowest = Math.min(lowest, base.positions[v + 1]!);
        }
        // At least half a millimetre somewhere, nothing below the neck (the head is about 0.25 m tall).
        expect(moved, `${feature} ${value}`).toBeGreaterThan(0.0005);
        expect(top - lowest, `${feature} ${value}`).toBeLessThan(0.4);
      }
  });

  it('a wider nose is wider at the tip, a narrower one narrower', () => {
    const spread = (positions: Float32Array, y0: number, y1: number, zMin: number) => {
      let left = Infinity;
      let right = -Infinity;
      for (let v = 0; v < positions.length; v += 3) {
        const y = positions[v + 1]!;
        if (y < y0 || y > y1 || positions[v + 2]! < zMin || Math.abs(positions[v]!) > 0.03) continue;
        left = Math.min(left, positions[v]!);
        right = Math.max(right, positions[v]!);
      }
      return right - left;
    };
    // The nose: the front-most part of the face, a little below the eyes.
    let tipZ = -Infinity;
    let tipY = 0;
    for (let v = 0; v < base.positions.length; v += 3)
      if (base.positions[v + 1]! > top - 0.25 && base.positions[v + 2]! > tipZ) {
        tipZ = base.positions[v + 2]!;
        tipY = base.positions[v + 1]!;
      }
    const nose = (positions: Float32Array) => spread(positions, tipY - 0.01, tipY + 0.01, tipZ - 0.02);
    const wide = generateHuman(data, 'anime', 'boy', {}, buildWeights({ 'face.noseWidth': 1 }))!;
    const narrow = generateHuman(data, 'anime', 'boy', {}, buildWeights({ 'face.noseWidth': -1 }))!;
    expect(nose(wide.positions)).toBeGreaterThan(nose(base.positions));
    expect(nose(narrow.positions)).toBeLessThan(nose(base.positions));
  });
});
