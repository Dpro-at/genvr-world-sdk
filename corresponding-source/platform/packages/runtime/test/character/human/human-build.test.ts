import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BUILD_KEYS } from '@genvr/contracts';
import { decodeHuman } from '../../../src/character/human/format.js';
import { BUILD_STRENGTH, buildWeights, generateHuman } from '../../../src/character/human/generate.js';

const file = fileURLToPath(new URL('../../../../../apps/web/public/human/human-base.bin', import.meta.url));
const bytes = readFileSync(file);
const data = decodeHuman(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));

/** Half-width of the torso (vertices within 18 cm of the middle, so not the hands) in a height band (metres). */
function width(positions: Float32Array, from: number, to: number): number {
  let widest = 0;
  for (let v = 0; v < positions.length / 3; v += 1) {
    const y = positions[v * 3 + 1]!;
    if (y < from || y > to || Math.abs(positions[v * 3]!) > 0.18) continue;
    widest = Math.max(widest, Math.abs(positions[v * 3]!));
  }
  return widest;
}

describe('muscle and fat build (Stage B)', () => {
  it('has a baked + target for every muscle group and fat region', () => {
    for (const key of BUILD_KEYS) {
      if (key === 'fatPattern') continue;
      if (key === 'definition') {
        expect(data.targets.has('muscle.definition')).toBe(true);
        continue;
      }
      const name = key === 'muscle' ? 'muscle.all' : key === 'fat' ? 'fat.all' : key;
      expect(data.targets.has(`${name}+`), name).toBe(true);
    }
  });

  it('turns signed controls into + or - target weights; the chin only grows with much fat', () => {
    expect(buildWeights({ 'muscle.biceps': 0.5, 'fat.belly': -0.4 })).toEqual({
      'muscle.biceps+': 0.5 * BUILD_STRENGTH.zone,
      'fat.belly-': 0.4,
    });
    expect(buildWeights({ fat: 0.3 })['fat.chin+']).toBeUndefined();
    expect(buildWeights({ fat: 0.85 })['fat.chin+']).toBeGreaterThan(0);
    // The fat pattern puts fat on the belly (upper) or on the hips (lower).
    expect(buildWeights({ fat: 0.5, fatPattern: -1 })['fat.belly+']).toBeGreaterThan(
      buildWeights({ fat: 0.5, fatPattern: 1 })['fat.belly+']!,
    );
    expect(buildWeights({ fat: 0.5, fatPattern: 1 })['fat.hips+']).toBeGreaterThan(0);
  });

  it('keeps every build at its limits standing, finite and on 52 joints, and fat widens the waist', () => {
    const slim = generateHuman(data, 'anime', 'boy')!;
    for (const build of [
      { muscle: 1, fat: 0.85, fatPattern: 1 },
      { muscle: -1, fatPattern: -1 },
      Object.fromEntries(BUILD_KEYS.map((key) => [key, key === 'fat' ? 0.85 : 1])),
      Object.fromEntries(BUILD_KEYS.map((key) => [key, key === 'fat' ? 0 : -1])),
    ]) {
      const body = generateHuman(data, 'anime', 'boy', {}, buildWeights(build))!;
      expect(body.joints).toHaveLength(52);
      expect(body.positions.every(Number.isFinite)).toBe(true);
      expect(Math.min(...body.positions.filter((_, i) => i % 3 === 1))).toBeCloseTo(0, 6);
    }
    const heavy = generateHuman(data, 'anime', 'boy', {}, buildWeights({ fat: 0.85 }))!;
    expect(width(heavy.positions, 0.95, 1.05)).toBeGreaterThan(width(slim.positions, 0.95, 1.05) + 0.005);
  });

  it('has a lighter level of detail on the same vertices (finer muscle areas merged back)', () => {
    const body = generateHuman(data, 'anime', 'boy')!;
    expect(body.lodTriangles).not.toBeNull();
    const lite = body.lodTriangles!;
    // Fewer triangles, every one on drawn vertices, and every drawn region still covered (same silhouette).
    expect(lite.length / 3).toBeLessThan((body.triangles.length / 3) * 0.7);
    expect(lite.length / 3).toBeLessThanOrEqual(30000);
    const drawn = body.positions.length / 3;
    expect(lite.every((v) => v < drawn)).toBe(true);
    const height = (index: Uint16Array) => index.reduce((top, v) => Math.max(top, body.positions[v * 3 + 1]!), 0);
    expect(height(lite)).toBeCloseTo(height(body.triangles), 3);
  });
});
