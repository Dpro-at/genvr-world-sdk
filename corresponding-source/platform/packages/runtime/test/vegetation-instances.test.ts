import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { VegInstances, VegType, type VegetationRecord, type VegetationOptions } from '../src/vegetation/instances.js';

const source = readFileSync(new URL('../../../../tooling/other-programs/tidewater/src/world/vegetation/InstanceLOD.js', import.meta.url), 'utf8');
const original = new Function('THREE', source.replace(/^import .*;\r?\n/, '').replaceAll('export class', 'class')
  + ';return {VegInstances,VegType};')(THREE) as { VegInstances: typeof VegInstances; VegType: typeof VegType };
const records: VegetationRecord[] = Array.from({ length: 400 }, (_, i) => ({
  x: (i % 20 - 10) * 17.3, y: (i % 7) * 1.2, z: (Math.floor(i / 20) - 10) * 15.7,
  s: .8 + i % 3, yaw: i * .31, seed: i / 401, sy: i % 2 ? -1.2 : 0,
  H: i % 3 ? 8 : 0, la: .1, l: .2, qr: i % 5 ? 0 : 35,
}));

function options(extra: Partial<VegetationOptions> = {}): VegetationOptions {
  const part = () => ({ geometry: new THREE.BoxGeometry(), material: new THREE.MeshBasicMaterial() });
  return { near: [part(), part()], far: { parts: [part()], fade: [180, 220] }, nearRange: 75, ...extra };
}
function dispose(type: VegType) {
  for (const mesh of type.meshes) { mesh.dispose(); mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) material.dispose();
  }
}
describe('source vegetation instance and LOD oracle', () => {
  it('matches source packed fields/matrices, including explicit impostor scale and source zero defaults', () => {
    const input = [...records, { ...records[0]!, msx: 3, msy: 8, msz: 2 }];
    const actual = new VegInstances(input), expected = new original.VegInstances(input);
    for (const key of ['px', 'py', 'pz', 'matrices', 'qr2', 'iPos', 'iDat'] as const)
      expect(actual[key]).toEqual(expected[key]);
  });
  it('matches bounded horizontal grid queries, traversal order and truncation across negative cells', () => {
    const a = new VegInstances(records), b = new original.VegInstances(records);
    for (const x of [-160, -32, 0, 30, 180]) for (const z of [-150, 0, 150])
      for (const capacity of [0, 3, 400]) {
        const aa = new Int32Array(capacity), bb = new Int32Array(capacity);
        expect(a.queryNear(x, z, 80, aa)).toBe(b.queryNear(x, z, 80, bb));
        expect(aa).toEqual(bb);
      }
  });
  it.each([{ sortNear: false }, { sortNear: true, sortFar: true }, { farExcludeNear: true }])(
    'matches source refills and shared buffers: %j', extra => {
      const a = new VegType('test', records, options(extra));
      const b = new original.VegType('test', records, options(extra));
      try {
        for (const xyz of [[0, 0, 0], [0, 0, 0], [5, 0, 0], [6, 0, 0], [6, 20, 0], [-100, 30, 80]]) {
          const camera = new THREE.Vector3(...xyz as [number, number, number]);
          expect(a.overdue(camera)).toBe(b.overdue(camera));
          expect(a.update(camera)).toBe(b.update(camera));
          for (let i = 0; i < a.levels.length; i++) {
            const aa = a.levels[i]!, bb = b.levels[i]!;
            expect(aa.count).toBe(bb.count);
            expect(aa.iBuffer.array).toEqual(bb.iBuffer.array);
            expect(aa.instanceMatrix.array).toEqual(bb.instanceMatrix.array);
            expect(aa.instanceMatrix.updateRanges).toEqual(bb.instanceMatrix.updateRanges);
            expect(aa.iBuffer.updateRanges).toEqual(bb.iBuffer.updateRanges);
            expect(aa.triangles).toBe(bb.triangles);
          }
        }
        expect(a.near!.meshes[0]!.instanceMatrix).toBe(a.near!.meshes[1]!.instanceMatrix);
        expect(a.near!.meshes[0]!.geometry.getAttribute('iPos')).toBe(a.near!.iPos);
        expect(a.near!.meshes[0]!.userData.lodRange).toBe(a.near!.lodRange);
      } finally { dispose(a); dispose(b); }
    });
  it('requires an explicit fade for a near-only type and supports empty records', () => {
    for (const size of [0, -1, Infinity, NaN]) expect(() => new VegInstances([], size)).toThrow('cell size');
    expect(() => new VegType('invalid', [])).toThrow('explicit fade');
    const empty = new VegType('empty', [], options({ far: null, fade: [42, 58] }));
    try { expect(empty.update(new THREE.Vector3())).toBe(true); expect(empty.near!.count).toBe(0); }
    finally { dispose(empty); }
  });
});
