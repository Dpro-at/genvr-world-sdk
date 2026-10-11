import { readFileSync } from 'node:fs';
import * as Three from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { TerrainLod, type TerrainLodOptions } from '../src/terrain-lod/index.js';

const source = readFileSync(
  new URL('../../../../tooling/other-programs/tidewater/src/core/CDLOD.js', import.meta.url),
  'utf8',
);
// Run the original pinned class, replacing only its engine imports with actual Three geometry/math.
const body = source.slice(source.indexOf('// Continuous')).replace('export class CDLOD', 'class CDLOD');
class UniformBlock {}
class ShaderModule {
  name: string;
  code: string;
  constructor({ name, code }: { name: string; code: string }) {
    this.name = name;
    this.code = code;
  }
}
const names = [
  'Vector2',
  'Vector4',
  'Box3',
  'Frustum',
  'Matrix4',
  'Vector3',
  'Sphere',
  'InstancedBufferGeometry',
  'BufferAttribute',
  'InstancedBufferAttribute',
] as const;
const Original = new Function(...names, 'UniformBlock', 'ShaderModule', body + ';return CDLOD;')(
  ...names.map((n) => Three[n]),
  UniformBlock,
  ShaderModule,
) as new (options?: TerrainLodOptions) => TerrainLod;
function camera(x: number, y: number, z: number, fov = 60): Three.PerspectiveCamera {
  const c = new Three.PerspectiveCamera(fov, 16 / 9, 0.1, 50000);
  c.position.set(x, y, z);
  c.lookAt(x + 25, 0, z - 100);
  c.updateProjectionMatrix();
  return c;
}
describe('pinned Tidewater CDLOD geometry and selection', () => {
  it.each([8, 32, 40, 64])(
    'copies complete normalized topology and strip/checkerboard ordering G=%i',
    (gridSize) => {
      const options = { gridSize },
        expected = new Original(options),
        actual = new TerrainLod(options);
      expect(actual.geometry.getAttribute('position').array).toEqual(
        expected.geometry.getAttribute('position').array,
      );
      expect(actual.geometry.index!.array).toEqual(expected.geometry.index!.array);
      expect(actual.ranges).toEqual(expected.ranges);
      expect(actual.uSpacing).toEqual(expected.uSpacing);
      expect(actual.uMorph).toEqual(expected.uMorph);
      actual.dispose();
      expected.geometry.dispose();
    },
  );
  it.each([false, true])('matches complete executable source node selection fixedRoot=%s', (fixed) => {
    const heightBounds = (x: number, z: number, x1: number, z1: number): readonly [number, number] => [
      -25,
      35 + Math.max(Math.abs(x), Math.abs(z), Math.abs(x1), Math.abs(z1)) * 0.005,
    ];
    const options = {
      gridSize: 40,
      leafSize: 8,
      levels: 9,
      rangeFactor: 2,
      heightBounds,
      center: fixed ? { x: -1024, z: -1024, size: 2048 } : null,
    };
    const expected = new Original(options),
      actual = new TerrainLod(options);
    for (const c of [
      camera(0, 3, 10),
      camera(-179, 23, 210),
      camera(511, 220, -551, 95),
      camera(-2000, 800, 1500),
      camera(0, 9000, 0),
    ]) {
      actual.update(c);
      expected.update(c);
      expect(actual.count).toBe(expected.count);
      expect(actual.lodCounts).toEqual(expected.lodCounts);
      expect(actual.nodeArray.slice(0, actual.count * 4)).toEqual(
        expected.nodeArray.slice(0, expected.count * 4),
      );
      expect(actual.geometry.instanceCount).toBe(actual.count);
      expect(actual.viewPosition.value).toEqual(c.position);
    }
    actual.dispose();
    expected.geometry.dispose();
  });
  it('keeps source0.2m lattice, quarter fallback snapping and negative odd-index morph', () => {
    const lod = new TerrainLod({ gridSize: 40, leafSize: 8, levels: 9, rangeFactor: 2 });
    expect(lod.uSpacing.array[0]).toBe(0.2);
    const full = [-8, -8, 8, 0] as const,
      quarter = [-8, -8, 4, 0] as const;
    expect(lod.snapped(full, [0.025, 0.025])).toEqual(lod.snapped(quarter, [0.05, 0.05]));
    const p = lod.snapped(full, [0.025, 0.025]);
    const m = lod.morphVertex(full, [0.025, 0.025], new Three.Vector3(500, 0, 500));
    expect(m.morphK).toBe(1);
    expect(m.worldXZ[0]).toBeCloseTo(p[0] - 0.2);
    expect(m.spacing).toBe(0.4);
    lod.dispose();
  });
  it('matches source frustum selection for WebGPU and orthographic projection conventions', () => {
    const options = { gridSize: 40, levels: 9 },
      actual = new TerrainLod(options),
      expected = new Original(options);
    const perspective = camera(-25, 20, 100);
    perspective.coordinateSystem = Three.WebGPUCoordinateSystem;
    perspective.updateProjectionMatrix();
    const ortho = new Three.OrthographicCamera(-120, 120, 80, -80, 0.1, 8000);
    ortho.position.set(25, 50, 90);
    ortho.lookAt(0, 0, 0);
    for (const c of [perspective, ortho]) {
      actual.update(c);
      expected.update(c);
      expect(actual.count).toBe(expected.count);
      expect(actual.nodeArray.slice(0, actual.count * 4)).toEqual(
        expected.nodeArray.slice(0, expected.count * 4),
      );
    }
    actual.dispose();
    expected.geometry.dispose();
  });
  it('reports bounded instance overflow while matching source truncation and handles disposal', () => {
    const options = { gridSize: 40, maxInstances: 2, levels: 9 },
      actual = new TerrainLod(options),
      expected = new Original(options),
      c = camera(0, 2, 0);
    actual.update(c);
    expected.update(c);
    expect(actual.count).toBe(2);
    expect(actual.overflowCount).toBeGreaterThan(0);
    expect(actual.nodeArray).toEqual(expected.nodeArray);
    let events = 0;
    actual.geometry.addEventListener('dispose', () => events++);
    actual.dispose();
    actual.dispose();
    actual.update(c);
    expect(events).toBe(1);
    expect(actual.count).toBe(0);
    expected.geometry.dispose();
    expect(() => new TerrainLod({ gridSize: 39 })).toThrow(RangeError);
    expect(() => new TerrainLod({ center: { x: 0, z: 0, size: 1e10 } })).toThrow(RangeError);
  });
});
