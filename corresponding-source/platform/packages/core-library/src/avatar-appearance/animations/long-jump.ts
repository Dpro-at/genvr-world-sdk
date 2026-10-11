import { defineAnimation, referenceKey, type ReferencePose } from '../_animation.js';

/**
 * Long Jump, built from the owner's move file docs/reference/character-anime/moves/long-jump/move.json by
 * tooling/moves/build-moves.ts (limbs by the joint-law builders). Edit the move file and rebuild, not this file.
 */
const POSES: ReferencePose[] = [
  // approach: Fast final approach step; gaze stays ahead while opposite arm and knee prepare the takeoff.
  { t: 0, leftUpperArm: [0.03, -0.82, -0.57], leftForearm: [0.02, -0.97, -0.24], rightUpperArm: [-0.03, -0.42, 0.91], rightForearm: [-0.02, -0.72, 0.69], leftThigh: [0.05, -0.4, 0.92], leftShin: [0.02, -0.72, -0.69], rightThigh: [-0.04, -0.92, -0.39], rightShin: [-0.02, -0.99, 0.1], leftPalm: [0.05, 0.03, -1], rightPalm: [-0.05, 0.03, -1], bodyRoll: -2, spineBend: 5, headTurn: 0, headTilt: -2, footPoint: 14, bodyPitch: 70, grip: 0.14, hipsY: 0.02 },
  // penultimate: Penultimate step lowers the hips slightly so horizontal speed can be converted into a controlled upward takeoff.
  { t: 0.1, leftUpperArm: [0.04, -0.58, 0.81], leftForearm: [0.02, -0.84, 0.54], rightUpperArm: [-0.04, -0.78, -0.63], rightForearm: [-0.02, -0.96, -0.27], leftThigh: [0.05, -0.84, -0.54], leftShin: [0.02, -0.97, 0.24], rightThigh: [-0.05, -0.52, 0.85], rightShin: [-0.02, -0.8, -0.6], leftPalm: [0.05, 0.03, -1], rightPalm: [-0.05, 0.03, -1], bodyRoll: 1, spineBend: 4, headTurn: 0, headTilt: -2, footPoint: 10, bodyPitch: 74, grip: 0.14, hipsY: -0.04 },
  // takeoff-load: Takeoff leg loads under the hips; free knee and opposite arm drive forward and upward.
  { t: 0.2, leftUpperArm: [0.04, -0.7, -0.71], leftForearm: [0.02, -0.92, -0.39], rightUpperArm: [-0.04, -0.3, 0.95], rightForearm: [-0.02, -0.62, 0.78], leftThigh: [0.04, -0.93, -0.36], leftShin: [0.02, -0.98, 0.18], rightThigh: [-0.05, -0.38, 0.92], rightShin: [-0.02, -0.7, -0.71], leftPalm: [0.05, 0.03, -1], rightPalm: [-0.05, 0.03, -1], bodyRoll: 0, spineBend: 3, headTurn: 0, headTilt: -3, footPoint: 8, bodyPitch: 78, grip: 0.15, hipsY: -0.08 },
  // takeoff: Takeoff leg extends powerfully as both arms drive forward; the body leaves the ground with forward momentum.
  { t: 0.3, leftUpperArm: [0.03, -0.3, 0.95], leftForearm: [0.02, -0.64, 0.77], rightUpperArm: [-0.03, -0.18, 0.98], rightForearm: [-0.02, -0.55, 0.83], leftThigh: [0.04, -0.86, -0.5], leftShin: [0.02, -0.98, 0.18], rightThigh: [-0.05, -0.28, 0.96], rightShin: [-0.02, -0.66, -0.75], leftPalm: [0.04, 0.02, -1], rightPalm: [-0.04, 0.02, -1], bodyRoll: 0, spineBend: -2, headTurn: 0, headTilt: -4, footPoint: 20, bodyPitch: 67, grip: 0.14, hipsY: 0.04 },
  // early-flight: Arms reach forward as both knees begin coming up; torso stays long instead of folding too early.
  { t: 0.42, leftUpperArm: [0.04, 0.18, 0.98], leftForearm: [0.02, -0.28, 0.96], rightUpperArm: [-0.04, 0.2, 0.98], rightForearm: [-0.02, -0.26, 0.96], leftThigh: [0.05, -0.35, 0.94], leftShin: [0.02, -0.68, -0.73], rightThigh: [-0.05, -0.3, 0.95], rightShin: [-0.02, -0.66, -0.75], leftPalm: [0.03, 0, -1], rightPalm: [-0.03, 0, -1], bodyRoll: 0, spineBend: -4, headTurn: 0, headTilt: -3, footPoint: 24, bodyPitch: 54, grip: 0.12, hipsY: 0.18 },
  // flight: At peak flight both thighs advance together; arms remain forward to control rotation and prepare the landing.
  { t: 0.55, leftUpperArm: [0.04, 0.32, 0.95], leftForearm: [0.02, -0.1, 0.99], rightUpperArm: [-0.04, 0.32, 0.95], rightForearm: [-0.02, -0.1, 0.99], leftThigh: [0.05, -0.16, 0.99], leftShin: [0.02, -0.5, -0.86], rightThigh: [-0.05, -0.16, 0.99], rightShin: [-0.02, -0.5, -0.86], leftPalm: [0.02, -0.02, -1], rightPalm: [-0.02, -0.02, -1], bodyRoll: 0, spineBend: 4, headTurn: 0, headTilt: -1, footPoint: 18, bodyPitch: 43, grip: 0.1, hipsY: 0.27 },
  // landing-prep: Both legs extend forward together for landing while the arms begin sweeping down and back to prevent backward rotation.
  { t: 0.68, leftUpperArm: [0.05, -0.05, 0.99], leftForearm: [0.02, -0.4, 0.92], rightUpperArm: [-0.05, -0.05, 0.99], rightForearm: [-0.02, -0.4, 0.92], leftThigh: [0.06, -0.05, 1], leftShin: [0.02, -0.68, -0.73], rightThigh: [-0.06, -0.05, 1], rightShin: [-0.02, -0.68, -0.73], leftPalm: [0.02, 0.02, -1], rightPalm: [-0.02, 0.02, -1], bodyRoll: 0, spineBend: 10, headTurn: 0, headTilt: 1, footPoint: 5, bodyPitch: 48, grip: 0.08, hipsY: 0.2 },
  // heel-contact: Both feet contact ahead of the hips; knees immediately begin flexing and arms sweep backward to absorb momentum.
  { t: 0.8, leftUpperArm: [0.05, -0.72, -0.69], leftForearm: [0.02, -0.93, -0.36], rightUpperArm: [-0.05, -0.72, -0.69], rightForearm: [-0.02, -0.93, -0.36], leftThigh: [0.06, -0.36, 0.93], leftShin: [0.02, -0.88, -0.47], rightThigh: [-0.06, -0.36, 0.93], rightShin: [-0.02, -0.88, -0.47], leftPalm: [0.03, 0.05, -1], rightPalm: [-0.03, 0.05, -1], bodyRoll: 0, spineBend: 15, headTurn: 0, headTilt: 2, footPoint: 0, bodyPitch: 58, grip: 0.08, hipsY: -0.02 },
  // absorb: Deep knee and hip flexion absorbs the landing while the chest comes forward over the feet to keep balance.
  { t: 0.9, leftUpperArm: [0.05, -0.88, -0.47], leftForearm: [0.02, -0.98, -0.18], rightUpperArm: [-0.05, -0.88, -0.47], rightForearm: [-0.02, -0.98, -0.18], leftThigh: [0.1, -0.52, 0.85], leftShin: [0.04, -0.66, -0.75], rightThigh: [-0.1, -0.52, 0.85], rightShin: [-0.04, -0.66, -0.75], leftPalm: [0.04, 0.05, -1], rightPalm: [-0.04, 0.05, -1], bodyRoll: 0, spineBend: 18, headTurn: 0, headTilt: 3, footPoint: 2, bodyPitch: 66, grip: 0.08, hipsY: -0.25 },
  // recover: Character recovers from the landing into a balanced athletic stance with the head and eyes forward.
  { t: 1, leftUpperArm: [0.04, -0.96, 0.27], leftForearm: [0.02, -0.99, 0.1], rightUpperArm: [-0.04, -0.96, 0.27], rightForearm: [-0.02, -0.99, 0.1], leftThigh: [0.06, -0.88, 0.47], leftShin: [0.03, -0.91, -0.41], rightThigh: [-0.06, -0.88, 0.47], rightShin: [-0.03, -0.91, -0.41], leftPalm: [0.04, 0.04, -1], rightPalm: [-0.04, 0.04, -1], bodyRoll: 0, spineBend: 9, headTurn: 0, headTilt: 0, footPoint: 0, bodyPitch: 78, grip: 0.06, hipsY: -0.13 },
];

const DURATION = 1.25;

export default defineAnimation({
  slug: 'long-jump',
  name: 'Long Jump',
  clip: 'LongJump',
  subcategory: 'animations',
  kind: 'once',
  duration: DURATION,
  keys: POSES.map((pose) => referenceKey(pose, DURATION, 90)),
});
