import { defineAnimation, referenceKey, type ReferencePose } from '../_animation.js';

/**
 * Turn Left 90, built from the owner's move file docs/reference/character-anime/moves/turn-left-90/move.json by
 * tooling/moves/build-moves.ts (limbs by the joint-law builders). Edit the move file and rebuild, not this file.
 */
const POSES: ReferencePose[] = [
  // ready: Neutral standing start; eyes establish the new direction before the feet begin the turn.
  { t: 0, leftUpperArm: [0.04, -0.99, 0.1], leftForearm: [0.02, -1, 0.03], rightUpperArm: [-0.04, -0.99, 0.1], rightForearm: [-0.02, -1, 0.03], leftThigh: [0.04, -1, 0.02], leftShin: [0.02, -1, 0], rightThigh: [-0.04, -1, 0.02], rightShin: [-0.02, -1, 0], leftPalm: [0.05, 0.02, -1], rightPalm: [-0.05, 0.02, -1], bodyRoll: 0, spineBend: 0, headTurn: 0, headTilt: 0, footPoint: 0, bodyPitch: 90, grip: 0.05, hipsY: 0 },
  // look-left: Head and upper chest initiate toward the character's left, creating anticipation before the pelvis follows.
  { t: 0.1, leftUpperArm: [0.05, -0.98, 0.16], leftForearm: [0.03, -0.99, 0.08], rightUpperArm: [-0.05, -0.99, 0.05], rightForearm: [-0.03, -1, 0], leftThigh: [0.05, -0.99, 0.08], leftShin: [0.02, -1, 0.01], rightThigh: [-0.05, -0.99, -0.06], rightShin: [-0.02, -1, 0.01], leftPalm: [0.05, 0.02, -1], rightPalm: [-0.05, 0.02, -1], bodyRoll: -1, spineBend: 1, headTurn: 28, headTilt: 0, footPoint: 0, bodyPitch: 89, grip: 0.05, hipsY: -0.01 },
  // load-right: Weight settles mostly onto the right foot; left foot becomes light and ready to step into the turn.
  { t: 0.22, leftUpperArm: [0.08, -0.95, 0.3], leftForearm: [0.04, -0.99, 0.12], rightUpperArm: [-0.08, -0.96, -0.26], rightForearm: [-0.04, -0.99, -0.1], leftThigh: [0.2, -0.94, 0.27], leftShin: [0.08, -0.99, -0.1], rightThigh: [-0.1, -0.98, -0.16], rightShin: [-0.04, -0.99, 0.08], leftPalm: [0.06, 0.02, -1], rightPalm: [-0.06, 0.02, -1], bodyRoll: -2, spineBend: 3, headTurn: 34, headTilt: 0, footPoint: 2, bodyPitch: 87, grip: 0.07, hipsY: -0.05 },
  // left-step: Left foot steps into the new heading while the right foot acts as the pivot; arms counter the rotation.
  { t: 0.36, leftUpperArm: [0.1, -0.9, 0.42], leftForearm: [0.05, -0.98, 0.18], rightUpperArm: [-0.1, -0.92, -0.38], rightForearm: [-0.05, -0.98, -0.16], leftThigh: [0.34, -0.82, 0.46], leftShin: [0.14, -0.94, -0.31], rightThigh: [-0.08, -0.99, -0.08], rightShin: [-0.03, -1, 0.03], leftPalm: [0.06, 0.03, -1], rightPalm: [-0.06, 0.03, -1], bodyRoll: -2, spineBend: 3, headTurn: 26, headTilt: 0, footPoint: 6, bodyPitch: 87, grip: 0.07, hipsY: -0.04 },
  // pivot: Pelvis passes through the middle of the 90-degree pivot; head is already closer to the destination heading.
  { t: 0.5, leftUpperArm: [0.08, -0.93, 0.36], leftForearm: [0.04, -0.99, 0.14], rightUpperArm: [-0.08, -0.93, -0.36], rightForearm: [-0.04, -0.99, -0.14], leftThigh: [0.16, -0.96, 0.23], leftShin: [0.06, -0.99, -0.1], rightThigh: [-0.18, -0.94, -0.29], rightShin: [-0.07, -0.98, 0.17], leftPalm: [0.05, 0.03, -1], rightPalm: [-0.05, 0.03, -1], bodyRoll: 0, spineBend: 2, headTurn: 16, headTilt: 0, footPoint: 3, bodyPitch: 88, grip: 0.06, hipsY: -0.03 },
  // right-follow: Right foot lifts and follows around to square the stance; shoulders settle behind the head.
  { t: 0.64, leftUpperArm: [0.05, -0.97, 0.23], leftForearm: [0.03, -1, 0.08], rightUpperArm: [-0.06, -0.96, -0.27], rightForearm: [-0.03, -0.99, -0.1], leftThigh: [0.06, -0.99, 0.09], leftShin: [0.02, -1, -0.02], rightThigh: [-0.28, -0.87, 0.4], rightShin: [-0.11, -0.95, -0.29], leftPalm: [0.05, 0.02, -1], rightPalm: [-0.05, 0.02, -1], bodyRoll: 1, spineBend: 2, headTurn: 8, headTilt: 0, footPoint: 5, bodyPitch: 88, grip: 0.05, hipsY: -0.02 },
  // square-up: Both feet settle into the new direction; residual shoulder and arm motion follows through naturally.
  { t: 0.78, leftUpperArm: [0.04, -0.99, 0.13], leftForearm: [0.02, -1, 0.04], rightUpperArm: [-0.04, -0.98, 0.16], rightForearm: [-0.02, -1, 0.05], leftThigh: [0.05, -1, 0.03], leftShin: [0.02, -1, 0], rightThigh: [-0.1, -0.98, 0.17], rightShin: [-0.04, -0.99, -0.08], leftPalm: [0.05, 0.02, -1], rightPalm: [-0.05, 0.02, -1], bodyRoll: 1, spineBend: 1, headTurn: 3, headTilt: 0, footPoint: 2, bodyPitch: 89, grip: 0.05, hipsY: -0.01 },
  // settle: Character finishes facing 90 degrees left in a stable neutral stance with the gaze straight ahead.
  { t: 0.9, leftUpperArm: [0.04, -0.99, 0.1], leftForearm: [0.02, -1, 0.03], rightUpperArm: [-0.04, -0.99, 0.11], rightForearm: [-0.02, -1, 0.03], leftThigh: [0.04, -1, 0.02], leftShin: [0.02, -1, 0], rightThigh: [-0.05, -1, 0.03], rightShin: [-0.02, -1, 0], leftPalm: [0.05, 0.02, -1], rightPalm: [-0.05, 0.02, -1], bodyRoll: 0, spineBend: 0.5, headTurn: 0, headTilt: 0, footPoint: 0, bodyPitch: 90, grip: 0.05, hipsY: 0 },
  // finish: Final neutral pose after the root has completed its 90-degree left world-space yaw.
  { t: 1, leftUpperArm: [0.04, -0.99, 0.1], leftForearm: [0.02, -1, 0.03], rightUpperArm: [-0.04, -0.99, 0.1], rightForearm: [-0.02, -1, 0.03], leftThigh: [0.04, -1, 0.02], leftShin: [0.02, -1, 0], rightThigh: [-0.04, -1, 0.02], rightShin: [-0.02, -1, 0], leftPalm: [0.05, 0.02, -1], rightPalm: [-0.05, 0.02, -1], bodyRoll: 0, spineBend: 0, headTurn: 0, headTilt: 0, footPoint: 0, bodyPitch: 90, grip: 0.05, hipsY: 0 },
];

const DURATION = 0.72;

export default defineAnimation({
  slug: 'turn-left-90',
  name: 'Turn Left 90',
  clip: 'TurnLeft90',
  subcategory: 'animations',
  kind: 'once',
  duration: DURATION,
  keys: POSES.map((pose) => referenceKey(pose, DURATION, 90)),
});
