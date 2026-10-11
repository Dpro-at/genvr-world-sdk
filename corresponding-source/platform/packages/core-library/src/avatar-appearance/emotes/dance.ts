import { arm, at, defineAnimation, mirror, type Pose, type V3 } from '../_animation.js';

/** Swaying from side to side, one arm up and out, the other low in front, knees bending in turn. Arms by `armPose` (joint law and palms, CHAR-02). */
const HIGH: [V3, V3] = [
  [0.6, 0.6, 0.5],
  [0.3, 0.9, 0.3],
];
const LOW: [V3, V3] = [
  [0.3, -0.6, 0.75],
  [-0.2, 0.35, 0.9],
];
const PALM: V3 = [0, 0, 1];
const sway = (side: 1 | -1): Pose => {
  const [left, right] = side > 0 ? [HIGH, LOW] : [LOW, HIGH];
  return {
    Spine: [0, 0, 8 * side],
    Spine2: [0, 10 * side, -4 * side],
    Head: [0, -8 * side, 4 * side],
    ...arm('Left', left[0], left[1], PALM),
    ...arm('Right', mirror(right[0]), mirror(right[1]), mirror(PALM)),
    LeftLeg: [side > 0 ? 18 : 4, 0, 0],
    RightLeg: [side > 0 ? 4 : 18, 0, 0],
    LeftUpLeg: [side > 0 ? -12 : 0, 0, 0],
    RightUpLeg: [side > 0 ? 0 : -12, 0, 0],
    hipsY: -0.04,
  };
};
const middle: Pose = { ...sway(1), Spine: [0, 0, 0], Spine2: [0, 0, 0], Head: [0, 0, 0], hipsY: 0.01 };

export default defineAnimation({
  slug: 'dance',
  name: 'Dance',
  clip: 'Dance',
  subcategory: 'emotes',
  kind: 'loop',
  duration: 1.2,
  grip: 0.2,
  keys: [at(0, sway(1)), at(0.3, middle), at(0.6, sway(-1)), at(0.9, middle), at(1.2, sway(1))],
});
