import { arm, at, defineAnimation, type Pose } from '../_animation.js';

/** A hammer blow: the right fist lifts beside the head, then strikes ahead and down. Arms by `armPose` (joint law and palms, CHAR-02). */
const lifted: Pose = { ...arm('Right', [-0.25, 0.65, 0.7], [0, 0.7, -0.7], [1, 0, 0]), Spine2: [0, -6, 0] };
const struck: Pose = { ...arm('Right', [-0.15, -0.2, 0.97], [-0.05, -0.55, 0.83], [1, 0, 0]), Spine2: [0, -10, 0] };

export default defineAnimation({
  slug: 'build',
  name: 'Build',
  clip: 'Build',
  subcategory: 'animations',
  kind: 'once',
  duration: 0.35,
  grip: 0.8,
  keys: [at(0, {}), at(0.1, lifted), at(0.22, struck), at(0.35, {})],
});
