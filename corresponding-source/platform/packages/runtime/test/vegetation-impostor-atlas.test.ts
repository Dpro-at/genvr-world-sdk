import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import {
  ImpostorAtlas,
  impostorAxisSphere,
  impostorFrameMatrices,
} from '../src/vegetation/impostor-atlas.js';
import { buildTreeNear } from '../src/vegetation/forest-tree-geometry.js';
import { buildShrubNear } from '../src/vegetation/shrub-geometry.js';

const source = readFileSync(
  '../../../tooling/other-programs/tidewater/src/world/vegetation/Impostors.js',
  'utf8',
);
const start = source.indexOf('export const OCT_N'),
  end = source.indexOf('// Records the bake');
const original = new Function(
  'THREE',
  source.slice(start, end).replace(/export /g, '') + '} return {octDecode, frameBasis, ImpostorAtlas};',
)(THREE);
const vegetation = readFileSync('../../../tooling/other-programs/tidewater/src/world/Vegetation.js', 'utf8');
const axis = vegetation.slice(
  vegetation.indexOf('function axisSphere('),
  vegetation.indexOf('\n}', vegetation.indexOf('function axisSphere(')) + 2,
);
const originalAxis = new Function('THREE', axis + ';return axisSphere;')(THREE);

describe('source canopy impostor atlas', () => {
  it('preserves all frame matrices and source axis bounds for both plant groups', () => {
    const geometries = [buildTreeNear().geometry, buildShrubNear().geometry];
    for (const [groupIndex, geometry] of geometries.entries()) {
      const actual = impostorAxisSphere(geometry),
        expected = originalAxis(geometry);
      expect(actual.center.toArray()).toEqual(expected.center.toArray());
      expect([actual.radius, actual.rh, actual.hv]).toEqual([expected.radius, expected.rh, expected.hv]);
      const group = { ...actual, variants: [geometry], variantBase: groupIndex * 3 };
      for (let variant = 0; variant < 3; variant++) {
        const a = impostorFrameMatrices(group, variant),
          b = original.ImpostorAtlas.prototype._frameMatrices(group, variant);
        expect(a.map((m) => m.elements)).toEqual(b.map((m: THREE.Matrix4) => m.elements));
      }
      geometry.dispose();
    }
  });
  it('owns only its two targets and uses the source data dimensions and formats', () => {
    const geometry = buildTreeNear().geometry,
      material = new THREE.MeshBasicMaterial();
    const disposeGeometry = vi.fn(),
      disposeMaterial = vi.fn();
    geometry.addEventListener('dispose', disposeGeometry);
    material.addEventListener('dispose', disposeMaterial);
    const group = { ...impostorAxisSphere(geometry), variants: [geometry, geometry, geometry] };
    const atlas = new ImpostorAtlas([group, { ...group, variants: [geometry, geometry] }], {
      albedo: material,
      normal: material,
    });
    expect([atlas.width, atlas.height, atlas.variantCount]).toEqual([3840, 768, 5]);
    expect(atlas.groups.map((g) => g.variantBase)).toEqual([0, 3]);
    expect(atlas.rtA.texture.type).toBe(THREE.UnsignedByteType);
    expect(atlas.rtA.texture.colorSpace).toBe(THREE.NoColorSpace);
    expect(atlas.rtA.depthTexture?.type).toBe(THREE.FloatType);
    const targetDisposed = vi.fn();
    atlas.rtA.addEventListener('dispose', targetDisposed);
    atlas.dispose();
    atlas.dispose();
    expect(targetDisposed).toHaveBeenCalledTimes(1);
    expect(disposeGeometry).not.toHaveBeenCalled();
    expect(disposeMaterial).not.toHaveBeenCalled();
    geometry.dispose();
    material.dispose();
  });
  it('defers target release during an outstanding bake and restores renderer state on cancellation', async () => {
    const geometry = buildTreeNear().geometry,
      material = new THREE.MeshBasicMaterial();
    const atlas = new ImpostorAtlas([{ ...impostorAxisSphere(geometry), variants: [geometry] }], {
      albedo: material,
      normal: material,
    });
    const disposed = vi.fn();
    atlas.rtA.addEventListener('dispose', disposed);
    let initialized!: () => void;
    const gate = new Promise<void>((resolve) => {
      initialized = resolve;
    });
    const renderer = {
      getRenderTarget: () => null,
      getMRT: () => null,
      getClearColor: (c: THREE.Color) => c.set(0x123456),
      getClearAlpha: () => 0.4,
      autoClear: true,
      init: () => gate,
      setRenderTarget: vi.fn(),
      setMRT: vi.fn(),
      setClearColor: vi.fn(),
    };
    const pending = atlas.bake(renderer as unknown as THREE.WebGPURenderer);
    expect(atlas.bake(renderer as unknown as THREE.WebGPURenderer)).toBe(pending);
    atlas.dispose();
    expect(disposed).not.toHaveBeenCalled();
    initialized();
    await expect(pending).rejects.toThrow('disposed during bake');
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(null);
    expect(renderer.setClearColor).toHaveBeenLastCalledWith(new THREE.Color(0x123456), 0.4);
    expect(atlas.baked).toBe(false);
    atlas.dispose();
    expect(disposed).toHaveBeenCalledTimes(1);
    geometry.dispose();
    material.dispose();
  });
});
