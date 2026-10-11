import { defineAnimation, referenceKey, type ReferencePose } from '../_animation.js';

/**
 * Sneak, built from the owner's move file docs/reference/character-anime/moves/sneak/move.json by
 * tooling/moves/build-moves.ts (limbs by the joint-law builders). Edit the move file and rebuild, not this file.
 */
const POSES: ReferencePose[] = [
  // left-contact: Left foot touches down softly ahead; torso stays low and quiet while the raised left hand balances the stealthy step.
  { t: 0, leftUpperArm: [0.08, -0.58, 0.81], leftForearm: [0.1, -0.3, 0.95], rightUpperArm: [-0.08, -0.78, -0.62], rightForearm: [-0.06, -0.94, -0.34], leftThigh: [0.08, -0.72, 0.69], leftShin: [0.04, -0.99, -0.12], rightThigh: [-0.08, -0.78, -0.62], rightShin: [-0.04, -0.68, 0.73], leftPalm: [0.1, 0.05, -0.99], rightPalm: [-0.1, 0.05, -0.99], bodyRoll: -2, spineBend: 12, headTurn: 2, headTilt: -3, footPoint: 2, bodyPitch: 70, grip: 0.08, hipsY: -0.28 },
  // left-load: Weight rolls quietly onto the left leg; knees remain flexed to prevent vertical bounce.
  { t: 0.12, leftUpperArm: [0.07, -0.62, 0.78], leftForearm: [0.09, -0.34, 0.94], rightUpperArm: [-0.07, -0.82, -0.56], rightForearm: [-0.05, -0.96, -0.27], leftThigh: [0.07, -0.84, 0.54], leftShin: [0.03, -0.95, -0.31], rightThigh: [-0.07, -0.82, -0.56], rightShin: [-0.03, -0.57, 0.82], leftPalm: [0.1, 0.05, -0.99], rightPalm: [-0.1, 0.05, -0.99], bodyRoll: -1, spineBend: 13, headTurn: 1, headTilt: -3, footPoint: 1, bodyPitch: 69, grip: 0.08, hipsY: -0.31 },
  // left-midstance: Pelvis passes over the planted left foot as the right leg begins a controlled low recovery.
  { t: 0.24, leftUpperArm: [0.06, -0.7, 0.71], leftForearm: [0.08, -0.43, 0.9], rightUpperArm: [-0.06, -0.75, 0.66], rightForearm: [-0.05, -0.9, 0.43], leftThigh: [0.05, -0.96, 0.27], leftShin: [0.02, -1, -0.05], rightThigh: [-0.07, -0.6, 0.8], rightShin: [-0.04, -0.78, 0.62], leftPalm: [0.08, 0.05, -0.99], rightPalm: [-0.08, 0.05, -0.99], bodyRoll: 0, spineBend: 12, headTurn: 0, headTilt: -2, footPoint: 3, bodyPitch: 70, grip: 0.07, hipsY: -0.29 },
  // right-reach: Right leg reaches forward with the foot kept close to the floor; right hand rises naturally as the left arm counters.
  { t: 0.36, leftUpperArm: [0.06, -0.78, -0.62], leftForearm: [0.05, -0.93, -0.36], rightUpperArm: [-0.08, -0.57, 0.82], rightForearm: [-0.1, -0.29, 0.95], leftThigh: [0.07, -0.82, -0.57], leftShin: [0.03, -0.97, 0.24], rightThigh: [-0.08, -0.55, 0.83], rightShin: [-0.04, -0.8, -0.6], leftPalm: [0.08, 0.04, -0.99], rightPalm: [-0.1, 0.05, -0.99], bodyRoll: 2, spineBend: 12, headTurn: -2, headTilt: -3, footPoint: 6, bodyPitch: 70, grip: 0.08, hipsY: -0.27 },
  // right-contact: Right foot makes a soft controlled contact; left leg trails and the hands remain relaxed rather than clenched.
  { t: 0.5, leftUpperArm: [0.08, -0.78, -0.62], leftForearm: [0.06, -0.94, -0.34], rightUpperArm: [-0.08, -0.58, 0.81], rightForearm: [-0.1, -0.3, 0.95], leftThigh: [0.08, -0.78, -0.62], leftShin: [0.04, -0.68, 0.73], rightThigh: [-0.08, -0.72, 0.69], rightShin: [-0.04, -0.99, -0.12], leftPalm: [0.1, 0.05, -0.99], rightPalm: [-0.1, 0.05, -0.99], bodyRoll: 2, spineBend: 12, headTurn: -2, headTilt: -3, footPoint: 2, bodyPitch: 70, grip: 0.08, hipsY: -0.28 },
  // right-load: Weight settles onto the right leg with minimal vertical movement and controlled knee flexion.
  { t: 0.62, leftUpperArm: [0.07, -0.82, -0.56], leftForearm: [0.05, -0.96, -0.27], rightUpperArm: [-0.07, -0.62, 0.78], rightForearm: [-0.09, -0.34, 0.94], leftThigh: [0.07, -0.82, -0.56], leftShin: [0.03, -0.57, 0.82], rightThigh: [-0.07, -0.84, 0.54], rightShin: [-0.03, -0.95, -0.31], leftPalm: [0.1, 0.05, -0.99], rightPalm: [-0.1, 0.05, -0.99], bodyRoll: 1, spineBend: 13, headTurn: -1, headTilt: -3, footPoint: 1, bodyPitch: 69, grip: 0.08, hipsY: -0.31 },
  // right-midstance: Pelvis passes over the right foot while the left knee begins its low, quiet recovery.
  { t: 0.74, leftUpperArm: [0.06, -0.75, 0.66], leftForearm: [0.05, -0.9, 0.43], rightUpperArm: [-0.06, -0.7, 0.71], rightForearm: [-0.08, -0.43, 0.9], leftThigh: [0.07, -0.6, 0.8], leftShin: [0.04, -0.78, 0.62], rightThigh: [-0.05, -0.96, 0.27], rightShin: [-0.02, -1, -0.05], leftPalm: [0.08, 0.05, -0.99], rightPalm: [-0.08, 0.05, -0.99], bodyRoll: 0, spineBend: 12, headTurn: 0, headTilt: -2, footPoint: 3, bodyPitch: 70, grip: 0.07, hipsY: -0.29 },
  // left-reach: Left foot reaches toward the next quiet contact while the gaze checks slightly toward the direction of travel.
  { t: 0.86, leftUpperArm: [0.08, -0.57, 0.82], leftForearm: [0.1, -0.29, 0.95], rightUpperArm: [-0.06, -0.78, -0.62], rightForearm: [-0.05, -0.93, -0.36], leftThigh: [0.08, -0.55, 0.83], leftShin: [0.04, -0.8, -0.6], rightThigh: [-0.07, -0.82, -0.57], rightShin: [-0.03, -0.97, 0.24], leftPalm: [0.1, 0.05, -0.99], rightPalm: [-0.08, 0.04, -0.99], bodyRoll: -2, spineBend: 12, headTurn: 2, headTilt: -3, footPoint: 6, bodyPitch: 70, grip: 0.08, hipsY: -0.27 },
  // left-precontact: Left foot lowers gently toward the floor as the body prepares to repeat the stealth step.
  { t: 0.94, leftUpperArm: [0.08, -0.59, 0.8], leftForearm: [0.1, -0.31, 0.94], rightUpperArm: [-0.07, -0.79, -0.61], rightForearm: [-0.05, -0.94, -0.33], leftThigh: [0.08, -0.66, 0.75], leftShin: [0.04, -0.93, -0.36], rightThigh: [-0.08, -0.8, -0.59], rightShin: [-0.04, -0.76, 0.65], leftPalm: [0.1, 0.05, -0.99], rightPalm: [-0.09, 0.04, -0.99], bodyRoll: -2, spineBend: 12, headTurn: 2, headTilt: -3, footPoint: 3, bodyPitch: 70, grip: 0.08, hipsY: -0.28 },
  // left-contact-loop: Exact return to the opening left-contact pose for a seamless sneak loop.
  { t: 1, leftUpperArm: [0.08, -0.58, 0.81], leftForearm: [0.1, -0.3, 0.95], rightUpperArm: [-0.08, -0.78, -0.62], rightForearm: [-0.06, -0.94, -0.34], leftThigh: [0.08, -0.72, 0.69], leftShin: [0.04, -0.99, -0.12], rightThigh: [-0.08, -0.78, -0.62], rightShin: [-0.04, -0.68, 0.73], leftPalm: [0.1, 0.05, -0.99], rightPalm: [-0.1, 0.05, -0.99], bodyRoll: -2, spineBend: 12, headTurn: 2, headTilt: -3, footPoint: 2, bodyPitch: 70, grip: 0.08, hipsY: -0.28 },
];

const DURATION = 1.55;

export default defineAnimation({
  slug: 'sneak',
  name: 'Sneak',
  clip: 'Sneak',
  subcategory: 'animations',
  kind: 'loop',
  duration: DURATION,
  keys: POSES.map((pose) => referenceKey(pose, DURATION, 90)),
});
