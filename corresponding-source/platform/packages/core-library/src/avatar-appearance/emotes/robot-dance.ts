import { arm, at, defineAnimation, mirror, type Pose, type V3 } from '../_animation.js';

/**
 * Stiff robot moves: one arm hangs with the forearm straight ahead, the other is out to the side with the forearm
 * straight up (an L), and they swap with a sharp head turn. Arms by `armPose` (joint law and palms, CHAR-02).
 */
const DOWN_AHEAD: [V3, V3, V3] = [
  [0.15, -0.97, 0.1],
  [0.05, 0.05, 1],
  [-1, 0, 0],
];
const OUT_UP: [V3, V3, V3] = [
  [1, 0.05, 0.1],
  [0.05, 1, 0.05],
  [0, 0, 1],
];
const robot = (side: 1 | -1): Pose => {
  const [left, right] = side > 0 ? [DOWN_AHEAD, OUT_UP] : [OUT_UP, DOWN_AHEAD];
  return {
    ...arm('Left', left[0], left[1], left[2]),
    ...arm('Right', mirror(right[0]), mirror(right[1]), mirror(right[2])),
    Head: [0, 35 * side, 0],
    Spine2: [0, 12 * side, 0],
    hipsY: -0.02,
  };
};

export default defineAnimation({
  slug: 'robot-dance',
  name: 'Robot dance',
  clip: 'RobotDance',
  subcategory: 'emotes',
  kind: 'loop',
  duration: 1.6,
  grip: 0.1,
  keys: [
    at(0, robot(1)),
    at(0.35, robot(1)),
    at(0.45, robot(-1)),
    at(1.15, robot(-1)),
    at(1.25, robot(1)),
    at(1.6, robot(1)),
  ],
});
