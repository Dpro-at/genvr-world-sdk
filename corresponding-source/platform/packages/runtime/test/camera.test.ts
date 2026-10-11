import { describe, expect, it } from 'vitest';
import { FOLLOW_CAMERA, nextCameraDistance, rayBoxDistance } from '../src/camera.js';

describe('follow camera distance', () => {
  it('moves in at once when blocked', () => {
    expect(nextCameraDistance(9, 2.5, 1 / 60)).toBe(2.5);
  });

  it('never goes closer than the minimum', () => {
    expect(nextCameraDistance(9, -1, 1 / 60)).toBe(FOLLOW_CAMERA.minDistance);
  });

  it('eases back out smoothly when the way is clear', () => {
    let distance = 2;
    distance = nextCameraDistance(distance, 9, 1 / 60);
    expect(distance).toBeGreaterThan(2);
    expect(distance).toBeLessThan(3);
    for (let i = 0; i < 120; i += 1) distance = nextCameraDistance(distance, 9, 1 / 60);
    expect(distance).toBeGreaterThan(8.9);
    expect(distance).toBeLessThanOrEqual(9);
  });
});

describe('rayBoxDistance: the camera stays out of things without a physics body (scattered trunks)', () => {
  const trunk = { center: [0, 3, 5], half: [0.3, 3, 0.3], yaw: 0 };
  const back = { x: 0, y: 0, z: 1 };

  it('stops the camera in front of a trunk behind the player', () => {
    const d = rayBoxDistance({ x: 0, y: 1.5, z: 0 }, back, trunk, 9, 0.25);
    expect(d).toBeCloseTo(5 - 0.3 - 0.25, 5);
  });

  it('keeps the full distance when the way is clear or the trunk is beyond it', () => {
    expect(rayBoxDistance({ x: 3, y: 1.5, z: 0 }, back, trunk, 9, 0.25)).toBe(9);
    expect(rayBoxDistance({ x: 0, y: 1.5, z: 0 }, back, trunk, 4, 0.25)).toBe(4);
    expect(rayBoxDistance({ x: 0, y: 1.5, z: 0 }, { x: 0, y: 0, z: -1 }, trunk, 9, 0.25)).toBe(9);
  });

  it('ignores a box the look point is already inside (standing against a trunk)', () => {
    expect(rayBoxDistance({ x: 0, y: 1.5, z: 4.6 }, back, trunk, 9, 0.25)).toBe(9);
  });

  it('follows a turned box', () => {
    const wide = { center: [0, 3, 5], half: [3, 3, 0.3], yaw: Math.PI / 2 };
    // Turned a quarter, the 6 m wide box lies along z: it starts 3 m ahead.
    expect(rayBoxDistance({ x: 0, y: 1.5, z: 0 }, back, wide, 9, 0)).toBeCloseTo(2, 5);
  });
});
