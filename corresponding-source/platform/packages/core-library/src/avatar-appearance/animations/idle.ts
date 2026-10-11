import { arms, defineAnimation, DOWN, type Key } from '../_animation.js';

/** Standing still: slow breathing, arms relaxed. */
const breathe = (t: number, amount: number): Key => [
  t,
  {
    ...arms([0, 0, -DOWN + amount * 2], [0, 0, DOWN - amount * 2]),
    LeftForeArm: [0, -8, 0],
    RightForeArm: [0, 8, 0],
    Spine2: [-amount * 2, 0, 0],
    Head: [amount, amount * 2, 0],
    hipsY: amount * 0.008,
  },
];

export default defineAnimation({
  slug: 'idle',
  name: 'Idle',
  clip: 'Idle',
  subcategory: 'animations',
  kind: 'loop',
  duration: 2.4,
  keys: [breathe(0, 0), breathe(1.2, 1), breathe(2.4, 0)],
});
