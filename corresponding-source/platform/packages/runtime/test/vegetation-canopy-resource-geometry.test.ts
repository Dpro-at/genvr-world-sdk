import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { GeoBuilder } from '../src/vegetation/geometry-builder.js';
import {
  buildCanopyResourceGeometry,
  canopyResourceData,
  type CanopyKind,
} from '../src/vegetation/canopy-resource-geometry.js';

const noise = readFileSync('../../../tooling/other-programs/tidewater/src/util/Noise.js', 'utf8');
const source = readFileSync(
  '../../../tooling/other-programs/tidewater/src/world/vegetation/PlantGeometry.js',
  'utf8',
);
const original = new Function(
  'THREE',
  'GeoBuilder',
  'mulberry32',
  source.replace(/^import .*;\r?\n/gm, '').replace(/export /g, '') +
    ';return {buildTreeNear,buildShrubNear,lobeVariantGeometry,LOBE_TABLE};',
)(THREE, GeoBuilder, new Function(noise.replace(/export /g, '') + ';return mulberry32;')());

describe('canopy reusable resource geometry', () => {
  it('preserves continuous source seeds and original variant geometry at authored size/stretch', () => {
    for (const kind of ['tree', 'shrub'] as CanopyKind[]) {
      for (const appearanceSeed of [0.02, 0.17, 0.3, 0.56, 0.99]) {
        const definition = { kind, appearanceSeed, size: 1.3, stretch: 0.83 };
        const resource = buildCanopyResourceGeometry(definition);
        const raw = (kind === 'tree' ? original.buildTreeNear() : original.buildShrubNear()).geometry;
        const variant = Math.floor(((appearanceSeed * 7.77) % 1) * (kind === 'tree' ? 3 : 2));
        const expected = original.lobeVariantGeometry(
          raw,
          original.LOBE_TABLE,
          (variant + (kind === 'tree' ? 0 : 3)) * 8,
        );
        expected.applyMatrix4(new THREE.Matrix4().makeScale(1.3, 1.3 * 0.83, 1.3));
        for (const name of Object.keys(expected.attributes)) {
          const a = resource.preview.getAttribute(name),
            b = expected.getAttribute(name);
          for (let i = 0; i < a.count; i++)
            for (let c = 0; c < a.itemSize; c++) expect(a.getComponent(i, c)).toBe(b.getComponent(i, c));
        }
        expect(resource.definition.appearanceSeed).toBe(appearanceSeed);
        expect(resource.height).toBe((kind === 'tree' ? 12.5 : 1.6) * 1.3 * 0.83);
        expect(resource.signedStretch).toBe(kind === 'tree' ? 0.83 : -0.83);
        expect(resource.trunk.isEmpty()).toBe(false);
        expect(resource.preview.boundingBox!.containsBox(resource.trunk)).toBe(true);
        expect(resource.source.getAttribute('position').getY(0)).toBe(raw.getAttribute('position').getY(0));
        resource.dispose();
        raw.dispose();
        expected.dispose();
      }
    }
  });
  it('matches original GPU boundary results without replacing the authored seed', () => {
    // Measured independently by vegetation-canopy-seed-gpu.mjs, source WGSL on f32 attributes.
    const cases: [CanopyKind, number, number][] = [
      ['shrub', 0.06435006435006435, 0],
      ['tree', 0.1287001287001287, 2],
      ['shrub', 0.1287001287001287, 1],
      ['shrub', 0.19305019080638885, 1],
      ['tree', 0.2574002574002574, 2],
    ];
    for (const [kind, appearanceSeed, variant] of cases) {
      expect(canopyResourceData({ kind, appearanceSeed, size: 1, stretch: 1 }).variant).toBe(variant);
    }
  });
  it('rejects invalid source metadata and disposes owned geometries exactly once', () => {
    const definition = { kind: 'tree' as const, appearanceSeed: 0.12345, size: 1, stretch: 1 };
    for (const appearanceSeed of [-1, 1, NaN, Infinity])
      expect(() => canopyResourceData({ ...definition, appearanceSeed })).toThrow();
    for (const size of [0, -1, NaN, Infinity])
      expect(() => canopyResourceData({ ...definition, size })).toThrow();
    for (const stretch of [0, -1, NaN, Infinity])
      expect(() => canopyResourceData({ ...definition, stretch })).toThrow();
    const resource = buildCanopyResourceGeometry(definition),
      a = vi.fn(),
      b = vi.fn();
    resource.source.addEventListener('dispose', a);
    resource.preview.addEventListener('dispose', b);
    definition.size = 7;
    expect(resource.definition.size).toBe(1);
    resource.dispose();
    resource.dispose();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
