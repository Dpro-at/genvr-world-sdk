import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three/webgpu';
import { FilmCamera } from '@genvr/contracts';
import { FilmRig } from '../src/filming.js';

const player = { x: 0, y: 0, z: 0 };
describe('filming rig', () => {
  it('validates settings and restores normal control by releasing the rig', () => {
    expect(() => FilmCamera.parse({ fov: NaN })).toThrow();
    expect(() => FilmCamera.parse({ position: [Infinity, 0, 0] })).toThrow();
    const rig = new FilmRig(), camera = new PerspectiveCamera();
    rig.set({ position: [2, 3, -4], target: [2, 3, 0], fov: 35 });
    rig.update(camera, 1 / 60, player);
    expect(camera.position.toArray()).toEqual([2, 3, -4]);
    expect(camera.fov).toBe(35);
    rig.reset(); camera.position.set(8, 9, 10); rig.update(camera, 1, player);
    expect(camera.position.toArray()).toEqual([8, 9, 10]);
  });
  it('follow response agrees at 30 and 120 Hz for a stationary target after movement', () => {
    const simulate = (fps: number) => {
      const rig = new FilmRig(), camera = new PerspectiveCamera();
      rig.set({ preset: 'follow', follow_player: true }); rig.update(camera, 0, player);
      for (let i = 0; i < fps; i++) rig.update(camera, 1 / fps, { x: 10, y: 0, z: 0 });
      return camera.position.x;
    };
    expect(simulate(30)).toBeCloseTo(simulate(120), 10);
  });
  it('orbit is repeatable and static camera does not drift', () => {
    const rig = new FilmRig(), camera = new PerspectiveCamera();
    rig.set({ preset: 'orbit', speed: 30, responsiveness: 30 });
    rig.update(camera, 3, player);
    expect(camera.position.x).toBeCloseTo(-8, 7);
    rig.set({ preset: 'running', seed: 17 }); rig.update(camera, 1, player);
    const first = camera.position.clone();
    rig.set({ preset: 'running', seed: 17 }); rig.update(camera, 1, player);
    expect(camera.position.equals(first)).toBe(true);
  });
  it('path flies through its stops in time and holds the last one', () => {
    expect(() => FilmCamera.parse({ path: [{ at: 0, position: [0, 0, 0], target: [0, 0, 1] }] })).toThrow();
    expect(() => FilmCamera.parse({ path: [
      { at: 2, position: [0, 0, 0], target: [0, 0, 1] }, { at: 1, position: [1, 0, 0], target: [0, 0, 1] }] })).toThrow();
    const rig = new FilmRig(), camera = new PerspectiveCamera();
    rig.set({ path: [
      { at: 0, position: [0, 5, 0], target: [0, 0, 10], fov: 40 },
      { at: 2, position: [10, 5, 0], target: [10, 0, 10], ease: 'in_out', fov: 60 },
      { at: 4, position: [10, 5, 20], target: [10, 0, 30] },
    ] });
    rig.update(camera, 0, player);
    expect(camera.position.toArray()).toEqual([0, 5, 0]);
    expect(camera.fov).toBe(40);
    rig.update(camera, 2, player);
    expect(camera.position.x).toBeCloseTo(10, 1);
    expect(camera.position.z).toBeCloseTo(0, 1);
    rig.update(camera, 1, player);
    expect(camera.position.z).toBeCloseTo(10, 0);
    for (let i = 0; i < 60; i++) rig.update(camera, 1 / 10, player);
    expect(camera.position.z).toBeCloseTo(20, 3);
    expect(camera.fov).toBe(60);
  });
});
