import { bothArms, defineAnimation, hold } from '../_animation.js';

/** Sitting on a seat, hands resting on the thighs, palms down. Arms by `armPose` (joint law and palms, CHAR-02). */
export default defineAnimation({
  slug: 'sit',
  name: 'Sit',
  clip: 'Sit',
  subcategory: 'emotes',
  kind: 'loop',
  duration: 1,
  grip: 0.25,
  keys: hold(1, {
    LeftUpLeg: [-88, 0, 0],
    RightUpLeg: [-88, 0, 0],
    LeftLeg: [88, 0, 0],
    RightLeg: [88, 0, 0],
    ...bothArms([0.15, -0.8, 0.55], [0.05, -0.35, 0.93], [0, -1, 0]),
    hipsY: -0.38,
  }),
});
