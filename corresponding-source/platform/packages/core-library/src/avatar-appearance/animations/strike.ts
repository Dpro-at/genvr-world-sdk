import { arm, at, defineAnimation, type Pose } from '../_animation.js';

/** A swing: the right fist goes up and out behind the shoulder, then sweeps across the front. Arms by `armPose` (joint law and palms, CHAR-02). */
const raised: Pose = { ...arm('Right', [-0.6, 0.75, -0.1], [-0.25, 0.95, 0.15], [1, 0, 0]), Spine2: [0, 15, 0] };
const swept: Pose = { ...arm('Right', [0.35, -0.2, 0.9], [0.6, -0.3, 0.75], [0, -1, 0]), Spine2: [0, -15, 0] };

export default defineAnimation({
  slug: 'strike',
  name: 'Strike',
  clip: 'Strike',
  subcategory: 'animations',
  kind: 'once',
  duration: 0.4,
  grip: 1,
  keys: [at(0, {}), at(0.1, raised), at(0.22, swept), at(0.4, {})],
});
