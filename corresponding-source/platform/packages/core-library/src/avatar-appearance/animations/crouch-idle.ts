import { defineAnimation, referenceKey, type ReferencePose } from '../_animation.js';

/**
 * Crouch Idle, built from the owner's move file docs/reference/character-anime/moves/crouch-idle/move.json by
 * tooling/moves/build-moves.ts (limbs by the joint-law builders). Edit the move file and rebuild, not this file.
 */
const POSES: ReferencePose[] = [
  // neutral-crouch: Balanced low crouch with knees tracking over the feet, relaxed ready arms and steady forward gaze.
  { t: 0, leftUpperArm: [0.1, -0.82, 0.56], leftForearm: [0.05, -0.73, 0.68], rightUpperArm: [-0.1, -0.82, 0.56], rightForearm: [-0.05, -0.73, 0.68], leftThigh: [0.18, -0.5, 0.85], leftShin: [0.08, -0.79, -0.61], rightThigh: [-0.18, -0.5, 0.85], rightShin: [-0.08, -0.79, -0.61], leftPalm: [0.08, 0.08, -0.99], rightPalm: [-0.08, 0.08, -0.99], bodyRoll: 0, spineBend: 8, headTurn: 0, headTilt: -1, footPoint: 2, bodyPitch: 74, grip: 0.1, hipsY: -0.46 },
  // inhale: Chest opens slightly on the inhale while the hips remain low and balanced.
  { t: 0.14, leftUpperArm: [0.1, -0.82, 0.56], leftForearm: [0.05, -0.73, 0.68], rightUpperArm: [-0.1, -0.82, 0.56], rightForearm: [-0.05, -0.73, 0.68], leftThigh: [0.18, -0.5, 0.85], leftShin: [0.08, -0.79, -0.61], rightThigh: [-0.18, -0.5, 0.85], rightShin: [-0.08, -0.79, -0.61], leftPalm: [0.08, 0.08, -0.99], rightPalm: [-0.08, 0.08, -0.99], bodyRoll: 0.8, spineBend: 7.5, headTurn: 1, headTilt: -1, footPoint: 2, bodyPitch: 74, grip: 0.1, hipsY: -0.455 },
  // weight-left: A very small weight shift moves toward the left leg while the head subtly checks left.
  { t: 0.29, leftUpperArm: [0.1, -0.82, 0.56], leftForearm: [0.05, -0.73, 0.68], rightUpperArm: [-0.1, -0.82, 0.56], rightForearm: [-0.05, -0.73, 0.68], leftThigh: [0.16, -0.52, 0.84], leftShin: [0.08, -0.79, -0.61], rightThigh: [-0.2, -0.48, 0.85], rightShin: [-0.08, -0.79, -0.61], leftPalm: [0.08, 0.08, -0.99], rightPalm: [-0.08, 0.08, -0.99], bodyRoll: 1.8, spineBend: 8, headTurn: 2, headTilt: -1, footPoint: 2, bodyPitch: 74, grip: 0.1, hipsY: -0.458 },
  // center: Weight returns to center; knees and elbows remain soft rather than locked.
  { t: 0.43, leftUpperArm: [0.1, -0.82, 0.56], leftForearm: [0.05, -0.73, 0.68], rightUpperArm: [-0.1, -0.82, 0.56], rightForearm: [-0.05, -0.73, 0.68], leftThigh: [0.18, -0.5, 0.85], leftShin: [0.08, -0.79, -0.61], rightThigh: [-0.18, -0.5, 0.85], rightShin: [-0.08, -0.79, -0.61], leftPalm: [0.08, 0.08, -0.99], rightPalm: [-0.08, 0.08, -0.99], bodyRoll: 0, spineBend: 8.5, headTurn: 0, headTilt: -1, footPoint: 2, bodyPitch: 74, grip: 0.1, hipsY: -0.465 },
  // exhale: The body settles a few millimetres on the exhale with relaxed shoulders.
  { t: 0.57, leftUpperArm: [0.1, -0.82, 0.56], leftForearm: [0.05, -0.73, 0.68], rightUpperArm: [-0.1, -0.82, 0.56], rightForearm: [-0.05, -0.73, 0.68], leftThigh: [0.18, -0.5, 0.85], leftShin: [0.08, -0.79, -0.61], rightThigh: [-0.18, -0.5, 0.85], rightShin: [-0.08, -0.79, -0.61], leftPalm: [0.08, 0.08, -0.99], rightPalm: [-0.08, 0.08, -0.99], bodyRoll: -0.8, spineBend: 9, headTurn: -1, headTilt: -1, footPoint: 2, bodyPitch: 74, grip: 0.1, hipsY: -0.472 },
  // weight-right: A subtle weight shift moves toward the right leg while maintaining the crouched base.
  { t: 0.71, leftUpperArm: [0.1, -0.82, 0.56], leftForearm: [0.05, -0.73, 0.68], rightUpperArm: [-0.1, -0.82, 0.56], rightForearm: [-0.05, -0.73, 0.68], leftThigh: [0.2, -0.48, 0.85], leftShin: [0.08, -0.79, -0.61], rightThigh: [-0.16, -0.52, 0.84], rightShin: [-0.08, -0.79, -0.61], leftPalm: [0.08, 0.08, -0.99], rightPalm: [-0.08, 0.08, -0.99], bodyRoll: -1.8, spineBend: 8, headTurn: -2, headTilt: -1, footPoint: 2, bodyPitch: 74, grip: 0.1, hipsY: -0.468 },
  // return: Torso, head and hips ease back toward the neutral crouch for a seamless loop.
  { t: 0.86, leftUpperArm: [0.1, -0.82, 0.56], leftForearm: [0.05, -0.73, 0.68], rightUpperArm: [-0.1, -0.82, 0.56], rightForearm: [-0.05, -0.73, 0.68], leftThigh: [0.18, -0.5, 0.85], leftShin: [0.08, -0.79, -0.61], rightThigh: [-0.18, -0.5, 0.85], rightShin: [-0.08, -0.79, -0.61], leftPalm: [0.08, 0.08, -0.99], rightPalm: [-0.08, 0.08, -0.99], bodyRoll: -0.5, spineBend: 8.2, headTurn: -0.5, headTilt: -1, footPoint: 2, bodyPitch: 74, grip: 0.1, hipsY: -0.462 },
  // neutral-crouch: Same body configuration as pose one, closing the crouch-idle loop cleanly.
  { t: 1, leftUpperArm: [0.1, -0.82, 0.56], leftForearm: [0.05, -0.73, 0.68], rightUpperArm: [-0.1, -0.82, 0.56], rightForearm: [-0.05, -0.73, 0.68], leftThigh: [0.18, -0.5, 0.85], leftShin: [0.08, -0.79, -0.61], rightThigh: [-0.18, -0.5, 0.85], rightShin: [-0.08, -0.79, -0.61], leftPalm: [0.08, 0.08, -0.99], rightPalm: [-0.08, 0.08, -0.99], bodyRoll: 0, spineBend: 8, headTurn: 0, headTilt: -1, footPoint: 2, bodyPitch: 74, grip: 0.1, hipsY: -0.46 },
];

const DURATION = 2.2;

export default defineAnimation({
  slug: 'crouch-idle',
  name: 'Crouch Idle',
  clip: 'CrouchIdle',
  subcategory: 'animations',
  kind: 'loop',
  duration: DURATION,
  keys: POSES.map((pose) => referenceKey(pose, DURATION, 90)),
});
