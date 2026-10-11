import { armPose, at, beats, defineAnimation, type Pose } from '../_animation.js';

/**
 * The right arm goes up beside the head and the hand swings side to side, palm to the front. The swing comes from
 * the shoulder turning the elbow's plane (a real elbow cannot bend sideways; joint law, CHAR-02).
 */
const raised = (fore: [number, number, number]): Pose => {
  const arm = armPose('Right', [-0.75, 0.55, 0.25], fore, [0, 0, 1]);
  return { RightArm: arm.arm, RightForeArm: arm.fore };
};
const up = raised([-0.45, 0.88, 0.15]);
const side = raised([0.2, 0.97, 0.15]);

export default defineAnimation({
  slug: 'wave',
  name: 'Wave',
  clip: 'Wave',
  subcategory: 'emotes',
  kind: 'once',
  duration: 2,
  grip: 0.05,
  keys: [at(0, {}), at(0.3, up), ...beats(0.45, 1.45, 4, side, up), at(2, {})],
});
