import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three/webgpu';
import { grassDensity, grassShare, GrassView, type GrassGround } from '../src/grass.js';

const ground = (overrides: Partial<GrassGround> = {}): GrassGround => ({
  isGrass: () => true,
  height: () => 0,
  slope: () => 0,
  blocked: () => false,
  ...overrides,
});

describe('grass that grows by itself (P2-38)', () => {
  it('grows on flat grass ground only', () => {
    expect(grassShare(ground(), 0, 0)).toBe(1);
    expect(grassShare(ground({ isGrass: () => false }), 0, 0)).toBe(0);
    expect(grassShare(ground({ blocked: () => true }), 0, 0)).toBe(0);
    expect(grassShare(ground({ slope: () => 40 }), 0, 0)).toBe(0);
    expect(grassShare(ground({ slope: () => 30 }), 0, 0)).toBeGreaterThan(0);
    expect(grassShare(ground({ slope: () => 30 }), 0, 0)).toBeLessThan(1);
  });

  it('thins out with distance and stops at the edge', () => {
    expect(grassDensity(0, 50, 10)).toBe(10);
    expect(grassDensity(35, 50, 10)).toBeLessThan(10);
    expect(grassDensity(35, 50, 10)).toBeGreaterThan(0);
    expect(grassDensity(50, 50, 10)).toBe(0);
  });

  it('grows patches around the camera and drops them far away', () => {
    const view = new GrassView(ground());
    view.setDensity(30, 2);
    view.update(0, 0);
    const near = view.patchCount;
    expect(near).toBeGreaterThan(4);
    view.update(1000, 1000);
    // About as many patches around the new spot (the grid lines fall differently).
    expect(Math.abs(view.patchCount - near)).toBeLessThanOrEqual(3);
    const names = view.group.children.map((child) => child.name);
    expect(names.every((name) => name.startsWith('grass:6'))).toBe(true);
    view.dispose();
  });

  it('grows nothing where the ground is not grass', () => {
    const view = new GrassView(ground({ isGrass: () => false }));
    view.setDensity(30, 2);
    view.update(0, 0);
    for (const child of view.group.children) expect((child as unknown as { count: number }).count).toBe(0);
    view.dispose();
  });

  it('draws each clump as two crossed cards of 8 triangles', () => {
    const view = new GrassView(ground());
    view.setDensity(20, 1);
    view.update(0, 0);
    const mesh = view.group.children[0] as unknown as { geometry: BufferGeometry };
    expect(mesh.geometry.index!.count / 3).toBe(8);
    const planes = [...(mesh.geometry.getAttribute('plane').array as Float32Array)];
    expect(new Set(planes)).toEqual(new Set([0, 1]));
    view.dispose();
  });

  it('reuses dropped patch meshes and spreads growing over frames', () => {
    const view = new GrassView(ground());
    view.setDensity(30, 2);
    view.update(0, 0);
    const first = new Set(view.group.children);
    view.setGrowBudget(3);
    view.update(400, 400);
    expect(view.group.children.length).toBe(3);
    // The new patches ride on the dropped meshes: no new mesh, no new shader work.
    expect(view.group.children.every((mesh) => first.has(mesh))).toBe(true);
    for (let frame = 0; frame < 20; frame += 1) view.update(400, 400);
    expect(view.patchCount).toBeGreaterThan(4);
    view.dispose();
  });
});
