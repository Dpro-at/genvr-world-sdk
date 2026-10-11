import { defineAnimation, referenceKey, type ReferencePose } from '../_animation.js';

/**
 * Jump Forward, built from the owner's move file docs/reference/character-anime/moves/jump-forward/move.json by
 * tooling/moves/build-moves.ts (limbs by the joint-law builders). Edit the move file and rebuild, not this file.
 */
const POSES: ReferencePose[] = [
  // ready: Balanced athletic stance before the forward jump; gaze stays on the landing area.
  { t: 0, leftUpperArm: [0.04, -0.98, 0.18], leftForearm: [0.02, -1, 0.05], rightUpperArm: [-0.04, -0.98, 0.18], rightForearm: [-0.02, -1, 0.05], leftThigh: [0.05, -0.98, 0.18], leftShin: [0.02, -0.99, -0.08], rightThigh: [-0.05, -0.98, 0.18], rightShin: [-0.02, -0.99, -0.08], leftPalm: [0.05, 0.03, -1], rightPalm: [-0.05, 0.03, -1], bodyRoll: 0, spineBend: 3, headTurn: 0, headTilt: 0, footPoint: 0, bodyPitch: 87, grip: 0.06, hipsY: -0.03 },
  // countermovement: Hips and knees load together while both arms swing behind the body for a natural countermovement.
  { t: 0.12, leftUpperArm: [0.05, -0.72, -0.69], leftForearm: [0.03, -0.92, -0.39], rightUpperArm: [-0.05, -0.72, -0.69], rightForearm: [-0.03, -0.92, -0.39], leftThigh: [0.08, -0.64, 0.76], leftShin: [0.03, -0.76, -0.65], rightThigh: [-0.08, -0.64, 0.76], rightShin: [-0.03, -0.76, -0.65], leftPalm: [0.05, 0.04, -1], rightPalm: [-0.05, 0.04, -1], bodyRoll: 0, spineBend: 13, headTurn: 0, headTilt: 1, footPoint: 0, bodyPitch: 73, grip: 0.07, hipsY: -0.22 },
  // drive: Both legs extend as the arms whip forward; hips lead the body into forward and upward acceleration.
  { t: 0.24, leftUpperArm: [0.04, -0.18, 0.98], leftForearm: [0.02, -0.56, 0.83], rightUpperArm: [-0.04, -0.18, 0.98], rightForearm: [-0.02, -0.56, 0.83], leftThigh: [0.06, -0.82, 0.57], leftShin: [0.02, -0.96, 0.27], rightThigh: [-0.06, -0.82, 0.57], rightShin: [-0.02, -0.96, 0.27], leftPalm: [0.04, 0.02, -1], rightPalm: [-0.04, 0.02, -1], bodyRoll: 0, spineBend: -2, headTurn: 0, headTilt: -3, footPoint: 18, bodyPitch: 68, grip: 0.08, hipsY: -0.04 },
  // takeoff: Feet leave the ground together after full extension; arms stay forward to control pitch.
  { t: 0.34, leftUpperArm: [0.03, 0.16, 0.98], leftForearm: [0.02, -0.28, 0.96], rightUpperArm: [-0.03, 0.16, 0.98], rightForearm: [-0.02, -0.28, 0.96], leftThigh: [0.05, -0.92, -0.39], leftShin: [0.02, -0.99, 0.12], rightThigh: [-0.05, -0.92, -0.39], rightShin: [-0.02, -0.99, 0.12], leftPalm: [0.03, 0, -1], rightPalm: [-0.03, 0, -1], bodyRoll: 0, spineBend: -4, headTurn: 0, headTilt: -3, footPoint: 28, bodyPitch: 58, grip: 0.07, hipsY: 0.08 },
  // early-flight: Knees come forward modestly during flight while the torso remains controlled and the eyes stay on the landing.
  { t: 0.47, leftUpperArm: [0.04, 0.24, 0.97], leftForearm: [0.02, -0.16, 0.99], rightUpperArm: [-0.04, 0.24, 0.97], rightForearm: [-0.02, -0.16, 0.99], leftThigh: [0.05, -0.44, 0.9], leftShin: [0.02, -0.76, -0.65], rightThigh: [-0.05, -0.44, 0.9], rightShin: [-0.02, -0.76, -0.65], leftPalm: [0.03, 0, -1], rightPalm: [-0.03, 0, -1], bodyRoll: 0, spineBend: 0, headTurn: 0, headTilt: -1, footPoint: 22, bodyPitch: 48, grip: 0.06, hipsY: 0.2 },
  // apex: At the apex both feet begin moving ahead of the hips and the arms start lowering for landing balance.
  { t: 0.6, leftUpperArm: [0.04, 0.08, 1], leftForearm: [0.02, -0.3, 0.95], rightUpperArm: [-0.04, 0.08, 1], rightForearm: [-0.02, -0.3, 0.95], leftThigh: [0.06, -0.26, 0.96], leftShin: [0.02, -0.64, -0.77], rightThigh: [-0.06, -0.26, 0.96], rightShin: [-0.02, -0.64, -0.77], leftPalm: [0.03, 0.02, -1], rightPalm: [-0.03, 0.02, -1], bodyRoll: 0, spineBend: 5, headTurn: 0, headTilt: 0, footPoint: 15, bodyPitch: 47, grip: 0.06, hipsY: 0.24 },
  // landing-prep: Feet extend forward together and the arms lower as the character prepares for a soft two-foot landing.
  { t: 0.72, leftUpperArm: [0.04, -0.3, 0.95], leftForearm: [0.02, -0.66, 0.75], rightUpperArm: [-0.04, -0.3, 0.95], rightForearm: [-0.02, -0.66, 0.75], leftThigh: [0.07, -0.18, 0.98], leftShin: [0.03, -0.78, -0.62], rightThigh: [-0.07, -0.18, 0.98], rightShin: [-0.03, -0.78, -0.62], leftPalm: [0.04, 0.03, -1], rightPalm: [-0.04, 0.03, -1], bodyRoll: 0, spineBend: 10, headTurn: 0, headTilt: 1, footPoint: 5, bodyPitch: 54, grip: 0.06, hipsY: 0.14 },
  // contact: Both feet contact together; knees flex immediately and the torso comes forward over the base of support.
  { t: 0.83, leftUpperArm: [0.05, -0.64, -0.77], leftForearm: [0.03, -0.9, -0.43], rightUpperArm: [-0.05, -0.64, -0.77], rightForearm: [-0.03, -0.9, -0.43], leftThigh: [0.08, -0.46, 0.88], leftShin: [0.03, -0.72, -0.69], rightThigh: [-0.08, -0.46, 0.88], rightShin: [-0.03, -0.72, -0.69], leftPalm: [0.05, 0.04, -1], rightPalm: [-0.05, 0.04, -1], bodyRoll: 0, spineBend: 15, headTurn: 0, headTilt: 2, footPoint: 0, bodyPitch: 64, grip: 0.06, hipsY: -0.1 },
  // absorb: Hips sink and knees absorb impact; arms continue backward to prevent the body from tipping behind.
  { t: 0.92, leftUpperArm: [0.05, -0.84, -0.54], leftForearm: [0.02, -0.97, -0.24], rightUpperArm: [-0.05, -0.84, -0.54], rightForearm: [-0.02, -0.97, -0.24], leftThigh: [0.1, -0.56, 0.82], leftShin: [0.04, -0.64, -0.77], rightThigh: [-0.1, -0.56, 0.82], rightShin: [-0.04, -0.64, -0.77], leftPalm: [0.05, 0.05, -1], rightPalm: [-0.05, 0.05, -1], bodyRoll: 0, spineBend: 17, headTurn: 0, headTilt: 2, footPoint: 0, bodyPitch: 69, grip: 0.06, hipsY: -0.24 },
  // recover: Character rises into a stable athletic stance, ready to blend into idle, walk or run.
  { t: 1, leftUpperArm: [0.04, -0.96, 0.27], leftForearm: [0.02, -0.99, 0.1], rightUpperArm: [-0.04, -0.96, 0.27], rightForearm: [-0.02, -0.99, 0.1], leftThigh: [0.06, -0.88, 0.47], leftShin: [0.03, -0.91, -0.41], rightThigh: [-0.06, -0.88, 0.47], rightShin: [-0.03, -0.91, -0.41], leftPalm: [0.04, 0.04, -1], rightPalm: [-0.04, 0.04, -1], bodyRoll: 0, spineBend: 8, headTurn: 0, headTilt: 0, footPoint: 0, bodyPitch: 79, grip: 0.05, hipsY: -0.12 },
];

const DURATION = 0.95;

export default defineAnimation({
  slug: 'jump-forward',
  name: 'Jump Forward',
  clip: 'JumpForward',
  subcategory: 'animations',
  kind: 'once',
  duration: DURATION,
  keys: POSES.map((pose) => referenceKey(pose, DURATION, 90)),
});
