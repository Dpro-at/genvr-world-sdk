import { armPose, at, defineAnimation, type Pose } from '../_animation.js';

/**
 * Right hand at the chin, left arm across the belly under the right elbow, head tilted. Built with `armPose` so
 * the elbows bend the way elbows do (the old pose bent the right elbow backward; joint law, CHAR-02).
 */
const right = armPose('Right', [-0.2, -0.45, 0.87], [0.35, 0.9, 0.25], [0.3, 0.3, -0.9]);
const left = armPose('Left', [0.2, -0.9, 0.35], [-0.95, 0.05, 0.3], [0, 1, 0]);
const think: Pose = {
  RightArm: right.arm,
  RightForeArm: right.fore,
  LeftArm: left.arm,
  LeftForeArm: left.fore,
  Head: [6, 0, -10],
};

export default defineAnimation({
  slug: 'think',
  name: 'Think',
  clip: 'Think',
  subcategory: 'emotes',
  kind: 'once',
  duration: 2.4,
  keys: [at(0, {}), at(0.4, think), at(1.2, { ...think, Head: [6, 0, 8] }), at(2, think), at(2.4, {})],
});
