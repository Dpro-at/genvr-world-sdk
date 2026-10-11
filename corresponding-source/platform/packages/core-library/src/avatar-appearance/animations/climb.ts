import { armPose, defineAnimation, type Key, type V3 } from '../_animation.js';

/**
 * One reach: one hand high on a rung and the other at the shoulders, the opposite knee lifted. Arms are built by
 * `armPose` (real elbow hinge, palms to the ladder), so they pass the joint law (CHAR-02).
 */
const PALM: V3 = [0, 0.2, 1];
const high = (side: 'Left' | 'Right') => armPose(side, [0.15 * sign(side), 0.95, 0.3], [0.05 * sign(side), 1, 0.25], PALM);
const low = (side: 'Left' | 'Right') => armPose(side, [0.35 * sign(side), -0.15, 0.9], [0.1 * sign(side), 0.95, 0.3], PALM);
function sign(side: 'Left' | 'Right') {
  return side === 'Left' ? 1 : -1;
}

const reach = (t: number, left: boolean): Key => {
  const l = left ? high('Left') : low('Left');
  const r = left ? low('Right') : high('Right');
  return [
    t,
    {
      LeftArm: l.arm,
      LeftForeArm: l.fore,
      RightArm: r.arm,
      RightForeArm: r.fore,
      LeftUpLeg: [left ? -10 : -50, 0, 0],
      RightUpLeg: [left ? -50 : -10, 0, 0],
      LeftLeg: [left ? 15 : 80, 0, 0],
      RightLeg: [left ? 80 : 15, 0, 0],
      Head: [-10, 0, 0],
    },
  ];
};

/**
 * Climbing a ladder (P2-23): hands reach up in turn and the knees lift in turn. The engine plays
 * it faster or slower with the climbing speed and holds it while the player hangs still.
 */
export default defineAnimation({
  slug: 'climb',
  name: 'Climb',
  clip: 'Climb',
  subcategory: 'animations',
  kind: 'loop',
  duration: 0.8,
  grip: 0.85,
  keys: [reach(0, true), reach(0.4, false), reach(0.8, true)],
});
