import { arm, at, defineAnimation, type Pose } from '../_animation.js';

/** The right arm points straight ahead, palm down; the head and chest turn a little toward it. Arms by `armPose` (joint law and palms, CHAR-02). */
const point: Pose = {
  ...arm('Right', [-0.1, 0.05, 1], [-0.1, 0.05, 1], [0, -1, 0]),
  Head: [-4, -6, 0],
  Spine2: [0, -8, 0],
};

export default defineAnimation({
  slug: 'point',
  name: 'Point',
  clip: 'Point',
  subcategory: 'emotes',
  kind: 'once',
  duration: 1.6,
  grip: 0.6,
  keys: [at(0, {}), at(0.3, point), at(1.3, point), at(1.6, {})],
});
