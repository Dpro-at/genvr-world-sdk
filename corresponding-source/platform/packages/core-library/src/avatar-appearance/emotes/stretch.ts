import { armPose, at, defineAnimation, type Pose, type V3 } from '../_animation.js';

/**
 * Both arms sweep out to the sides (T-pose, palms down), on up over the head (palms to the front) and back down.
 * The owner's quick check of the shoulders and hands at every arm angle (CHAR-02), and a move players can use.
 * Built with `armPose` so the palms face where a person's would (owner: the palms turned the wrong way).
 */
const arms = (left: V3, palm: V3): Pose => {
  const l = armPose('Left', left, left, palm);
  const r = armPose('Right', [-left[0], left[1], left[2]], [-left[0], left[1], left[2]], palm);
  return { LeftArm: l.arm, LeftForeArm: l.fore, RightArm: r.arm, RightForeArm: r.fore };
};
const side = arms([1, 0, 0], [0, -1, 0]);
const high = arms([0.5, 0.86, 0.05], [0, 0, 1]);
const up: Pose = { ...arms([0.16, 0.98, 0.08], [0, 0, 1]), Head: [-8, 0, 0] };

export default defineAnimation({
  slug: 'stretch',
  name: 'Stretch',
  clip: 'Stretch',
  subcategory: 'emotes',
  kind: 'once',
  duration: 3,
  grip: 0.05,
  keys: [at(0, {}), at(0.7, side), at(1.0, high), at(1.3, up), at(1.7, up), at(2.0, high), at(2.3, side), at(3, {})],
});
