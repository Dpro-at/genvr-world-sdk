import { defineAnimation, referenceKey, type ReferencePose } from '../_animation.js';

/**
 * Soft Landing, built from the owner's move file docs/reference/character-anime/moves/soft-landing/move.json by
 * tooling/moves/build-moves.ts (limbs by the joint-law builders). Edit the move file and rebuild, not this file.
 */
const POSES: ReferencePose[] = [
  // descent: Descending with feet beneath the body; arms are forward for balance and the eyes track the landing.
  { t: 0, leftUpperArm: [0.08, -0.2, 0.98], leftForearm: [0.04, -0.58, 0.81], rightUpperArm: [-0.08, -0.2, 0.98], rightForearm: [-0.04, -0.58, 0.81], leftThigh: [0.08, -0.78, 0.62], leftShin: [0.03, -0.92, -0.39], rightThigh: [-0.08, -0.78, 0.62], rightShin: [-0.03, -0.92, -0.39], leftPalm: [0.08, 0.03, -0.99], rightPalm: [-0.08, 0.03, -0.99], bodyRoll: 0, spineBend: 5, headTurn: 0, headTilt: 2, footPoint: 8, bodyPitch: 84, grip: 0.05, hipsY: 0.16 },
  // prepare: Ankles, knees and hips pre-flex before contact instead of landing with locked legs.
  { t: 0.12, leftUpperArm: [0.1, -0.36, 0.93], leftForearm: [0.05, -0.7, 0.71], rightUpperArm: [-0.1, -0.36, 0.93], rightForearm: [-0.05, -0.7, 0.71], leftThigh: [0.1, -0.66, 0.74], leftShin: [0.04, -0.8, -0.6], rightThigh: [-0.1, -0.66, 0.74], rightShin: [-0.04, -0.8, -0.6], leftPalm: [0.08, 0.04, -0.99], rightPalm: [-0.08, 0.04, -0.99], bodyRoll: 0, spineBend: 8, headTurn: 0, headTilt: 2, footPoint: 4, bodyPitch: 80, grip: 0.05, hipsY: 0.08 },
  // toe-contact: Forefeet make soft contact first; knees immediately yield and the heels begin lowering.
  { t: 0.24, leftUpperArm: [0.08, -0.48, 0.87], leftForearm: [0.04, -0.78, 0.62], rightUpperArm: [-0.08, -0.48, 0.87], rightForearm: [-0.04, -0.78, 0.62], leftThigh: [0.1, -0.58, 0.81], leftShin: [0.04, -0.72, -0.69], rightThigh: [-0.1, -0.58, 0.81], rightShin: [-0.04, -0.72, -0.69], leftPalm: [0.07, 0.04, -0.99], rightPalm: [-0.07, 0.04, -0.99], bodyRoll: 0, spineBend: 11, headTurn: 0, headTilt: 2, footPoint: 1, bodyPitch: 76, grip: 0.05, hipsY: -0.02 },
  // absorb-one: Knees and hips flex progressively while the arms sweep down to control the body's downward momentum.
  { t: 0.36, leftUpperArm: [0.07, -0.66, 0.75], leftForearm: [0.04, -0.88, 0.47], rightUpperArm: [-0.07, -0.66, 0.75], rightForearm: [-0.04, -0.88, 0.47], leftThigh: [0.12, -0.5, 0.86], leftShin: [0.05, -0.64, -0.77], rightThigh: [-0.12, -0.5, 0.86], rightShin: [-0.05, -0.64, -0.77], leftPalm: [0.07, 0.05, -0.99], rightPalm: [-0.07, 0.05, -0.99], bodyRoll: 0, spineBend: 14, headTurn: 0, headTilt: 2, footPoint: 0, bodyPitch: 72, grip: 0.05, hipsY: -0.15 },
  // deep-absorb: Lowest point of the soft landing; hips sit back slightly and knees remain aligned with the feet.
  { t: 0.5, leftUpperArm: [0.06, -0.8, 0.6], leftForearm: [0.03, -0.95, 0.3], rightUpperArm: [-0.06, -0.8, 0.6], rightForearm: [-0.03, -0.95, 0.3], leftThigh: [0.14, -0.47, 0.87], leftShin: [0.06, -0.59, -0.8], rightThigh: [-0.14, -0.47, 0.87], rightShin: [-0.06, -0.59, -0.8], leftPalm: [0.06, 0.05, -0.99], rightPalm: [-0.06, 0.05, -0.99], bodyRoll: 0, spineBend: 16, headTurn: 0, headTilt: 1, footPoint: 0, bodyPitch: 70, grip: 0.05, hipsY: -0.25 },
  // stabilise: Downward energy is gone; the character holds a compact stable stance before rising.
  { t: 0.64, leftUpperArm: [0.05, -0.9, 0.43], leftForearm: [0.03, -0.98, 0.18], rightUpperArm: [-0.05, -0.9, 0.43], rightForearm: [-0.03, -0.98, 0.18], leftThigh: [0.1, -0.6, 0.79], leftShin: [0.04, -0.7, -0.71], rightThigh: [-0.1, -0.6, 0.79], rightShin: [-0.04, -0.7, -0.71], leftPalm: [0.06, 0.05, -0.99], rightPalm: [-0.06, 0.05, -0.99], bodyRoll: 0, spineBend: 12, headTurn: 0, headTilt: 0, footPoint: 0, bodyPitch: 75, grip: 0.05, hipsY: -0.2 },
  // rise: Legs extend smoothly as the chest stacks back over the pelvis; no abrupt snap to standing.
  { t: 0.78, leftUpperArm: [0.04, -0.95, 0.31], leftForearm: [0.02, -0.99, 0.12], rightUpperArm: [-0.04, -0.95, 0.31], rightForearm: [-0.02, -0.99, 0.12], leftThigh: [0.08, -0.76, 0.65], leftShin: [0.03, -0.84, -0.54], rightThigh: [-0.08, -0.76, 0.65], rightShin: [-0.03, -0.84, -0.54], leftPalm: [0.05, 0.04, -0.99], rightPalm: [-0.05, 0.04, -0.99], bodyRoll: 0, spineBend: 8, headTurn: 0, headTilt: 0, footPoint: 0, bodyPitch: 81, grip: 0.05, hipsY: -0.12 },
  // recover: The body returns toward neutral while retaining soft knees and a ready posture.
  { t: 0.9, leftUpperArm: [0.04, -0.98, 0.18], leftForearm: [0.02, -1, 0.05], rightUpperArm: [-0.04, -0.98, 0.18], rightForearm: [-0.02, -1, 0.05], leftThigh: [0.05, -0.92, 0.39], leftShin: [0.02, -0.96, -0.27], rightThigh: [-0.05, -0.92, 0.39], rightShin: [-0.02, -0.96, -0.27], leftPalm: [0.05, 0.03, -0.99], rightPalm: [-0.05, 0.03, -0.99], bodyRoll: 0, spineBend: 4, headTurn: 0, headTilt: 0, footPoint: 0, bodyPitch: 86, grip: 0.05, hipsY: -0.05 },
  // finish: Stable neutral finish ready to blend into idle, walk or run.
  { t: 1, leftUpperArm: [0.04, -0.99, 0.1], leftForearm: [0.02, -1, 0.03], rightUpperArm: [-0.04, -0.99, 0.1], rightForearm: [-0.02, -1, 0.03], leftThigh: [0.04, -1, 0.02], leftShin: [0.02, -1, 0], rightThigh: [-0.04, -1, 0.02], rightShin: [-0.02, -1, 0], leftPalm: [0.05, 0.02, -1], rightPalm: [-0.05, 0.02, -1], bodyRoll: 0, spineBend: 0, headTurn: 0, headTilt: 0, footPoint: 0, bodyPitch: 90, grip: 0.05, hipsY: 0 },
];

const DURATION = 0.72;

export default defineAnimation({
  slug: 'soft-landing',
  name: 'Soft Landing',
  clip: 'SoftLanding',
  subcategory: 'animations',
  kind: 'once',
  duration: DURATION,
  keys: POSES.map((pose) => referenceKey(pose, DURATION, 90)),
});
