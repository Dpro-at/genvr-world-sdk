import { defineAnimation, referenceKey, type ReferencePose } from '../_animation.js';

/**
 * Turn Right 90, built from the owner's move file docs/reference/character-anime/moves/turn-right-90/move.json by
 * tooling/moves/build-moves.ts (limbs by the joint-law builders). Edit the move file and rebuild, not this file.
 */
const POSES: ReferencePose[] = [
  // ready: Neutral start; gaze prepares to lead the turn toward the character's own right.
  { t: 0, leftUpperArm: [0.04, -0.99, 0.1], leftForearm: [0.02, -1, 0.03], rightUpperArm: [-0.04, -0.99, 0.1], rightForearm: [-0.02, -1, 0.03], leftThigh: [0.04, -1, 0.02], leftShin: [0.02, -1, 0], rightThigh: [-0.04, -1, 0.02], rightShin: [-0.02, -1, 0], leftPalm: [0.05, 0.02, -1], rightPalm: [-0.05, 0.02, -1], bodyRoll: 0, spineBend: 0, headTurn: 0, headTilt: 0, footPoint: 0, bodyPitch: 90, grip: 0.05, hipsY: 0 },
  // look-right: Head and upper chest initiate right before the pelvis follows.
  { t: 0.1, leftUpperArm: [0.05, -0.99, 0.05], leftForearm: [0.03, -1, 0], rightUpperArm: [-0.05, -0.98, 0.16], rightForearm: [-0.03, -0.99, 0.08], leftThigh: [0.05, -0.99, -0.06], leftShin: [0.02, -1, 0.01], rightThigh: [-0.05, -0.99, 0.08], rightShin: [-0.02, -1, 0.01], leftPalm: [0.05, 0.02, -1], rightPalm: [-0.05, 0.02, -1], bodyRoll: 1, spineBend: 1, headTurn: -28, headTilt: 0, footPoint: 0, bodyPitch: 89, grip: 0.05, hipsY: -0.01 },
  // load-left: Weight loads onto the left foot so the right foot can step into the new heading.
  { t: 0.22, leftUpperArm: [0.08, -0.96, -0.26], leftForearm: [0.04, -0.99, -0.1], rightUpperArm: [-0.08, -0.95, 0.3], rightForearm: [-0.04, -0.99, 0.12], leftThigh: [0.1, -0.98, -0.16], leftShin: [0.04, -0.99, 0.08], rightThigh: [-0.2, -0.94, 0.27], rightShin: [-0.08, -0.99, -0.1], leftPalm: [0.06, 0.02, -1], rightPalm: [-0.06, 0.02, -1], bodyRoll: 2, spineBend: 3, headTurn: -34, headTilt: 0, footPoint: 2, bodyPitch: 87, grip: 0.07, hipsY: -0.05 },
  // right-step: Right foot steps into the turn while the left foot provides the pivot and the arms counterbalance.
  { t: 0.36, leftUpperArm: [0.1, -0.92, -0.38], leftForearm: [0.05, -0.98, -0.16], rightUpperArm: [-0.1, -0.9, 0.42], rightForearm: [-0.05, -0.98, 0.18], leftThigh: [0.08, -0.99, -0.08], leftShin: [0.03, -1, 0.03], rightThigh: [-0.34, -0.82, 0.46], rightShin: [-0.14, -0.94, -0.31], leftPalm: [0.06, 0.03, -1], rightPalm: [-0.06, 0.03, -1], bodyRoll: 2, spineBend: 3, headTurn: -26, headTilt: 0, footPoint: 6, bodyPitch: 87, grip: 0.07, hipsY: -0.04 },
  // pivot: Pelvis passes through the middle of the pivot while the head is already closer to the destination. The stepping knee bends so the foot lifts (board M16).
  { t: 0.5, leftUpperArm: [0.08, -0.93, -0.36], leftForearm: [0.04, -0.99, -0.14], rightUpperArm: [-0.08, -0.93, 0.36], rightForearm: [-0.04, -0.99, 0.14], leftThigh: [0.18, -0.94, -0.29], leftShin: [0.07, -0.53, -0.83], rightThigh: [-0.16, -0.96, 0.23], rightShin: [-0.06, -0.99, -0.1], leftPalm: [0.05, 0.03, -1], rightPalm: [-0.05, 0.03, -1], bodyRoll: 0, spineBend: 2, headTurn: -16, headTilt: 0, footPoint: 3, bodyPitch: 88, grip: 0.06, hipsY: -0.03 },
  // left-follow: Left foot follows around to square the stance; shoulders settle behind the head.
  { t: 0.64, leftUpperArm: [0.06, -0.96, -0.27], leftForearm: [0.03, -0.99, -0.1], rightUpperArm: [-0.05, -0.97, 0.23], rightForearm: [-0.03, -1, 0.08], leftThigh: [0.28, -0.87, 0.4], leftShin: [0.11, -0.95, -0.29], rightThigh: [-0.06, -0.99, 0.09], rightShin: [-0.02, -1, -0.02], leftPalm: [0.05, 0.02, -1], rightPalm: [-0.05, 0.02, -1], bodyRoll: -1, spineBend: 2, headTurn: -8, headTilt: 0, footPoint: 5, bodyPitch: 88, grip: 0.05, hipsY: -0.02 },
  // square-up: Both feet settle into the new direction with a small natural follow-through in the shoulders.
  { t: 0.78, leftUpperArm: [0.04, -0.98, 0.16], leftForearm: [0.02, -1, 0.05], rightUpperArm: [-0.04, -0.99, 0.13], rightForearm: [-0.02, -1, 0.04], leftThigh: [0.1, -0.98, 0.17], leftShin: [0.04, -0.99, -0.08], rightThigh: [-0.05, -1, 0.03], rightShin: [-0.02, -1, 0], leftPalm: [0.05, 0.02, -1], rightPalm: [-0.05, 0.02, -1], bodyRoll: -1, spineBend: 1, headTurn: -3, headTilt: 0, footPoint: 2, bodyPitch: 89, grip: 0.05, hipsY: -0.01 },
  // settle: Character stabilises after completing the right turn.
  { t: 0.9, leftUpperArm: [0.04, -0.99, 0.11], leftForearm: [0.02, -1, 0.03], rightUpperArm: [-0.04, -0.99, 0.1], rightForearm: [-0.02, -1, 0.03], leftThigh: [0.05, -1, 0.03], leftShin: [0.02, -1, 0], rightThigh: [-0.04, -1, 0.02], rightShin: [-0.02, -1, 0], leftPalm: [0.05, 0.02, -1], rightPalm: [-0.05, 0.02, -1], bodyRoll: 0, spineBend: 0.5, headTurn: 0, headTilt: 0, footPoint: 0, bodyPitch: 90, grip: 0.05, hipsY: 0 },
  // finish: Final neutral pose after the root completes a 90-degree right world-space yaw.
  { t: 1, leftUpperArm: [0.04, -0.99, 0.1], leftForearm: [0.02, -1, 0.03], rightUpperArm: [-0.04, -0.99, 0.1], rightForearm: [-0.02, -1, 0.03], leftThigh: [0.04, -1, 0.02], leftShin: [0.02, -1, 0], rightThigh: [-0.04, -1, 0.02], rightShin: [-0.02, -1, 0], leftPalm: [0.05, 0.02, -1], rightPalm: [-0.05, 0.02, -1], bodyRoll: 0, spineBend: 0, headTurn: 0, headTilt: 0, footPoint: 0, bodyPitch: 90, grip: 0.05, hipsY: 0 },
];

const DURATION = 0.72;

export default defineAnimation({
  slug: 'turn-right-90',
  name: 'Turn Right 90',
  clip: 'TurnRight90',
  subcategory: 'animations',
  kind: 'once',
  duration: DURATION,
  keys: POSES.map((pose) => referenceKey(pose, DURATION, 90)),
});
