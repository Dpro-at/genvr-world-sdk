import { describe, expect, it, vi } from 'vitest';
import {
  BufferGeometry,
  DataTexture,
  DirectionalLight,
  RenderTarget,
  TSL,
  Vector2,
  Vector3,
} from 'three/webgpu';
import {
  createImpostorMaterial,
  IMPOSTOR_SHADE_WGSL,
  IMPOSTOR_VERTEX_WGSL,
  type ImpostorMaterialBindings,
} from '../src/vegetation/impostor-material.js';

function bindings(): ImpostorMaterialBindings {
  const t = TSL,
    geometry = new BufferGeometry();
  const groups = [
    {
      variants: [geometry, geometry, geometry],
      center: new Vector3(0, 6, 0),
      radius: 8,
      rh: 6,
      hv: 6,
      variantBase: 0,
    },
    { variants: [geometry, geometry], center: new Vector3(0, 1, 0), radius: 2, rh: 2, hv: 1, variantBase: 3 },
  ];
  return {
    atlas: { groups, variantCount: 5, rtA: new RenderTarget(), rtB: new RenderTarget() },
    wind: {
      detail: new DataTexture(),
      gustOffset: t.uniform(new Vector2()),
      windDirection: t.uniform(new Vector2(1, 0)),
      windSpeed: t.uniform(10),
    },
    time: t.uniform(0),
    mainCamera: t.uniform(new Vector3(0, 8, 80)),
    nearRange: t.vec2(65, 45),
    farDistance: t.float(400),
    frame: t.uint(0),
    sun: new DirectionalLight(),
    sunDirection: t.vec3(0, 1, 0),
    night: t.float(0),
  };
}
describe('source impostor material adapter', () => {
  it('constructs material while borrowing atlas/wind and preserves light-transmission setup', () => {
    const b = bindings(),
      disposed = vi.fn();
    for (const x of [b.atlas.rtA, b.atlas.rtB, b.wind.detail, b.atlas.groups[0]!.variants[0]!])
      x.addEventListener('dispose', disposed);
    const mat = createImpostorMaterial(b);
    expect(mat.positionNode).toBeTruthy();
    expect(mat.maskNode).toBeTruthy();
    expect(mat.normalNode).toBeTruthy();
    expect(mat.customProgramCacheKey()).toContain('plant-transmission');
    mat.dispose();
    expect(disposed).not.toHaveBeenCalled();
    b.atlas.rtA.dispose();
    b.atlas.rtB.dispose();
    b.wind.detail.dispose();
    b.atlas.groups[0]!.variants[0]!.dispose();
  });
  it('keeps intended entry points first for native wgslFn parsing', () => {
    expect(IMPOSTOR_VERTEX_WGSL.match(/fn\s+(\w+)/)?.[1]).toBe('twImpostorVertex');
    expect(IMPOSTOR_SHADE_WGSL.match(/fn\s+(\w+)/)?.[1]).toBe('twImpostorShade');
  });
  it('accepts explicit raw quad nodes without modifying borrowed inputs', () => {
    const b = bindings(),
      position = TSL.attribute('rawQuadPosition', 'vec3'),
      normal = TSL.vec3(0, 0, 1);
    b.quad = { position, normal };
    const mat = createImpostorMaterial(b);
    expect(b.quad.position).toBe(position);
    expect(b.quad.normal).toBe(normal);
    expect(mat.positionNode).toBeTruthy();
    expect(mat.normalNode).toBeTruthy();
    mat.dispose();
    b.atlas.rtA.dispose();
    b.atlas.rtB.dispose();
    b.wind.detail.dispose();
    b.atlas.groups[0]!.variants[0]!.dispose();
  });
  it('rejects incompatible one-group atlas', () => {
    const b = bindings();
    b.atlas = { ...b.atlas, groups: b.atlas.groups.slice(0, 1) };
    expect(() => createImpostorMaterial(b)).toThrow('tree and shrub');
    b.atlas.rtA.dispose();
    b.atlas.rtB.dispose();
    b.wind.detail.dispose();
    b.atlas.groups[0]!.variants[0]!.dispose();
  });
});
