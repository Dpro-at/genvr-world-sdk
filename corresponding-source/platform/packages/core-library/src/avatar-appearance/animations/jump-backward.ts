import { defineAnimation, referenceKey, type ReferencePose } from '../_animation.js';

/**
 * Jump Backward, built from the owner's move file docs/reference/character-anime/moves/jump-backward/move.json by
 * tooling/moves/build-moves.ts (limbs by the joint-law builders). Edit the move file and rebuild, not this file.
 */
const POSES: ReferencePose[] = [
  // ready: Balanced start; gaze remains forward while the body prepares to jump backward.
  { t: 0, leftUpperArm: [0.04, -0.98, 0.18], leftForearm: [0.02, -1, 0.05], rightUpperArm: [-0.04, -0.98, 0.18], rightForearm: [-0.02, -1, 0.05], leftThigh: [0.05, -0.98, 0.18], leftShin: [0.02, -0.99, -0.08], rightThigh: [-0.05, -0.98, 0.18], rightShin: [-0.02, -0.99, -0.08], leftPalm: [0.05, 0.03, -1], rightPalm: [-0.05, 0.03, -1], bodyRoll: 0, spineBend: 2, headTurn: 0, headTilt: 0, footPoint: 0, bodyPitch: 91, grip: 0.07, hipsY: -0.03 },
  // countermovement: Hips drop and arms move forward so they can sweep backward during the takeoff.
  { t: 0.12, leftUpperArm: [0.05, -0.28, 0.96], leftForearm: [0.03, -0.62, 0.78], rightUpperArm: [-0.05, -0.28, 0.96], rightForearm: [-0.03, -0.62, 0.78], leftThigh: [0.08, -0.62, 0.78], leftShin: [0.03, -0.74, -0.67], rightThigh: [-0.08, -0.62, 0.78], rightShin: [-0.03, -0.74, -0.67], leftPalm: [0.05, 0.03, -1], rightPalm: [-0.05, 0.03, -1], bodyRoll: 0, spineBend: 8, headTurn: 0, headTilt: 0, footPoint: 0, bodyPitch: 82, grip: 0.08, hipsY: -0.22 },
  // backward-drive: Both legs extend as the arms sweep behind; hips travel backward while the head stays controlled.
  { t: 0.24, leftUpperArm: [0.05, -0.76, -0.65], leftForearm: [0.03, -0.94, -0.34], rightUpperArm: [-0.05, -0.76, -0.65], rightForearm: [-0.03, -0.94, -0.34], leftThigh: [0.06, -0.84, 0.54], leftShin: [0.02, -0.96, 0.27], rightThigh: [-0.06, -0.84, 0.54], rightShin: [-0.02, -0.96, 0.27], leftPalm: [0.05, 0.04, -1], rightPalm: [-0.05, 0.04, -1], bodyRoll: 0, spineBend: -3, headTurn: 0, headTilt: 0, footPoint: 18, bodyPitch: 99, grip: 0.08, hipsY: -0.03 },
  // takeoff: Feet leave the floor together; the body has a small backward lean rather than throwing the head back.
  { t: 0.34, leftUpperArm: [0.04, -0.88, -0.47], leftForearm: [0.02, -0.98, -0.18], rightUpperArm: [-0.04, -0.88, -0.47], rightForearm: [-0.02, -0.98, -0.18], leftThigh: [0.05, -0.94, -0.34], leftShin: [0.02, -0.99, 0.12], rightThigh: [-0.05, -0.94, -0.34], rightShin: [-0.02, -0.99, 0.12], leftPalm: [0.04, 0.04, -1], rightPalm: [-0.04, 0.04, -1], bodyRoll: 0, spineBend: -5, headTurn: 0, headTilt: 1, footPoint: 28, bodyPitch: 105, grip: 0.07, hipsY: 0.08 },
  // early-flight: Knees soften in flight and arms remain slightly behind to balance the backward trajectory.
  { t: 0.47, leftUpperArm: [0.04, -0.64, -0.77], leftForearm: [0.02, -0.9, -0.43], rightUpperArm: [-0.04, -0.64, -0.77], rightForearm: [-0.02, -0.9, -0.43], leftThigh: [0.05, -0.58, 0.81], leftShin: [0.02, -0.8, -0.6], rightThigh: [-0.05, -0.58, 0.81], rightShin: [-0.02, -0.8, -0.6], leftPalm: [0.04, 0.04, -1], rightPalm: [-0.04, 0.04, -1], bodyRoll: 0, spineBend: -2, headTurn: 0, headTilt: 1, footPoint: 20, bodyPitch: 103, grip: 0.06, hipsY: 0.18 },
  // apex: At the apex the feet begin searching for the floor behind the hips while the torso returns toward upright.
  { t: 0.6, leftUpperArm: [0.06, -0.46, -0.886], leftForearm: [0.02, -0.8, -0.6], rightUpperArm: [-0.06, -0.46, -0.886], rightForearm: [-0.02, -0.8, -0.6], leftThigh: [0.06, -0.44, 0.9], leftShin: [0.02, -0.72, -0.69], rightThigh: [-0.06, -0.44, 0.9], rightShin: [-0.02, -0.72, -0.69], leftPalm: [0.04, 0.04, -1], rightPalm: [-0.04, 0.04, -1], bodyRoll: 0, spineBend: 1, headTurn: 0, headTilt: 1, footPoint: 14, bodyPitch: 101, grip: 0.06, hipsY: 0.22 },
  // landing-prep: Arms come forward and feet move beneath the body to prepare for a stable blind-side landing.
  { t: 0.72, leftUpperArm: [0.04, -0.1, 0.99], leftForearm: [0.02, -0.5, 0.86], rightUpperArm: [-0.04, -0.1, 0.99], rightForearm: [-0.02, -0.5, 0.86], leftThigh: [0.07, -0.7, 0.71], leftShin: [0.03, -0.9, -0.43], rightThigh: [-0.07, -0.7, 0.71], rightShin: [-0.03, -0.9, -0.43], leftPalm: [0.04, 0.03, -1], rightPalm: [-0.04, 0.03, -1], bodyRoll: 0, spineBend: 5, headTurn: 0, headTilt: 0, footPoint: 4, bodyPitch: 96, grip: 0.06, hipsY: 0.12 },
  // contact: Both feet contact together behind the starting position; knees bend immediately to absorb the landing.
  { t: 0.83, leftUpperArm: [0.05, -0.24, 0.97], leftForearm: [0.03, -0.6, 0.8], rightUpperArm: [-0.05, -0.24, 0.97], rightForearm: [-0.03, -0.6, 0.8], leftThigh: [0.08, -0.58, 0.81], leftShin: [0.03, -0.68, -0.73], rightThigh: [-0.08, -0.58, 0.81], rightShin: [-0.03, -0.68, -0.73], leftPalm: [0.05, 0.03, -1], rightPalm: [-0.05, 0.03, -1], bodyRoll: 0, spineBend: 10, headTurn: 0, headTilt: 0, footPoint: 0, bodyPitch: 88, grip: 0.06, hipsY: -0.1 },
  // absorb: Hips sink between the feet while arms move forward as counterbalance and the chest stays controlled.
  { t: 0.92, leftUpperArm: [0.05, -0.52, 0.85], leftForearm: [0.03, -0.82, 0.57], rightUpperArm: [-0.05, -0.52, 0.85], rightForearm: [-0.03, -0.82, 0.57], leftThigh: [0.1, -0.54, 0.84], leftShin: [0.04, -0.62, -0.78], rightThigh: [-0.1, -0.54, 0.84], rightShin: [-0.04, -0.62, -0.78], leftPalm: [0.05, 0.03, -1], rightPalm: [-0.05, 0.03, -1], bodyRoll: 0, spineBend: 14, headTurn: 0, headTilt: 1, footPoint: 0, bodyPitch: 80, grip: 0.06, hipsY: -0.23 },
  // recover: Character recovers into a balanced athletic stance while still facing the original direction.
  { t: 1, leftUpperArm: [0.04, -0.96, 0.27], leftForearm: [0.02, -0.99, 0.1], rightUpperArm: [-0.04, -0.96, 0.27], rightForearm: [-0.02, -0.99, 0.1], leftThigh: [0.06, -0.88, 0.47], leftShin: [0.03, -0.91, -0.41], rightThigh: [-0.06, -0.88, 0.47], rightShin: [-0.03, -0.91, -0.41], leftPalm: [0.04, 0.04, -1], rightPalm: [-0.04, 0.04, -1], bodyRoll: 0, spineBend: 7, headTurn: 0, headTilt: 0, footPoint: 0, bodyPitch: 87, grip: 0.05, hipsY: -0.11 },
];

const DURATION = 0.92;

export default defineAnimation({
  slug: 'jump-backward',
  name: 'Jump Backward',
  clip: 'JumpBackward',
  subcategory: 'animations',
  kind: 'once',
  duration: DURATION,
  keys: POSES.map((pose) => referenceKey(pose, DURATION, 90)),
});
