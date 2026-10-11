import { Matrix4, PerspectiveCamera, Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { cssRotation, FACE_DIRECTIONS } from '../src/view-cube.js';

/** The CSS matrix back as numbers (column-major, like three.js). */
const parse = (css: string) => new Matrix4().fromArray(css.slice(9, -1).split(',').map(Number));

/** Where a world direction ends up on screen in CSS space (x right, y down, z toward the viewer). */
function onScreen(camera: PerspectiveCamera, world: [number, number, number]): Vector3 {
  camera.updateMatrixWorld();
  const css = parse(cssRotation(camera.matrixWorldInverse.elements));
  // Faces are placed in CSS space, where the world's up is -y.
  return new Vector3(world[0], -world[1], world[2]).applyMatrix4(css);
}

const cameraAt = (x: number, y: number, z: number) => {
  const camera = new PerspectiveCamera();
  camera.position.set(x, y, z);
  camera.lookAt(0, 0, 0);
  return camera;
};

describe('view cube (owner note, docs/reference/tools/01)', () => {
  it('shows the face on the camera side toward the viewer', () => {
    for (const [face, [x, y, z]] of Object.entries(FACE_DIRECTIONS)) {
      if (face === 'top' || face === 'bottom') continue;
      const toward = onScreen(cameraAt(x * 5, y * 5, z * 5), [x, y, z]);
      expect(toward.z, face).toBeCloseTo(1);
    }
  });

  it('keeps the world up pointing up on screen for a side view', () => {
    const up = onScreen(cameraAt(0, 1, 5), [0, 1, 0]);
    expect(up.y).toBeLessThan(-0.9); // CSS y down, so up is negative
  });

  it('turns right with the camera: from the front, +X points right', () => {
    expect(onScreen(cameraAt(0, 0, 5), [1, 0, 0]).x).toBeCloseTo(1);
    expect(onScreen(cameraAt(5, 0, 0), [0, 0, 1]).x).toBeCloseTo(-1);
  });
});
