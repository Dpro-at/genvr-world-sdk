import { at, beats, bothArms, defineAnimation, type Pose } from '../_animation.js';

/** Hands apart in front of the chest, then together, palms facing each other. Arms by `armPose` (joint law and palms, CHAR-02). */
const open: Pose = bothArms([0.35, -0.45, 0.82], [0.5, 0.25, 0.83], [-1, 0, 0.1]);
const shut: Pose = bothArms([0.35, -0.45, 0.82], [-0.75, 0.25, 0.6], [-1, 0, 0.1]);

export default defineAnimation({
  slug: 'clap',
  name: 'Clap',
  clip: 'Clap',
  subcategory: 'emotes',
  kind: 'once',
  duration: 1.8,
  grip: 0.05,
  keys: [at(0, {}), at(0.25, open), ...beats(0.4, 1.4, 6, shut, open), at(1.8, {})],
});
