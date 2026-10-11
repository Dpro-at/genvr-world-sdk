import { defineAnimation, referenceKey, type ReferencePose } from '../_animation.js';

/**
 * Sprint Start, built from the owner's move file docs/reference/character-anime/moves/sprint-start/move.json by
 * tooling/moves/build-moves.ts (limbs by the joint-law builders). Edit the move file and rebuild, not this file.
 */
const POSES: ReferencePose[] = [
  // idle: Neutral start; eyes forward and weight balanced before acceleration.
  { t: 0, leftUpperArm: [0, -0.96, 0.28], leftForearm: [0, -0.96, 0.28], rightUpperArm: [0, -0.96, 0.28], rightForearm: [0, -0.96, 0.28], leftThigh: [0, -1, 0], leftShin: [0, -1, 0], rightThigh: [0, -1, 0], rightShin: [0, -1, 0], leftPalm: [0, 0, 1], rightPalm: [0, 0, 1], bodyRoll: 0, spineBend: 0, headTurn: 0, headTilt: 0, footPoint: 5, bodyPitch: 90, grip: 0.08, hipsY: 0 },
  // anticipation: Hips drop and chest leans forward; arms split and the rear leg loads for the first push.
  { t: 0.1, leftUpperArm: [0, -0.62, 0.78], leftForearm: [0, -0.78, 0.62], rightUpperArm: [0, -0.72, -0.69], rightForearm: [0, -0.92, -0.39], leftThigh: [0, -0.91, 0.42], leftShin: [0, -0.99, 0.12], rightThigh: [0, -0.82, -0.57], rightShin: [0, -0.75, 0.66], leftPalm: [0, 0, 1], rightPalm: [0, 0, 1], bodyRoll: 0, spineBend: 8, headTurn: 0, headTilt: 0, footPoint: 5, bodyPitch: 78, grip: 0.08, hipsY: -0.12 },
  // load: Forward lean increases; front knee drives while the opposite leg compresses to generate force.
  { t: 0.22, leftUpperArm: [0, -0.48, 0.88], leftForearm: [0, -0.72, 0.69], rightUpperArm: [0, -0.82, -0.57], rightForearm: [0, -0.97, -0.25], leftThigh: [0, -0.78, 0.63], leftShin: [0, -0.98, 0.18], rightThigh: [0, -0.72, -0.69], rightShin: [0, -0.82, 0.57], leftPalm: [0, 0, 1], rightPalm: [0, 0, 1], bodyRoll: 0, spineBend: 8, headTurn: 0, headTilt: -3, footPoint: 5, bodyPitch: 68, grip: 0.08, hipsY: -0.18 },
  // first-drive: First powerful drive: right arm comes forward, left arm drives back, and the body projects ahead.
  { t: 0.36, leftUpperArm: [0, -0.78, -0.63], leftForearm: [0, -0.95, -0.3], rightUpperArm: [0, -0.4, 0.92], rightForearm: [0, -0.72, 0.69], leftThigh: [0, -0.58, 0.82], leftShin: [0, -0.97, 0.24], rightThigh: [0, -0.78, -0.63], rightShin: [0, -0.97, -0.24], leftPalm: [0, 0, 1], rightPalm: [0, 0, 1], bodyRoll: -3, spineBend: 5, headTurn: 0, headTilt: -3, footPoint: 18, bodyPitch: 58, grip: 0.25, hipsY: -0.1 },
  // first-flight: First flight phase; lead knee rises while the trailing leg extends and the arms counter-swing.
  { t: 0.5, leftUpperArm: [0, -0.85, -0.53], leftForearm: [0, -0.98, -0.2], rightUpperArm: [0, -0.38, 0.93], rightForearm: [0, -0.73, 0.68], leftThigh: [0, -0.4, 0.92], leftShin: [0, -0.65, -0.76], rightThigh: [0, -0.92, -0.39], rightShin: [0, -0.98, 0.18], leftPalm: [0, 0, 1], rightPalm: [0, 0, 1], bodyRoll: -3, spineBend: 5, headTurn: 0, headTilt: -3, footPoint: 18, bodyPitch: 55, grip: 0.25, hipsY: 0.04 },
  // second-step: Second step reverses the limbs; cadence increases while the torso remains aggressively forward.
  { t: 0.65, leftUpperArm: [0, -0.38, 0.93], leftForearm: [0, -0.72, 0.69], rightUpperArm: [0, -0.88, -0.48], rightForearm: [0, -0.98, -0.18], leftThigh: [0, -0.9, -0.44], leftShin: [0, -0.98, 0.18], rightThigh: [0, -0.38, 0.93], rightShin: [0, -0.7, -0.71], leftPalm: [0, 0, 1], rightPalm: [0, 0, 1], bodyRoll: 3, spineBend: 5, headTurn: 0, headTilt: -3, footPoint: 18, bodyPitch: 58, grip: 0.25, hipsY: 0.01 },
  // accelerate: Stride opens and the torso begins rising toward normal sprint posture without losing forward momentum.
  { t: 0.82, leftUpperArm: [0, -0.86, -0.51], leftForearm: [0, -0.98, -0.18], rightUpperArm: [0, -0.36, 0.93], rightForearm: [0, -0.7, 0.71], leftThigh: [0, -0.32, 0.95], leftShin: [0, -0.62, -0.78], rightThigh: [0, -0.94, -0.34], rightShin: [0, -0.99, 0.12], leftPalm: [0, 0, 1], rightPalm: [0, 0, 1], bodyRoll: -3, spineBend: 5, headTurn: 0, headTilt: -3, footPoint: 18, bodyPitch: 62, grip: 0.25, hipsY: 0.05 },
  // full-speed: Reaches the handoff pose for the sprint/run loop; head steady, arms compact and stride fully active.
  { t: 1, leftUpperArm: [0, -0.34, 0.94], leftForearm: [0, -0.69, 0.72], rightUpperArm: [0, -0.9, -0.44], rightForearm: [0, -0.98, -0.17], leftThigh: [0, -0.92, -0.38], leftShin: [0, -0.99, 0.12], rightThigh: [0, -0.3, 0.95], rightShin: [0, -0.62, -0.78], leftPalm: [0, 0, 1], rightPalm: [0, 0, 1], bodyRoll: 3, spineBend: 5, headTurn: 0, headTilt: -3, footPoint: 18, bodyPitch: 68, grip: 0.25, hipsY: 0.03 },
];

const DURATION = 0.85;

export default defineAnimation({
  slug: 'sprint-start',
  name: 'Sprint Start',
  clip: 'SprintStart',
  subcategory: 'animations',
  kind: 'once',
  duration: DURATION,
  keys: POSES.map((pose) => referenceKey(pose, DURATION, 90)),
});
