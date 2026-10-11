import { bothArms, defineAnimation, type Key } from '../_animation.js';

/** In the air: knees tucked in turn, arms forward and a little out for balance. Arms by `armPose` (joint law and palms, CHAR-02). */
const ARMS = bothArms([0.45, -0.55, 0.7], [0.3, 0.1, 0.95], [-0.6, -0.3, 0.3]);
const air = (t: number, tuck: number): Key => [
  t,
  {
    LeftUpLeg: [-35 - tuck, 0, 0],
    RightUpLeg: [-20 - tuck, 0, 0],
    LeftLeg: [55 + tuck, 0, 0],
    RightLeg: [35 + tuck, 0, 0],
    ...ARMS,
  },
];

export default defineAnimation({
  slug: 'jump',
  name: 'Jump',
  clip: 'Jump',
  subcategory: 'animations',
  kind: 'loop',
  duration: 0.8,
  keys: [air(0, 0), air(0.4, 8), air(0.8, 0)],
});
