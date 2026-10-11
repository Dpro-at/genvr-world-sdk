import { defineAnimation, referenceKey, type ReferencePose } from '../_animation.js';

/**
 * Strafe Right, built from the owner's move file docs/reference/character-anime/moves/strafe-right/move.json by
 * tooling/moves/build-moves.ts (limbs by the joint-law builders). Edit the move file and rebuild, not this file.
 */
const POSES: ReferencePose[] = [
  // right-contact: Right foot plants toward the character's own right; torso stays mostly forward while the left leg prepares to follow.
  { t: 0, leftUpperArm: [0.14, -0.7, -0.7], leftForearm: [0.08, -0.91, -0.4], rightUpperArm: [-0.18, -0.78, 0.6], rightForearm: [-0.12, -0.94, 0.32], leftThigh: [0.18, -0.91, -0.37], leftShin: [0.1, -0.75, 0.65], rightThigh: [-0.62, -0.77, 0.1], rightShin: [-0.24, -0.96, -0.12], leftPalm: [0.08, 0.04, -0.99], rightPalm: [-0.08, 0.04, -0.99], bodyRoll: -5, spineBend: 3, headTurn: 3, headTilt: 0, footPoint: 5, bodyPitch: 86, grip: 0.14, hipsY: -0.06 },
  // right-load: Weight compresses over the right leg; pelvis shifts right while the chest remains oriented forward.
  { t: 0.12, leftUpperArm: [0.12, -0.75, -0.65], leftForearm: [0.07, -0.93, -0.36], rightUpperArm: [-0.14, -0.82, 0.55], rightForearm: [-0.1, -0.95, 0.29], leftThigh: [-0.08, -0.72, 0.69], leftShin: [0.04, -0.65, -0.76], rightThigh: [-0.42, -0.9, 0.08], rightShin: [-0.15, -0.98, -0.1], leftPalm: [0.08, 0.04, -0.99], rightPalm: [-0.08, 0.04, -0.99], bodyRoll: -4, spineBend: 4, headTurn: 2, headTilt: 0, footPoint: 4, bodyPitch: 85, grip: 0.14, hipsY: -0.1 },
  // left-cross: Left foot travels inward toward the right without excessive crossing; hips lead the lateral movement.
  { t: 0.24, leftUpperArm: [0.08, -0.82, -0.57], leftForearm: [0.05, -0.95, -0.31], rightUpperArm: [-0.08, -0.88, 0.47], rightForearm: [-0.06, -0.97, 0.23], leftThigh: [-0.32, -0.73, 0.6], leftShin: [-0.12, -0.86, -0.5], rightThigh: [-0.12, -0.98, 0.12], rightShin: [-0.05, -0.99, -0.06], leftPalm: [0.07, 0.04, -0.99], rightPalm: [-0.07, 0.04, -0.99], bodyRoll: -2, spineBend: 3, headTurn: 0, headTilt: 0, footPoint: 8, bodyPitch: 87, grip: 0.13, hipsY: -0.05 },
  // left-contact: Left foot catches the body underneath; the right leg immediately unloads for the next outward step.
  { t: 0.36, leftUpperArm: [0.14, -0.79, 0.6], leftForearm: [0.1, -0.95, 0.29], rightUpperArm: [-0.1, -0.72, -0.69], rightForearm: [-0.06, -0.91, -0.41], leftThigh: [-0.06, -0.98, 0.18], leftShin: [-0.02, -0.99, -0.08], rightThigh: [-0.4, -0.88, -0.24], rightShin: [-0.14, -0.95, 0.27], leftPalm: [0.08, 0.04, -0.99], rightPalm: [-0.08, 0.04, -0.99], bodyRoll: 0, spineBend: 3, headTurn: -1, headTilt: 0, footPoint: 5, bodyPitch: 88, grip: 0.14, hipsY: -0.07 },
  // right-drive: Right knee drives outward toward -x as the left leg pushes; arms counterbalance without turning the chest sideways.
  { t: 0.5, leftUpperArm: [0.1, -0.78, -0.62], leftForearm: [0.06, -0.94, -0.34], rightUpperArm: [-0.15, -0.7, 0.7], rightForearm: [-0.1, -0.91, 0.4], leftThigh: [0.08, -0.97, -0.22], leftShin: [0.04, -0.99, 0.1], rightThigh: [-0.55, -0.78, 0.28], rightShin: [-0.2, -0.88, -0.43], leftPalm: [0.08, 0.04, -0.99], rightPalm: [-0.08, 0.04, -0.99], bodyRoll: 1, spineBend: 3, headTurn: 0, headTilt: 0, footPoint: 9, bodyPitch: 87, grip: 0.14, hipsY: -0.03 },
  // right-reach: Right foot reaches laterally for the next plant while the body remains compact and ready to redirect.
  { t: 0.62, leftUpperArm: [0.13, -0.72, -0.68], leftForearm: [0.08, -0.92, -0.39], rightUpperArm: [-0.18, -0.76, 0.62], rightForearm: [-0.12, -0.93, 0.34], leftThigh: [0.12, -0.96, -0.24], leftShin: [0.06, -0.99, 0.08], rightThigh: [-0.66, -0.74, 0.1], rightShin: [-0.27, -0.95, -0.12], leftPalm: [0.08, 0.04, -0.99], rightPalm: [-0.08, 0.04, -0.99], bodyRoll: -4, spineBend: 3, headTurn: 2, headTilt: 0, footPoint: 6, bodyPitch: 86, grip: 0.14, hipsY: -0.04 },
  // right-contact-two: A second right-side plant continues the lateral cadence while the head remains mostly forward.
  { t: 0.74, leftUpperArm: [0.14, -0.7, -0.7], leftForearm: [0.08, -0.91, -0.4], rightUpperArm: [-0.18, -0.78, 0.6], rightForearm: [-0.12, -0.94, 0.32], leftThigh: [0.18, -0.91, -0.37], leftShin: [0.1, -0.75, 0.65], rightThigh: [-0.62, -0.77, 0.1], rightShin: [-0.24, -0.96, -0.12], leftPalm: [0.08, 0.04, -0.99], rightPalm: [-0.08, 0.04, -0.99], bodyRoll: -5, spineBend: 3, headTurn: 3, headTilt: 0, footPoint: 5, bodyPitch: 86, grip: 0.14, hipsY: -0.06 },
  // right-load-two: The body compresses over the right support again, preserving a smooth athletic side-step rhythm.
  { t: 0.86, leftUpperArm: [0.12, -0.75, -0.65], leftForearm: [0.07, -0.93, -0.36], rightUpperArm: [-0.14, -0.82, 0.55], rightForearm: [-0.1, -0.95, 0.29], leftThigh: [-0.08, -0.72, 0.69], leftShin: [0.04, -0.65, -0.76], rightThigh: [-0.42, -0.9, 0.08], rightShin: [-0.15, -0.98, -0.1], leftPalm: [0.08, 0.04, -0.99], rightPalm: [-0.08, 0.04, -0.99], bodyRoll: -4, spineBend: 4, headTurn: 2, headTilt: 0, footPoint: 4, bodyPitch: 85, grip: 0.14, hipsY: -0.1 },
  // cycle-return: The limbs return toward the opening right-support configuration to close the loop cleanly.
  { t: 0.94, leftUpperArm: [0.14, -0.71, -0.69], leftForearm: [0.08, -0.91, -0.39], rightUpperArm: [-0.17, -0.79, 0.59], rightForearm: [-0.11, -0.94, 0.31], leftThigh: [0.15, -0.92, -0.36], leftShin: [0.08, -0.76, 0.64], rightThigh: [-0.59, -0.79, 0.1], rightShin: [-0.22, -0.97, -0.11], leftPalm: [0.08, 0.04, -0.99], rightPalm: [-0.08, 0.04, -0.99], bodyRoll: -5, spineBend: 3, headTurn: 3, headTilt: 0, footPoint: 5, bodyPitch: 86, grip: 0.14, hipsY: -0.06 },
  // right-contact-loop: Exact opening pose repeated for a seamless strafe-right loop.
  { t: 1, leftUpperArm: [0.14, -0.7, -0.7], leftForearm: [0.08, -0.91, -0.4], rightUpperArm: [-0.18, -0.78, 0.6], rightForearm: [-0.12, -0.94, 0.32], leftThigh: [0.18, -0.91, -0.37], leftShin: [0.1, -0.75, 0.65], rightThigh: [-0.62, -0.77, 0.1], rightShin: [-0.24, -0.96, -0.12], leftPalm: [0.08, 0.04, -0.99], rightPalm: [-0.08, 0.04, -0.99], bodyRoll: -5, spineBend: 3, headTurn: 3, headTilt: 0, footPoint: 5, bodyPitch: 86, grip: 0.14, hipsY: -0.06 },
];

const DURATION = 0.9;

export default defineAnimation({
  slug: 'strafe-right',
  name: 'Strafe Right',
  clip: 'StrafeRight',
  subcategory: 'animations',
  kind: 'loop',
  duration: DURATION,
  keys: POSES.map((pose) => referenceKey(pose, DURATION, 90)),
});
