import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BufferAttribute, BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { HUMAN_BEARD_STYLES, HUMAN_BROW_STYLES, HUMAN_HAIR_STYLES } from '@genvr/contracts';
import { decodeHuman } from '../../../src/character/human/format.js';
import { buildWeights, generateHuman } from '../../../src/character/human/generate.js';
import { decodeProxy, fitHumanProxy } from '../../../src/character/human/proxy.js';

const folder = new URL('../../../../../apps/web/public/human/', import.meta.url);
const read = (name: string) => {
  const bytes = readFileSync(fileURLToPath(new URL(name, folder)));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};
const data = decodeHuman(read('human-base.bin'));

/** A shaped body as the runtime's geometry holds it (positions and skinning are what a proxy reads). */
function body(build: Record<string, number> = {}) {
  const made = generateHuman(data, 'anime', 'boy', {}, buildWeights(build))!;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(made.positions, 3));
  geometry.setAttribute('skinIndex', new BufferAttribute(made.skinIndex, 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(made.skinWeight, 4));
  return { geometry, positions: made.positions };
}
const box = (positions: ArrayLike<number>) => {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3)
    for (let k = 0; k < 3; k += 1) {
      min[k] = Math.min(min[k]!, positions[i + k]!);
      max[k] = Math.max(max[k]!, positions[i + k]!);
    }
  return { min, max };
};

describe('hair, eyebrows and beards (HAIR-01)', () => {
  const plain = body();
  const top = box(plain.positions).max[1]!;

  it('has a baked proxy for every style the contracts offer, each sitting on the head', () => {
    for (const id of [...HUMAN_HAIR_STYLES, ...HUMAN_BROW_STYLES, ...HUMAN_BEARD_STYLES]) {
      const proxy = decodeProxy(read(`proxies/${id}.bin`));
      expect(proxy.id).toBe(id);
      const fitted = fitHumanProxy(proxy, plain.geometry);
      const position = fitted.getAttribute('position').array as Float32Array;
      expect(position.every(Number.isFinite), id).toBe(true);
      const { min, max } = box(position);
      // On the head: within 35 cm of the top, never above it by more than 6 cm, centred on the body.
      expect(top - min[1]!, id).toBeLessThan(0.35);
      expect(max[1]! - top, id).toBeLessThan(0.06);
      expect(Math.abs((min[0]! + max[0]!) / 2), id).toBeLessThan(0.02);
      // Skinned like the body (four weights summing to 1).
      const weights = fitted.getAttribute('skinWeight');
      for (let v = 0; v < weights.count; v += 97) {
        const sum = [0, 1, 2, 3].reduce((total, k) => total + weights.getComponent(v, k), 0);
        expect(sum, id).toBeCloseTo(1, 3);
      }
    }
  });

  it('follows the head: a wider head gives wider hair', () => {
    const proxy = decodeProxy(read('proxies/hair.short02.bin'));
    const width = (geometry: BufferGeometry) => {
      const { min, max } = box(fitHumanProxy(proxy, geometry).getAttribute('position').array as Float32Array);
      return max[0]! - min[0]!;
    };
    expect(width(body({ 'face.headWidth': 1 }).geometry)).toBeGreaterThan(width(plain.geometry) + 0.003);
    expect(width(body({ 'face.headWidth': -1 }).geometry)).toBeLessThan(width(plain.geometry) - 0.003);
  });
});
