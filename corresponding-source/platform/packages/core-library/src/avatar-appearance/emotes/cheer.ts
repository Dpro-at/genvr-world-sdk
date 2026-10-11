import { at, beats, bothArms, defineAnimation, type Pose } from '../_animation.js';

/** Arms up in a V, little hops, head up. Arms by `armPose` (joint law and palms, CHAR-02). */
const up: Pose = {
  ...bothArms([0.55, 0.8, 0.15], [0.4, 0.9, 0.15], [0, 0.2, 1]),
  Head: [-12, 0, 0],
  Spine2: [-6, 0, 0],
  hipsY: 0.06,
};
const down: Pose = { ...up, ...bothArms([0.8, 0.5, 0.25], [0.55, 0.8, 0.25], [0, 0.2, 1]), hipsY: -0.03 };

export default defineAnimation({
  slug: 'cheer',
  name: 'Cheer',
  clip: 'Cheer',
  subcategory: 'emotes',
  kind: 'once',
  duration: 1.6,
  grip: 0.1,
  keys: [at(0, {}), ...beats(0.25, 1.25, 4, up, down), at(1.6, {})],
});
