import { describe, expect, it } from 'vitest';
import {
  DirectionalLight,
  type DirectionalLightShadow,
  Object3D,
  PerspectiveCamera,
  Scene,
  Vector3,
} from 'three/webgpu';
import { cascadeDue, shadowMargin, shadowPose, shadowSphere } from '../src/tidewater-sky/shadow-math.js';
import { TidewaterShadowNode } from '../src/tidewater-sky/shadows.js';

describe('Tidewater stable shadow slices', () => {
  it('covers overlapping 10/60/400 m seams with source bands', () => {
    expect([10, 60, 400].map(shadowMargin)).toEqual([2.5, 15, 100]);
    expect(Array.from({ length: 8 }, (_, i) => [0, 1, 2].filter((c) => cascadeDue(i + 1, c)))).toEqual([
      [0, 1],
      [0, 2],
      [0, 1],
      [0],
      [0, 1],
      [0, 2],
      [0, 1],
      [0],
    ]);
  });

  it('quantizes sphere radius and keeps it stable through camera rotation', () => {
    const camera = new PerspectiveCamera(65, 16 / 9, 0.1, 5000);
    camera.updateMatrixWorld();
    const radii = [0, 1, 2].map((c) => shadowSphere(camera, c).radius);
    camera.rotation.set(0.3, 1.1, 0);
    camera.updateMatrixWorld();
    [0, 1, 2].forEach((c) => {
      expect(shadowSphere(camera, c).radius).toBe(radii[c]);
      expect(radii[c]! * 16).toBe(Math.round(radii[c]! * 16));
    });
    // Seam-expanded slice's farthest corner stays inside the sphere.
    const fit = shadowSphere(camera, 0);
    const corner = new Vector3(
      Math.tan((65 * Math.PI) / 360) * (16 / 9) * 11.25,
      Math.tan((65 * Math.PI) / 360) * 11.25,
      -11.25,
    ).applyMatrix4(camera.matrixWorld);
    expect(corner.distanceTo(fit.center)).toBeLessThanOrEqual(fit.radius);
  });

  it('rounds positive and negative light coordinates symmetrically and handles vertical sunlight', () => {
    const a = shadowPose(new Vector3(0.6, 0, 0), 10, new Vector3(0, 0, 1), 20);
    const b = shadowPose(new Vector3(-0.6, 0, 0), 10, new Vector3(0, 0, 1), 20);
    expect(a.eye.x).toBe(1);
    expect(b.eye.x).toBe(-1);
    expect(a.eye.z).toBe(210);
    const vertical = shadowPose(new Vector3(), 10, new Vector3(0, 1, 0), 2048);
    expect(vertical.eye.toArray().every(Number.isFinite)).toBe(true);
    expect(vertical.up.toArray()).toEqual([1, 0, 0]);
  });

  it('holds skipped cascade cameras and redraws every cascade after invalidation or changed sunlight', () => {
    const scene = new Scene();
    const sun = new DirectionalLight();
    sun.position.set(0, 30, 10);
    scene.add(sun, sun.target);
    const node = new TidewaterShadowNode(sun);
    const camera = new PerspectiveCamera(65, 16 / 9, 0.1, 5000);
    node.camera = camera;
    // Exercise the scheduling/fitting independently of GPU allocation.
    for (let i = 0; i < 3; i++) {
      const light = new Object3D() as Object3D & { target: Object3D; shadow: DirectionalLightShadow };
      light.target = new Object3D();
      light.shadow = sun.shadow.clone();
      light.shadow.mapSize.set(2048, 2048);
      node.lights.push(light);
    }
    node.updateBefore();
    expect(node.rendered).toEqual([true, true, true]);
    node.updateBefore(); // frame2: near+far, middle held
    const before = node.lights[1]!.position.clone();
    camera.position.x = 50;
    node.updateBefore(); // frame3: near+middle
    const moved = node.lights[1]!.position.clone();
    expect(moved.distanceTo(before)).toBeGreaterThan(1);
    camera.position.x = 100;
    node.updateBefore(); // frame4: near only, middle held
    expect(node.rendered).toEqual([true, false, false]);
    expect(node.lights[1]!.position.toArray()).toEqual(moved.toArray());
    node.invalidate();
    node.updateBefore();
    expect(node.rendered).toEqual([true, true, true]);
    sun.position.x = 15;
    node.updateBefore();
    expect(node.rendered).toEqual([true, true, true]);
    node.dispose();
  });
});
