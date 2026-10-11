import { armPose, at, defineAnimation, type Pose } from '../_animation.js';

/**
 * The right hand goes to the forehead: elbow out at shoulder height, forearm in to the brow, palm down and out.
 * Built with `armPose` (the old pose bent the elbow sideways; joint law, CHAR-02).
 */
const arm = armPose('Right', [-0.8, 0.05, 0.6], [0.55, 0.6, 0.15], [-0.2, -0.6, 0.75]);
const salute: Pose = {
  RightArm: arm.arm,
  RightForeArm: arm.fore,
  Head: [-3, 0, 0],
  Spine2: [-3, 0, 0],
};

export default defineAnimation({
  slug: 'salute',
  name: 'Salute',
  clip: 'Salute',
  subcategory: 'emotes',
  kind: 'once',
  duration: 1.6,
  keys: [at(0, {}), at(0.35, salute), at(1.25, salute), at(1.6, {})],
});
