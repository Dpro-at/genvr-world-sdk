import { bothArms, defineAnimation, hold } from '../_animation.js';

/** Sitting on the ground, legs ahead, leaning back on straight arms, palms flat on the ground. Arms by `armPose` (joint law and palms, CHAR-02). */
export default defineAnimation({
  slug: 'sit-ground',
  name: 'Sit on the ground',
  clip: 'SitGround',
  subcategory: 'animations',
  kind: 'loop',
  duration: 1,
  grip: 0.05,
  keys: hold(1, {
    LeftUpLeg: [-86, 0, 6],
    RightUpLeg: [-86, 0, -6],
    LeftLeg: [4, 0, 0],
    RightLeg: [4, 0, 0],
    ...bothArms([0.3, -0.9, -0.35], [0.25, -0.95, -0.25], [0, -1, 0]),
    Spine: [-8, 0, 0],
    hipsY: -0.72,
  }),
});
