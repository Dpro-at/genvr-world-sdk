import { defineAnimation, referenceKey, type ReferencePose } from '../_animation.js';

/**
 * Hard Landing, built from the owner's move file docs/reference/character-anime/moves/hard-landing/move.json by
 * tooling/moves/build-moves.ts (limbs by the joint-law builders). Edit the move file and rebuild, not this file.
 */
const POSES: ReferencePose[] = [
  // fast-descent: Fast descent with feet under the body; arms spread forward and outward to prepare for a heavy impact.
  { t: 0, leftUpperArm: [0.12, -0.08, 0.99], leftForearm: [0.06, -0.5, 0.86], rightUpperArm: [-0.12, -0.08, 0.99], rightForearm: [-0.06, -0.5, 0.86], leftThigh: [0.1, -0.78, 0.62], leftShin: [0.04, -0.91, -0.41], rightThigh: [-0.1, -0.78, 0.62], rightShin: [-0.04, -0.91, -0.41], leftPalm: [0.1, 0.02, -0.99], rightPalm: [-0.1, 0.02, -0.99], bodyRoll: 0, spineBend: 4, headTurn: 0, headTilt: 3, footPoint: 10, bodyPitch: 83, grip: 0.12, hipsY: 0.24 },
  // brace: Knees and hips pre-flex before contact while the torso braces without locking the spine.
  { t: 0.1, leftUpperArm: [0.16, -0.28, 0.95], leftForearm: [0.08, -0.64, 0.76], rightUpperArm: [-0.16, -0.28, 0.95], rightForearm: [-0.08, -0.64, 0.76], leftThigh: [0.12, -0.66, 0.74], leftShin: [0.05, -0.8, -0.6], rightThigh: [-0.12, -0.66, 0.74], rightShin: [-0.05, -0.8, -0.6], leftPalm: [0.12, 0.03, -0.99], rightPalm: [-0.12, 0.03, -0.99], bodyRoll: 0, spineBend: 8, headTurn: 0, headTilt: 3, footPoint: 5, bodyPitch: 78, grip: 0.16, hipsY: 0.1 },
  // impact: Both feet hit nearly together; ankles, knees and hips immediately yield under the heavy vertical load.
  { t: 0.2, leftUpperArm: [0.14, -0.52, 0.84], leftForearm: [0.07, -0.8, 0.6], rightUpperArm: [-0.14, -0.52, 0.84], rightForearm: [-0.07, -0.8, 0.6], leftThigh: [0.14, -0.54, 0.83], leftShin: [0.06, -0.69, -0.72], rightThigh: [-0.14, -0.54, 0.83], rightShin: [-0.06, -0.69, -0.72], leftPalm: [0.1, 0.05, -0.99], rightPalm: [-0.1, 0.05, -0.99], bodyRoll: 0, spineBend: 13, headTurn: 0, headTilt: 4, footPoint: 0, bodyPitch: 72, grip: 0.18, hipsY: -0.05 },
  // collapse: The body drops into a deep squat to dissipate impact; arms swing down and back as the chest comes forward.
  { t: 0.3, leftUpperArm: [0.1, -0.76, 0.64], leftForearm: [0.05, -0.92, 0.39], rightUpperArm: [-0.1, -0.76, 0.64], rightForearm: [-0.05, -0.92, 0.39], leftThigh: [0.18, -0.42, 0.89], leftShin: [0.08, -0.56, -0.82], rightThigh: [-0.18, -0.42, 0.89], rightShin: [-0.08, -0.56, -0.82], leftPalm: [0.08, 0.07, -0.99], rightPalm: [-0.08, 0.07, -0.99], bodyRoll: 0, spineBend: 20, headTurn: 0, headTilt: 5, footPoint: 0, bodyPitch: 64, grip: 0.2, hipsY: -0.27 },
  // deep-absorb: Lowest compression point; hips sit back, knees remain aligned over the feet and the spine stays controlled.
  { t: 0.42, leftUpperArm: [0.08, -0.88, 0.47], leftForearm: [0.04, -0.97, 0.24], rightUpperArm: [-0.08, -0.88, 0.47], rightForearm: [-0.04, -0.97, 0.24], leftThigh: [0.2, -0.38, 0.9], leftShin: [0.09, -0.51, -0.86], rightThigh: [-0.2, -0.38, 0.9], rightShin: [-0.09, -0.51, -0.86], leftPalm: [0.07, 0.08, -0.99], rightPalm: [-0.07, 0.08, -0.99], bodyRoll: 0, spineBend: 23, headTurn: 0, headTilt: 4, footPoint: 0, bodyPitch: 61, grip: 0.18, hipsY: -0.36 },
  // impact-settle: The rebound is deliberately small; the character stabilises before trying to stand.
  { t: 0.54, leftUpperArm: [0.07, -0.91, 0.4], leftForearm: [0.03, -0.98, 0.18], rightUpperArm: [-0.07, -0.91, 0.4], rightForearm: [-0.03, -0.98, 0.18], leftThigh: [0.17, -0.45, 0.88], leftShin: [0.07, -0.58, -0.81], rightThigh: [-0.17, -0.45, 0.88], rightShin: [-0.07, -0.58, -0.81], leftPalm: [0.07, 0.07, -0.99], rightPalm: [-0.07, 0.07, -0.99], bodyRoll: 0, spineBend: 20, headTurn: 0, headTilt: 3, footPoint: 0, bodyPitch: 65, grip: 0.14, hipsY: -0.33 },
  // stabilise: Balance is regained in a low stance; head lifts first to re-establish awareness.
  { t: 0.66, leftUpperArm: [0.06, -0.92, 0.38], leftForearm: [0.03, -0.98, 0.17], rightUpperArm: [-0.06, -0.92, 0.38], rightForearm: [-0.03, -0.98, 0.17], leftThigh: [0.14, -0.55, 0.82], leftShin: [0.06, -0.66, -0.75], rightThigh: [-0.14, -0.55, 0.82], rightShin: [-0.06, -0.66, -0.75], leftPalm: [0.06, 0.06, -0.99], rightPalm: [-0.06, 0.06, -0.99], bodyRoll: 0, spineBend: 16, headTurn: 0, headTilt: 2, footPoint: 0, bodyPitch: 70, grip: 0.12, hipsY: -0.27 },
  // rise: Legs extend gradually as the torso stacks over the pelvis; arms return toward a neutral position.
  { t: 0.78, leftUpperArm: [0.05, -0.95, 0.31], leftForearm: [0.02, -0.99, 0.12], rightUpperArm: [-0.05, -0.95, 0.31], rightForearm: [-0.02, -0.99, 0.12], leftThigh: [0.1, -0.7, 0.71], leftShin: [0.04, -0.78, -0.62], rightThigh: [-0.1, -0.7, 0.71], rightShin: [-0.04, -0.78, -0.62], leftPalm: [0.05, 0.05, -0.99], rightPalm: [-0.05, 0.05, -0.99], bodyRoll: 0, spineBend: 11, headTurn: 0, headTilt: 1, footPoint: 0, bodyPitch: 77, grip: 0.09, hipsY: -0.18 },
  // recover: The character nearly returns to standing, retaining soft knees after the heavy landing.
  { t: 0.9, leftUpperArm: [0.04, -0.98, 0.18], leftForearm: [0.02, -1, 0.05], rightUpperArm: [-0.04, -0.98, 0.18], rightForearm: [-0.02, -1, 0.05], leftThigh: [0.06, -0.9, 0.43], leftShin: [0.03, -0.94, -0.34], rightThigh: [-0.06, -0.9, 0.43], rightShin: [-0.03, -0.94, -0.34], leftPalm: [0.05, 0.03, -0.99], rightPalm: [-0.05, 0.03, -0.99], bodyRoll: 0, spineBend: 5, headTurn: 0, headTilt: 0, footPoint: 0, bodyPitch: 85, grip: 0.07, hipsY: -0.07 },
  // finish: Stable neutral finish, ready to transition to locomotion.
  { t: 1, leftUpperArm: [0.04, -0.99, 0.1], leftForearm: [0.02, -1, 0.03], rightUpperArm: [-0.04, -0.99, 0.1], rightForearm: [-0.02, -1, 0.03], leftThigh: [0.04, -1, 0.02], leftShin: [0.02, -1, 0], rightThigh: [-0.04, -1, 0.02], rightShin: [-0.02, -1, 0], leftPalm: [0.05, 0.02, -1], rightPalm: [-0.05, 0.02, -1], bodyRoll: 0, spineBend: 0, headTurn: 0, headTilt: 0, footPoint: 0, bodyPitch: 90, grip: 0.05, hipsY: 0 },
];

const DURATION = 1.05;

export default defineAnimation({
  slug: 'hard-landing',
  name: 'Hard Landing',
  clip: 'HardLanding',
  subcategory: 'animations',
  kind: 'once',
  duration: DURATION,
  keys: POSES.map((pose) => referenceKey(pose, DURATION, 90)),
});
