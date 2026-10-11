import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import * as ours from '../src/vegetation/understory-geometry.js';
// Executes the ORIGINAL pinned Tidewater source (read only) against the installed three.js.
const root = new URL('../../../../tooling/other-programs/tidewater/src/', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const strip = (text: string) => text.replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '');
const GeoBuilder = new Function('THREE', strip(read('world/vegetation/GeoBuilder.js')) + ';return GeoBuilder;')(THREE);
const noise = read('util/Noise.js');
const start = noise.indexOf('export function mulberry32');
const mulberry32 = new Function(strip(noise.slice(start, noise.indexOf('\n}', start) + 2)) + ';return mulberry32;')();
type Built = { geometry: THREE.BufferGeometry; triangles: number };
type Merged = Built & { perKind: Record<string, number> };
const original = new Function('THREE', 'GeoBuilder', 'mulberry32', strip(read('world/vegetation/PlantGeometry.js'))
  + ';return {buildFern,buildBanana,buildMonstera,buildElephantEar,buildHeliconia,buildStrelitzia,'
  + 'buildUnderstory,buildBananas,buildMonsteraMesh,buildBroadleaf,UNDERSTORY,BROADLEAF,PART};')(THREE, GeoBuilder, mulberry32) as {
    buildFern: (seed?: number) => Built; buildBanana: (seed?: number) => Built; buildMonstera: (seed?: number) => Built;
    buildElephantEar: (seed?: number) => Built; buildHeliconia: (seed?: number) => Built;
    buildStrelitzia: (seed?: number) => Built; buildUnderstory: () => Merged; buildBananas: () => Merged;
    buildMonsteraMesh: () => Built; buildBroadleaf: () => Merged;
    UNDERSTORY: Record<string, number>; BROADLEAF: Record<string, number>; PART: Record<string, number>;
  };
const NAMES = ['position', 'normal', 'uv', 'aVeg', 'aMat', 'aLobe'];
const PLANTS = ['buildFern', 'buildBanana', 'buildMonstera', 'buildElephantEar', 'buildHeliconia', 'buildStrelitzia'] as const;
const data = (g: THREE.BufferGeometry) => (g.getAttribute('position') as THREE.InterleavedBufferAttribute).data;
const bits = (array: ArrayLike<number>) => new Uint32Array(Float32Array.from(array).buffer);

function expectSameGeometry(actual: THREE.BufferGeometry, expected: THREE.BufferGeometry) {
  expect(actual.index!.array.constructor).toBe(expected.index!.array.constructor);
  expect(actual.index!.array).toEqual(expected.index!.array);
  expect(Object.keys(actual.attributes)).toEqual(NAMES);
  for (const name of NAMES) {
    const a = actual.getAttribute(name) as THREE.InterleavedBufferAttribute;
    const b = expected.getAttribute(name) as THREE.InterleavedBufferAttribute;
    expect([a.count, a.itemSize, a.offset, a.data.stride]).toEqual([b.count, b.itemSize, b.offset, b.data.stride]);
    expect(a.data).toBe(data(actual)); // one interleaved vertex buffer
  }
  // bit-exact (including -0) for every component of every vertex
  expect(bits(data(actual).array)).toEqual(bits(data(expected).array));
  expect(data(actual).array.every(Number.isFinite)).toBe(true);
  expect(actual.boundingBox).toEqual(expected.boundingBox);
  expect(actual.boundingSphere).toEqual(expected.boundingSphere);
}

const parts = (g: THREE.BufferGeometry) => new Set(Array.from({ length: g.getAttribute('aMat').count },
  (_, i) => g.getAttribute('aMat').getX(i)));
const kinds = (g: THREE.BufferGeometry) => new Set(Array.from({ length: g.getAttribute('aLobe').count },
  (_, i) => -1 - g.getAttribute('aLobe').getW(i)));

describe('pinned source understory and broadleaf geometry', () => {
  it('keeps the source kind and part tables', () => {
    expect(ours.UNDERSTORY).toEqual(original.UNDERSTORY);
    expect(ours.BROADLEAF).toEqual(original.BROADLEAF);
    expect(ours.PART).toEqual(original.PART);
  });

  it.each([0, 3, 9, 41, 99, 123456])('matches every source attribute, index and bound at seed%i', seed => {
    for (const name of PLANTS) {
      const actual = ours[name](seed), expected = original[name](seed);
      try {
        expect(actual.triangles).toBe(expected.triangles);
        expectSameGeometry(actual.geometry, expected.geometry);
      } finally { actual.geometry.dispose(); expected.geometry.dispose(); }
    }
  });

  it('matches every source default seed and the merged meshes with their per-kind triangles', () => {
    for (const name of PLANTS) {
      const actual = ours[name](), expected = original[name]();
      try { expectSameGeometry(actual.geometry, expected.geometry); }
      finally { actual.geometry.dispose(); expected.geometry.dispose(); }
    }
    for (const name of ['buildUnderstory', 'buildBananas', 'buildMonsteraMesh', 'buildBroadleaf'] as const) {
      const actual = ours[name]() as Merged, expected = original[name]() as Merged;
      try {
        expect(actual.triangles).toBe(expected.triangles);
        expect(actual.perKind).toEqual(expected.perKind);
        expectSameGeometry(actual.geometry, expected.geometry);
      } finally { actual.geometry.dispose(); expected.geometry.dispose(); }
    }
  });

  it('tags merged kinds and parts as the source shader expects and stays deterministic', () => {
    const understory = ours.buildUnderstory(), bananas = ours.buildBananas(), monstera = ours.buildMonsteraMesh();
    const broadleaf = ours.buildBroadleaf(), again = ours.buildBroadleaf();
    try {
      expect([...kinds(understory.geometry)].sort()).toEqual([1, 3]);
      expect([...kinds(bananas.geometry)].sort()).toEqual([2, 4]);
      expect([...kinds(monstera.geometry)]).toEqual([11]);
      expect([...kinds(broadleaf.geometry)].sort()).toEqual([12, 13, 14]);
      expect([...parts(understory.geometry)].sort()).toEqual([0, 1, 2]);
      expect([...parts(bananas.geometry)]).toEqual([3]);
      expect([...parts(broadleaf.geometry)].sort((a, b) => a - b)).toEqual([7, 8, 9, 10, 11]);
      expect(understory.perKind.young + understory.perKind.fern).toBe(understory.triangles);
      expect(bananas.perKind.banana + bananas.perKind.bananaB).toBe(bananas.triangles);
      expect(bits(data(broadleaf.geometry).array)).toEqual(bits(data(again.geometry).array));
    } finally { for (const g of [understory, bananas, monstera, broadleaf, again]) g.geometry.dispose(); }
  });
});
