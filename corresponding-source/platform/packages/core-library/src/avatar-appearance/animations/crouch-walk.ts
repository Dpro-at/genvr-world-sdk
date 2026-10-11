import { defineAnimation, referenceKey, type ReferencePose } from '../_animation.js';

/**
 * Crouch Walk, built from the owner's move file docs/reference/character-anime/moves/crouch-walk/move.json by
 * tooling/moves/build-moves.ts (limbs by the joint-law builders). Edit the move file and rebuild, not this file.
 */
const POSES: ReferencePose[] = [
  // left-contact: Left foot contacts ahead while the right leg trails; right arm leads and left arm counters behind.
  { t: 0, leftUpperArm: [0.04, -0.72, -0.69], leftForearm: [0.02, -0.93, -0.36], rightUpperArm: [-0.04, -0.66, 0.75], rightForearm: [-0.02, -0.82, 0.57], leftThigh: [0.1, -0.7, 0.71], leftShin: [0.05, -0.98, -0.18], rightThigh: [-0.1, -0.7, -0.71], rightShin: [-0.05, -0.74, 0.67], leftPalm: [0.08, 0.02, -0.99], rightPalm: [-0.08, 0.02, -0.99], bodyRoll: -2, spineBend: 10, headTurn: 0, headTilt: -2, footPoint: 3, bodyPitch: 72, grip: 0.12, hipsY: -0.43 },
  // left-load: Weight settles onto the bent left leg; hips stay low while the rear foot begins to unload.
  { t: 0.11, leftUpperArm: [0.04, -0.76, -0.65], leftForearm: [0.02, -0.95, -0.3], rightUpperArm: [-0.04, -0.7, 0.71], rightForearm: [-0.02, -0.85, 0.53], leftThigh: [0.09, -0.82, 0.56], leftShin: [0.04, -0.93, -0.36], rightThigh: [-0.09, -0.78, -0.62], rightShin: [-0.04, -0.62, 0.78], leftPalm: [0.08, 0.02, -0.99], rightPalm: [-0.08, 0.02, -0.99], bodyRoll: -1, spineBend: 11, headTurn: 0, headTilt: -2, footPoint: 2, bodyPitch: 71, grip: 0.12, hipsY: -0.47 },
  // left-midstance: Body passes over the left foot as the right knee begins its low forward recovery.
  { t: 0.22, leftUpperArm: [0.03, -0.82, -0.57], leftForearm: [0.02, -0.97, -0.24], rightUpperArm: [-0.03, -0.77, 0.64], rightForearm: [-0.02, -0.89, 0.46], leftThigh: [0.07, -0.94, 0.34], leftShin: [0.03, -0.99, -0.1], rightThigh: [-0.08, -0.6, 0.8], rightShin: [-0.04, -0.78, 0.62], leftPalm: [0.07, 0.03, -0.99], rightPalm: [-0.07, 0.03, -0.99], bodyRoll: 0, spineBend: 10, headTurn: 1, headTilt: -1, footPoint: 5, bodyPitch: 72, grip: 0.11, hipsY: -0.45 },
  // right-swing: Right knee advances without lifting high; arms reverse naturally while the left leg pushes the body forward.
  { t: 0.33, leftUpperArm: [0.04, -0.68, 0.73], leftForearm: [0.02, -0.84, 0.54], rightUpperArm: [-0.04, -0.75, -0.66], rightForearm: [-0.02, -0.94, -0.34], leftThigh: [0.08, -0.78, -0.62], leftShin: [0.03, -0.98, 0.18], rightThigh: [-0.1, -0.55, 0.83], rightShin: [-0.05, -0.72, -0.69], leftPalm: [0.08, 0.02, -0.99], rightPalm: [-0.08, 0.02, -0.99], bodyRoll: 2, spineBend: 10, headTurn: 0, headTilt: -2, footPoint: 8, bodyPitch: 72, grip: 0.12, hipsY: -0.43 },
  // right-contact: Right foot contacts ahead; left leg trails and the left arm leads as a counter-swing.
  { t: 0.44, leftUpperArm: [0.04, -0.66, 0.75], leftForearm: [0.02, -0.82, 0.57], rightUpperArm: [-0.04, -0.72, -0.69], rightForearm: [-0.02, -0.93, -0.36], leftThigh: [0.1, -0.7, -0.71], leftShin: [0.05, -0.74, 0.67], rightThigh: [-0.1, -0.7, 0.71], rightShin: [-0.05, -0.98, -0.18], leftPalm: [0.08, 0.02, -0.99], rightPalm: [-0.08, 0.02, -0.99], bodyRoll: 2, spineBend: 10, headTurn: 0, headTilt: -2, footPoint: 3, bodyPitch: 72, grip: 0.12, hipsY: -0.43 },
  // right-load: Weight settles onto the right leg; the low crouched silhouette stays stable and compact.
  { t: 0.56, leftUpperArm: [0.04, -0.7, 0.71], leftForearm: [0.02, -0.85, 0.53], rightUpperArm: [-0.04, -0.76, -0.65], rightForearm: [-0.02, -0.95, -0.3], leftThigh: [0.09, -0.78, -0.62], leftShin: [0.04, -0.62, 0.78], rightThigh: [-0.09, -0.82, 0.56], rightShin: [-0.04, -0.93, -0.36], leftPalm: [0.08, 0.02, -0.99], rightPalm: [-0.08, 0.02, -0.99], bodyRoll: 1, spineBend: 11, headTurn: 0, headTilt: -2, footPoint: 2, bodyPitch: 71, grip: 0.12, hipsY: -0.47 },
  // right-midstance: Body passes over the right foot while the left knee starts its low forward recovery.
  { t: 0.67, leftUpperArm: [0.03, -0.77, 0.64], leftForearm: [0.02, -0.89, 0.46], rightUpperArm: [-0.03, -0.82, -0.57], rightForearm: [-0.02, -0.97, -0.24], leftThigh: [0.08, -0.6, 0.8], leftShin: [0.04, -0.78, 0.62], rightThigh: [-0.07, -0.94, 0.34], rightShin: [-0.03, -0.99, -0.1], leftPalm: [0.07, 0.03, -0.99], rightPalm: [-0.07, 0.03, -0.99], bodyRoll: 0, spineBend: 10, headTurn: -1, headTilt: -1, footPoint: 5, bodyPitch: 72, grip: 0.11, hipsY: -0.45 },
  // left-swing: Left knee swings forward close to the ground while the right leg provides the final push.
  { t: 0.78, leftUpperArm: [0.04, -0.75, -0.66], leftForearm: [0.02, -0.94, -0.34], rightUpperArm: [-0.04, -0.68, 0.73], rightForearm: [-0.02, -0.84, 0.54], leftThigh: [0.1, -0.55, 0.83], leftShin: [0.05, -0.72, -0.69], rightThigh: [-0.08, -0.78, -0.62], rightShin: [-0.03, -0.98, 0.18], leftPalm: [0.08, 0.02, -0.99], rightPalm: [-0.08, 0.02, -0.99], bodyRoll: -2, spineBend: 10, headTurn: 0, headTilt: -2, footPoint: 8, bodyPitch: 72, grip: 0.12, hipsY: -0.43 },
  // left-reach: Left foot reaches toward the next contact while the torso remains quiet and forward-focused.
  { t: 0.89, leftUpperArm: [0.04, -0.72, -0.69], leftForearm: [0.02, -0.93, -0.36], rightUpperArm: [-0.04, -0.66, 0.75], rightForearm: [-0.02, -0.82, 0.57], leftThigh: [0.1, -0.64, 0.76], leftShin: [0.05, -0.9, -0.43], rightThigh: [-0.1, -0.75, -0.65], rightShin: [-0.05, -0.88, 0.47], leftPalm: [0.08, 0.02, -0.99], rightPalm: [-0.08, 0.02, -0.99], bodyRoll: -2, spineBend: 10, headTurn: 0, headTilt: -2, footPoint: 4, bodyPitch: 72, grip: 0.12, hipsY: -0.44 },
  // left-contact-loop: Exact return to the opening left-contact pose for seamless looping.
  { t: 1, leftUpperArm: [0.04, -0.72, -0.69], leftForearm: [0.02, -0.93, -0.36], rightUpperArm: [-0.04, -0.66, 0.75], rightForearm: [-0.02, -0.82, 0.57], leftThigh: [0.1, -0.7, 0.71], leftShin: [0.05, -0.98, -0.18], rightThigh: [-0.1, -0.7, -0.71], rightShin: [-0.05, -0.74, 0.67], leftPalm: [0.08, 0.02, -0.99], rightPalm: [-0.08, 0.02, -0.99], bodyRoll: -2, spineBend: 10, headTurn: 0, headTilt: -2, footPoint: 3, bodyPitch: 72, grip: 0.12, hipsY: -0.43 },
];

const DURATION = 1.15;

export default defineAnimation({
  slug: 'crouch-walk',
  name: 'Crouch Walk',
  clip: 'CrouchWalk',
  subcategory: 'animations',
  kind: 'loop',
  duration: DURATION,
  keys: POSES.map((pose) => referenceKey(pose, DURATION, 90)),
});
