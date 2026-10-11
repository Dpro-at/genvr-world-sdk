import { defineAnimation, referenceKey, type ReferencePose } from '../_animation.js';

/**
 * Backpedal, built from the owner's move file docs/reference/character-anime/moves/backpedal/move.json by
 * tooling/moves/build-moves.ts (limbs by the joint-law builders). Edit the move file and rebuild, not this file.
 */
const POSES: ReferencePose[] = [
  // left-support: Left leg supports the body while the right knee lifts; torso stays slightly behind the hips and eyes remain forward.
  { t: 0, leftUpperArm: [0.04, -0.66, 0.75], leftForearm: [0.02, -0.86, 0.5], rightUpperArm: [-0.04, -0.78, -0.62], rightForearm: [-0.02, -0.95, -0.31], leftThigh: [0.06, -0.92, -0.39], leftShin: [0.03, -0.99, 0.1], rightThigh: [-0.08, -0.55, 0.83], rightShin: [-0.04, -0.78, -0.62], leftPalm: [0.08, 0.03, -0.99], rightPalm: [-0.08, 0.03, -0.99], bodyRoll: 2, spineBend: -3, headTurn: 0, headTilt: 0, footPoint: 8, bodyPitch: 96, grip: 0.16, hipsY: -0.05 },
  // right-reach-back: Right foot reaches backward for a short controlled step; the character avoids overstriding behind the body.
  { t: 0.12, leftUpperArm: [0.04, -0.72, 0.69], leftForearm: [0.02, -0.9, 0.43], rightUpperArm: [-0.04, -0.68, -0.73], rightForearm: [-0.02, -0.89, -0.45], leftThigh: [0.05, -0.97, -0.23], leftShin: [0.02, -0.99, 0.08], rightThigh: [-0.08, -0.66, -0.75], rightShin: [-0.04, -0.93, -0.36], leftPalm: [0.08, 0.03, -0.99], rightPalm: [-0.08, 0.03, -0.99], bodyRoll: 1, spineBend: -4, headTurn: 0, headTilt: 0, footPoint: 5, bodyPitch: 97, grip: 0.16, hipsY: -0.07 },
  // right-contact: Right foot accepts weight behind the body as the left knee lifts; arms counter-swing naturally.
  { t: 0.24, leftUpperArm: [0.04, -0.78, -0.62], leftForearm: [0.02, -0.95, -0.31], rightUpperArm: [-0.04, -0.66, 0.75], rightForearm: [-0.02, -0.86, 0.5], leftThigh: [0.08, -0.55, 0.83], leftShin: [0.04, -0.78, -0.62], rightThigh: [-0.06, -0.92, -0.39], rightShin: [-0.03, -0.99, 0.1], leftPalm: [0.08, 0.03, -0.99], rightPalm: [-0.08, 0.03, -0.99], bodyRoll: -2, spineBend: -3, headTurn: 0, headTilt: 0, footPoint: 8, bodyPitch: 96, grip: 0.16, hipsY: -0.05 },
  // right-load: Weight compresses briefly over the right leg; knees stay soft and the torso remains controlled.
  { t: 0.36, leftUpperArm: [0.04, -0.72, -0.69], leftForearm: [0.02, -0.9, -0.43], rightUpperArm: [-0.04, -0.74, 0.67], rightForearm: [-0.02, -0.91, 0.41], leftThigh: [0.08, -0.48, 0.87], leftShin: [0.04, -0.72, -0.69], rightThigh: [-0.05, -0.97, -0.23], rightShin: [-0.02, -0.99, 0.08], leftPalm: [0.08, 0.03, -0.99], rightPalm: [-0.08, 0.03, -0.99], bodyRoll: -1, spineBend: -4, headTurn: 0, headTilt: 0, footPoint: 6, bodyPitch: 97, grip: 0.16, hipsY: -0.08 },
  // left-flight: A brief low flight transfers the body backward while the left foot prepares for the next contact.
  { t: 0.5, leftUpperArm: [0.04, -0.65, 0.76], leftForearm: [0.02, -0.84, 0.54], rightUpperArm: [-0.04, -0.79, -0.61], rightForearm: [-0.02, -0.95, -0.3], leftThigh: [0.08, -0.66, -0.75], leftShin: [0.04, -0.9, -0.43], rightThigh: [-0.06, -0.88, 0.47], rightShin: [-0.03, -0.99, -0.1], leftPalm: [0.08, 0.03, -0.99], rightPalm: [-0.08, 0.03, -0.99], bodyRoll: 0, spineBend: -3, headTurn: 0, headTilt: 0, footPoint: 10, bodyPitch: 96, grip: 0.15, hipsY: -0.03 },
  // left-reach-back: Left foot reaches backward while the right leg finishes support; steps remain short for stability.
  { t: 0.62, leftUpperArm: [0.04, -0.68, -0.73], leftForearm: [0.02, -0.89, -0.45], rightUpperArm: [-0.04, -0.72, 0.69], rightForearm: [-0.02, -0.9, 0.43], leftThigh: [0.08, -0.66, -0.75], leftShin: [0.04, -0.93, -0.36], rightThigh: [-0.05, -0.97, -0.23], rightShin: [-0.02, -0.99, 0.08], leftPalm: [0.08, 0.03, -0.99], rightPalm: [-0.08, 0.03, -0.99], bodyRoll: -1, spineBend: -4, headTurn: 0, headTilt: 0, footPoint: 5, bodyPitch: 97, grip: 0.16, hipsY: -0.07 },
  // left-contact-two: Left foot accepts the next backward step while the right knee comes forward to reset the stride.
  { t: 0.74, leftUpperArm: [0.04, -0.66, 0.75], leftForearm: [0.02, -0.86, 0.5], rightUpperArm: [-0.04, -0.78, -0.62], rightForearm: [-0.02, -0.95, -0.31], leftThigh: [0.06, -0.92, -0.39], leftShin: [0.03, -0.99, 0.1], rightThigh: [-0.08, -0.55, 0.83], rightShin: [-0.04, -0.78, -0.62], leftPalm: [0.08, 0.03, -0.99], rightPalm: [-0.08, 0.03, -0.99], bodyRoll: 2, spineBend: -3, headTurn: 0, headTilt: 0, footPoint: 8, bodyPitch: 96, grip: 0.16, hipsY: -0.05 },
  // left-load: Left leg compresses under load while the right knee rises for the next backward placement.
  { t: 0.86, leftUpperArm: [0.04, -0.74, 0.67], leftForearm: [0.02, -0.91, 0.41], rightUpperArm: [-0.04, -0.72, -0.69], rightForearm: [-0.02, -0.9, -0.43], leftThigh: [0.05, -0.97, -0.23], leftShin: [0.02, -0.99, 0.08], rightThigh: [-0.08, -0.48, 0.87], rightShin: [-0.04, -0.72, -0.69], leftPalm: [0.08, 0.03, -0.99], rightPalm: [-0.08, 0.03, -0.99], bodyRoll: 1, spineBend: -4, headTurn: 0, headTilt: 0, footPoint: 6, bodyPitch: 97, grip: 0.16, hipsY: -0.08 },
  // cycle-return: The stride settles back toward the opening support pose while the head stays fixed on what is ahead.
  { t: 0.94, leftUpperArm: [0.04, -0.67, 0.74], leftForearm: [0.02, -0.87, 0.49], rightUpperArm: [-0.04, -0.77, -0.63], rightForearm: [-0.02, -0.94, -0.33], leftThigh: [0.06, -0.93, -0.36], leftShin: [0.03, -0.99, 0.09], rightThigh: [-0.08, -0.54, 0.84], rightShin: [-0.04, -0.77, -0.64], leftPalm: [0.08, 0.03, -0.99], rightPalm: [-0.08, 0.03, -0.99], bodyRoll: 2, spineBend: -3, headTurn: 0, headTilt: 0, footPoint: 8, bodyPitch: 96, grip: 0.16, hipsY: -0.05 },
  // left-support-loop: Exact opening pose repeated to close the backpedal loop seamlessly.
  { t: 1, leftUpperArm: [0.04, -0.66, 0.75], leftForearm: [0.02, -0.86, 0.5], rightUpperArm: [-0.04, -0.78, -0.62], rightForearm: [-0.02, -0.95, -0.31], leftThigh: [0.06, -0.92, -0.39], leftShin: [0.03, -0.99, 0.1], rightThigh: [-0.08, -0.55, 0.83], rightShin: [-0.04, -0.78, -0.62], leftPalm: [0.08, 0.03, -0.99], rightPalm: [-0.08, 0.03, -0.99], bodyRoll: 2, spineBend: -3, headTurn: 0, headTilt: 0, footPoint: 8, bodyPitch: 96, grip: 0.16, hipsY: -0.05 },
];

const DURATION = 0.95;

export default defineAnimation({
  slug: 'backpedal',
  name: 'Backpedal',
  clip: 'Backpedal',
  subcategory: 'animations',
  kind: 'loop',
  duration: DURATION,
  keys: POSES.map((pose) => referenceKey(pose, DURATION, 90)),
});
