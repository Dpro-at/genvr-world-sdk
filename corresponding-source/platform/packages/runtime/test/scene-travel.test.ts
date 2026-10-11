import { describe, expect, it } from 'vitest';
import { travelPose } from '../src/scene-director.js';

const flat = () => 2;
const start = { x: 0, y: 2.5, z: 0, yaw: 0 };

describe('travelPose (FILM-10b)', () => {
  it('walks the spots in order at its pace and stays on the last one', () => {
    const spots = [{ x: 4, z: 0 }, { x: 4, z: 3 }];
    expect(travelPose(start, spots, 2, 1, flat, 0.5)).toMatchObject({ x: 2, z: 0, y: 2.5 });
    expect(travelPose(start, spots, 2, 1, flat, 0.5).yaw).toBeCloseTo(Math.PI / 2);
    const turned = travelPose(start, spots, 2, 3, flat, 0.5);
    expect(turned.x).toBeCloseTo(4); expect(turned.z).toBeCloseTo(2); expect(turned.yaw).toBeCloseTo(0);
    expect(travelPose(start, spots, 2, 60, flat, 0.5)).toMatchObject({ x: 4, z: 3 });
  });
  it('follows the ground height under it', () => {
    const slope = (x: number) => x * 0.5;
    expect(travelPose(start, [{ x: 4, z: 0 }], 1, 2, slope, 0.25).y).toBeCloseTo(1.25);
  });
  it('stands still at time 0 and with no spots', () => {
    expect(travelPose(start, [{ x: 4, z: 0 }], 2, 0, flat, 0.5)).toMatchObject({ x: 0, z: 0 });
    expect(travelPose(start, [], 2, 5, flat, 0.5)).toMatchObject({ x: 0, z: 0, yaw: 0 });
  });
});
