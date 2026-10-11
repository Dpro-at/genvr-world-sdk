import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { CANOPY_LOBE_WGSL, canopyDeformation } from '../src/vegetation/canopy-deformation.js';
import { LOBE_TABLE, SHRUB_VARIANTS } from '../src/vegetation/shrub-geometry.js';
import { TREE_VARIANTS } from '../src/vegetation/forest-tree-geometry.js';

describe('source near canopy graph', () => {
  it('embeds exactly the executable original seeded lobe rows and variant counts', () => {
    const source = readFileSync(
      '../../../tooling/other-programs/tidewater/src/world/vegetation/PlantGeometry.js',
      'utf8',
    );
    const noise = readFileSync('../../../tooling/other-programs/tidewater/src/util/Noise.js', 'utf8');
    const rand = new Function(noise.replace(/export /g, '') + ';return mulberry32;')();
    const original = new Function(
      'THREE',
      'GeoBuilder',
      'mulberry32',
      source.replace(/^import .*;\r?\n/gm, '').replace(/export /g, '') +
        ';return {LOBE_TABLE,TREE_VARIANTS,SHRUB_VARIANTS};',
    )(THREE, class {}, rand);
    expect(Array.from(LOBE_TABLE)).toEqual(Array.from(original.LOBE_TABLE));
    expect([TREE_VARIANTS, SHRUB_VARIANTS]).toEqual([original.TREE_VARIANTS, original.SHRUB_VARIANTS]);
    for (const value of LOBE_TABLE) expect(CANOPY_LOBE_WGSL).toContain(String(value));
  });
  it('returns explicit vector nodes without owning or disposing the shared wind texture', () => {
    const t = THREE.TSL,
      detail = new THREE.DataTexture();
    const disposed = vi.fn();
    detail.addEventListener('dispose', disposed);
    const provider = {
      detail,
      gustOffset: t.uniform(new THREE.Vector2()),
      windDirection: t.uniform(new THREE.Vector2(1, 0)),
      windSpeed: t.uniform(7),
    };
    const inputs = {
      position: t.vec3(1, 2, 3),
      normal: t.vec3(0, 1, 0),
      instancePosition: t.vec4(0, 0, 0, 1),
      instanceData: t.vec4(0, 1, 12, 0.3),
      vegetation: t.vec4(0.5, 0.3, 0.2, 0.1),
      material: t.vec4(1, 0, 0, 0),
      lobe: t.vec4(0, 0, 0, -1),
      camera: t.uniform(new THREE.Vector3()),
      time: t.uniform(0),
      nearRange: t.vec2(75, 45),
    };
    const graph = canopyDeformation(provider, inputs);
    expect(graph.position.isNode).toBe(true);
    expect(graph.normal.isNode).toBe(true);
    expect(provider.detail).toBe(detail);
    expect(disposed).not.toHaveBeenCalled();
    detail.dispose();
  });
});
