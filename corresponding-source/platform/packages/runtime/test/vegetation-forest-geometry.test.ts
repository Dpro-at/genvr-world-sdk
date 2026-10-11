import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import * as tree from '../src/vegetation/forest-tree-geometry.js';
import * as shrub from '../src/vegetation/shrub-geometry.js';
// Executes the ORIGINAL pinned Tidewater source (read only) against the installed three.js.
const root = new URL('../../../../tooling/other-programs/tidewater/src/', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const strip = (text: string) => text.replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '');
const GeoBuilder = new Function('THREE', strip(read('world/vegetation/GeoBuilder.js')) + ';return GeoBuilder;')(THREE);
const noise = read('util/Noise.js');
const start = noise.indexOf('export function mulberry32');
const mulberry32 = new Function(strip(noise.slice(start, noise.indexOf('\n}', start) + 2)) + ';return mulberry32;')();
type Built = { geometry: THREE.BufferGeometry; triangles: number };
type Canopy = Built & { treeTriangles: number; shrubTriangles: number };
const original = new Function('THREE', 'GeoBuilder', 'mulberry32', strip(read('world/vegetation/PlantGeometry.js'))
  + ';return {buildTreeNear,buildShrubNear,buildCanopyNear,lobeVariantGeometry,LOBE_TABLE,TREE_H,SHRUB_H,'
  + 'TREE_LOBES,SHRUB_LOBES,TREE_VARIANTS,SHRUB_VARIANTS};')(THREE, GeoBuilder, mulberry32) as {
    buildTreeNear: (seed?: number) => Built; buildShrubNear: (seed?: number) => Built; buildCanopyNear: () => Canopy;
    lobeVariantGeometry: (geometry: THREE.BufferGeometry, table: Float32Array, offset: number) => THREE.BufferGeometry;
    LOBE_TABLE: Float32Array; TREE_H: number; SHRUB_H: number; TREE_LOBES: number[][]; SHRUB_LOBES: number[][];
    TREE_VARIANTS: number; SHRUB_VARIANTS: number;
  };
const NAMES = ['position', 'normal', 'uv', 'aVeg', 'aMat', 'aLobe'];
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
  expect(actual.boundingSphere).toEqual(expected.boundingSphere);
}

describe('pinned source forest tree and shrub geometry', () => {
  it('keeps the source constants and lobe tables', () => {
    expect(tree.TREE_H).toBe(original.TREE_H);
    expect(shrub.SHRUB_H).toBe(original.SHRUB_H);
    expect(tree.TREE_LOBES).toEqual(original.TREE_LOBES);
    expect(shrub.SHRUB_LOBES).toEqual(original.SHRUB_LOBES);
    expect([tree.TREE_VARIANTS, shrub.SHRUB_VARIANTS]).toEqual([original.TREE_VARIANTS, original.SHRUB_VARIANTS]);
    expect([tree.TREE_VARIANTS, shrub.SHRUB_VARIANTS]).toEqual([3, 2]);
    expect(shrub.LOBE_TABLE).toBeInstanceOf(Float32Array);
    expect(bits(shrub.LOBE_TABLE)).toEqual(bits(original.LOBE_TABLE));
    // lobes 0-1 are never dropped
    for (let v = 0; v < 5; v++) expect(Math.min(shrub.LOBE_TABLE[v * 8]!, shrub.LOBE_TABLE[v * 8 + 1]!)).toBeGreaterThan(0);
  });

  it.each([0, 21, 31, 99, 123456])('matches every source attribute, index and bound at seed%i', seed => {
    for (const [ours, theirs] of [[tree.buildTreeNear, original.buildTreeNear], [shrub.buildShrubNear, original.buildShrubNear]] as const) {
      const actual = ours(seed), expected = theirs(seed);
      try {
        expect(actual.triangles).toBe(expected.triangles);
        expectSameGeometry(actual.geometry, expected.geometry);
        expect(actual.geometry.boundingBox).toEqual(expected.geometry.boundingBox);
      } finally { actual.geometry.dispose(); expected.geometry.dispose(); }
    }
  });

  it('matches the merged canopy geometry and its tree/shrub triangle split', () => {
    const actual = shrub.buildCanopyNear(), expected = original.buildCanopyNear();
    try {
      expect([actual.triangles, actual.treeTriangles, actual.shrubTriangles])
        .toEqual([expected.triangles, expected.treeTriangles, expected.shrubTriangles]);
      expectSameGeometry(actual.geometry, expected.geometry);
    } finally { actual.geometry.dispose(); expected.geometry.dispose(); }
  });

  it('matches every source crown variant (3 tree, 2 shrub) without touching the input', () => {
    const builds = [[tree.buildTreeNear(21), original.buildTreeNear(21)], [shrub.buildShrubNear(31), original.buildShrubNear(31)]];
    try {
      for (let v = 0; v < 5; v++) {
        const [ours, theirs] = builds[v < 3 ? 0 : 1]!;
        const before = Float32Array.from(data(ours!.geometry).array);
        const actual = shrub.lobeVariantGeometry(ours!.geometry, shrub.LOBE_TABLE, v * 8);
        const expected = original.lobeVariantGeometry(theirs!.geometry, original.LOBE_TABLE, v * 8);
        expectSameGeometry(actual, expected);
        expect(actual.index).toBe(ours!.geometry.index);
        expect(actual.boundingSphere).not.toBe(ours!.geometry.boundingSphere);
        expect(bits(data(ours!.geometry).array)).toEqual(bits(before));
        // a dropped lobe collapses all its cards onto the lobe centre
        if (v < 3) expect(bits(data(actual).array)).not.toEqual(bits(before));
      }
    } finally { for (const pair of builds) for (const b of pair) b!.geometry.dispose(); }
  });

  it('keeps tree and shrub parts apart and stays deterministic', () => {
    const a = tree.buildTreeNear(21), b = tree.buildTreeNear(21), s = shrub.buildShrubNear(31);
    try {
      expect(bits(data(a.geometry).array)).toEqual(bits(data(b.geometry).array));
      const parts = (g: THREE.BufferGeometry) => new Set(Array.from({ length: g.getAttribute('aMat').count },
        (_, i) => g.getAttribute('aMat').getX(i)));
      expect([...parts(a.geometry)].sort()).toEqual([0, 1]);
      expect([...parts(s.geometry)].sort()).toEqual([4, 5]);
      expect(s.triangles).toBeLessThan(a.triangles);
    } finally { for (const g of [a, b, s]) g.geometry.dispose(); }
  });
});
