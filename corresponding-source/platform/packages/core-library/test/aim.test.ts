import { describe, expect, it } from 'vitest';
import { aimArm, aimForeArm, aimLeg, aimShin, type V3 } from '../src/avatar-appearance/_animation.js';

/** Euler XYZ degrees applied to a vector (v' = Rx Ry Rz v), as three.js does. */
function turn([ex, ey, ez]: V3, v: V3): V3 {
  const r = Math.PI / 180;
  const [a, b, c] = [ex * r, ey * r, ez * r];
  let [x, y, z] = v;
  [x, y] = [x * Math.cos(c) - y * Math.sin(c), x * Math.sin(c) + y * Math.cos(c)];
  [x, z] = [x * Math.cos(b) + z * Math.sin(b), -x * Math.sin(b) + z * Math.cos(b)];
  [y, z] = [y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
  return [x, y, z];
}
const unit = (v: V3): V3 => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const close = (a: V3, b: V3) => a.forEach((value, k) => expect(value).toBeCloseTo(b[k]!, 2));

const DIRECTIONS: V3[] = [
  [0, 1, 0],
  [0, 0, 1],
  [0.3, -0.9, 0.2],
  [-0.6, 0.2, -0.7],
  [0.08, 0.55, 0.83],
];

describe('aiming bones at body-frame directions (move references, CHAR-02)', () => {
  it('points each upper arm along the direction', () => {
    for (const d of DIRECTIONS) {
      close(turn(aimArm('Left', d), [1, 0, 0]), unit(d));
      close(turn(aimArm('Right', d), [-1, 0, 0]), unit(d));
    }
  });

  it('keeps the documented conventions', () => {
    close(aimArm('Left', [0, 0, 1]), [0, -90, 0]);
    close(aimArm('Right', [0, 0, 1]), [0, 90, 0]);
    expect(aimLeg([0, 0, 1])[0]).toBeCloseTo(-90, 1);
  });

  it('points the forearm, thigh and shin along their directions', () => {
    for (const upper of DIRECTIONS)
      for (const fore of DIRECTIONS) {
        const arm = aimArm('Left', upper);
        close(turn(arm, turn(aimForeArm('Left', arm, fore), [1, 0, 0])), unit(fore));
      }
    for (const thighDirection of DIRECTIONS.filter((d) => d[1] < 0.5))
      for (const shinDirection of DIRECTIONS.filter((d) => d[1] < 0.5)) {
        const thigh = aimLeg(thighDirection);
        close(turn(thigh, [0, -1, 0]), unit(thighDirection));
        close(turn(thigh, turn(aimShin(thigh, shinDirection), [0, -1, 0])), unit(shinDirection));
      }
  });
});
