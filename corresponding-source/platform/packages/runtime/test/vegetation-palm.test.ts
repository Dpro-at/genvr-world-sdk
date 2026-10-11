import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildPalmNear, buildPalmFar, buildYoungPalm } from '../src/vegetation/palm-geometry.js';
const root = new URL('../../../../tooling/other-programs/tidewater/src/', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const strip = (text: string) => text.replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '');
const GeoBuilder = new Function('THREE', strip(read('world/vegetation/GeoBuilder.js')) + ';return GeoBuilder;')(THREE);
const noise = read('util/Noise.js');
const start = noise.indexOf('export function mulberry32');
const mulberry32 = new Function(strip(noise.slice(start, noise.indexOf('\n}', start) + 2)) + ';return mulberry32;')();
const original = new Function('THREE', 'GeoBuilder', 'mulberry32', strip(read('world/vegetation/PlantGeometry.js'))
  + ';return {buildPalmNear,buildPalmFar,buildYoungPalm};')(THREE, GeoBuilder, mulberry32) as {
    buildPalmNear: typeof buildPalmNear; buildPalmFar: typeof buildPalmFar; buildYoungPalm: typeof buildYoungPalm;
  };
describe('pinned source palm geometry', () => {
  it.each([0, 11, 99, 123456])('matches every source attribute and index at seed%i', seed => {
    for (const [name, build] of Object.entries({ buildPalmNear, buildPalmFar, buildYoungPalm })) {
      const actual = build(seed), expected = original[name as keyof typeof original](seed);
      try {
        expect(actual.triangles).toBe(expected.triangles);
        expect(actual.geometry.index!.array).toEqual(expected.geometry.index!.array);
        for (const name of ['position', 'normal', 'uv', 'aVeg', 'aMat', 'aLobe']) {
          const a = actual.geometry.getAttribute(name), b = expected.geometry.getAttribute(name);
          expect(a.count).toBe(b.count); expect(a.itemSize).toBe(b.itemSize);
          for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) {
            expect(a.getComponent(i, c)).toBe(b.getComponent(i, c));
            expect(Number.isFinite(a.getComponent(i, c))).toBe(true);
          }
        }
        expect(actual.geometry.boundingBox).toEqual(expected.geometry.boundingBox);
        expect(actual.geometry.boundingSphere).toEqual(expected.geometry.boundingSphere);
        const position = actual.geometry.getAttribute('position') as THREE.InterleavedBufferAttribute;
        for (const attribute of Object.values(actual.geometry.attributes))
          expect((attribute as THREE.InterleavedBufferAttribute).data).toBe(position.data);
      } finally { actual.geometry.dispose(); expected.geometry.dispose(); }
    }
  });
  it('keeps the far palm cheaper and preserves deterministic geometry', () => {
    const near = buildPalmNear(11), far = buildPalmFar(11), second = buildPalmNear(11), young = buildYoungPalm(11);
    try {
      expect(far.triangles).toBeLessThan(near.triangles);
      expect(young.triangles).toBeLessThan(near.triangles);
      expect(near.geometry.index!.array).toEqual(second.geometry.index!.array);
      expect((near.geometry.getAttribute('position') as THREE.InterleavedBufferAttribute).data.array)
        .toEqual((second.geometry.getAttribute('position') as THREE.InterleavedBufferAttribute).data.array);
    } finally { for (const item of [near, far, second, young]) item.geometry.dispose(); }
  });
});
