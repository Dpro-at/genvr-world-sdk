import { at, beats, bothArms, defineAnimation, type Pose } from '../_animation.js';

/** Hands on the belly, rocking back and forth. Arms by `armPose` (joint law and palms, CHAR-02). */
const hands = bothArms([0.45, -0.85, 0.25], [-0.7, 0.1, 0.7], [0, 0, -1]);
const rock = (back: boolean): Pose => ({
  ...hands,
  Spine2: [back ? -12 : 6, 0, 0],
  Head: [back ? -18 : 4, 0, 0],
  hipsY: back ? 0.01 : -0.02,
});

export default defineAnimation({
  slug: 'laugh',
  name: 'Laugh',
  clip: 'Laugh',
  subcategory: 'emotes',
  kind: 'once',
  duration: 1.6,
  grip: 0.2,
  keys: [at(0, {}), ...beats(0.2, 1.4, 6, rock(true), rock(false)), at(1.6, {})],
});
