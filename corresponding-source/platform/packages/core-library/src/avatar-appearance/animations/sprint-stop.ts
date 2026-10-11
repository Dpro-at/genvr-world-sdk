import { defineAnimation, referenceKey, type ReferencePose } from '../_animation.js';

/**
 * Sprint Stop, built from the owner's move file docs/reference/character-anime/moves/sprint-stop/move.json by
 * tooling/moves/build-moves.ts (limbs by the joint-law builders). Edit the move file and rebuild, not this file.
 */
const POSES: ReferencePose[] = [
  // full-speed: Enters at sprint speed; opposite arm and leg drive while the gaze stays forward.
  { t: 0, leftUpperArm: [0, -0.35, 0.94], leftForearm: [0, -0.7, 0.71], rightUpperArm: [0, -0.9, -0.44], rightForearm: [0, -0.98, -0.18], leftThigh: [0, -0.92, -0.39], leftShin: [0, -0.99, 0.12], rightThigh: [0, -0.3, 0.95], rightShin: [0, -0.62, -0.78], leftPalm: [0, 0, 1], rightPalm: [0, 0, 1], bodyRoll: 0, spineBend: 3, headTurn: 0, headTilt: -2, footPoint: 18, bodyPitch: 70, grip: 0.18, hipsY: 0.03 },
  // brake-contact: Lead foot reaches ahead of the hips to brake; arms counterbalance without locking.
  { t: 0.1, leftUpperArm: [0, -0.82, -0.57], leftForearm: [0, -0.98, -0.18], rightUpperArm: [0, -0.38, 0.93], rightForearm: [0, -0.72, 0.69], leftThigh: [0, -0.45, 0.89], leftShin: [0, -0.88, -0.48], rightThigh: [0, -0.9, -0.44], rightShin: [0, -0.97, 0.24], leftPalm: [0, 0, 1], rightPalm: [0, 0, 1], bodyRoll: -2, spineBend: 5, headTurn: 0, headTilt: -1, footPoint: 12, bodyPitch: 68, grip: 0.18, hipsY: -0.03 },
  // absorb: Knees and hips flex to absorb speed; torso becomes more upright and arms widen slightly.
  { t: 0.2, leftUpperArm: [0, -0.7, -0.71], leftForearm: [0, -0.97, -0.24], rightUpperArm: [0, -0.52, 0.85], rightForearm: [0, -0.8, 0.6], leftThigh: [0, -0.58, 0.82], leftShin: [0, -0.82, -0.57], rightThigh: [0, -0.72, -0.69], rightShin: [0, -0.7, 0.71], leftPalm: [0, 0, 1], rightPalm: [0, 0, 1], bodyRoll: 2, spineBend: 8, headTurn: 0, headTilt: 1, footPoint: 8, bodyPitch: 73, grip: 0.18, hipsY: -0.1 },
  // second-brake: Opposite foot takes a shorter braking step as stride length rapidly decreases.
  { t: 0.32, leftUpperArm: [0, -0.45, 0.89], leftForearm: [0, -0.78, 0.63], rightUpperArm: [0, -0.82, -0.57], rightForearm: [0, -0.97, -0.24], leftThigh: [0, -0.8, -0.6], leftShin: [0, -0.95, 0.31], rightThigh: [0, -0.5, 0.87], rightShin: [0, -0.84, -0.54], leftPalm: [0, 0, 1], rightPalm: [0, 0, 1], bodyRoll: -2, spineBend: 6, headTurn: 0, headTilt: 0, footPoint: 7, bodyPitch: 76, grip: 0.18, hipsY: -0.08 },
  // short-step: A compact stabilising step brings the centre of mass back over the feet.
  { t: 0.44, leftUpperArm: [0, -0.75, -0.66], leftForearm: [0, -0.96, -0.28], rightUpperArm: [0, -0.58, 0.81], rightForearm: [0, -0.86, 0.51], leftThigh: [0, -0.48, 0.88], leftShin: [0, -0.86, -0.51], rightThigh: [0, -0.86, -0.5], rightShin: [0, -0.98, 0.2], leftPalm: [0, 0, 1], rightPalm: [0, 0, 1], bodyRoll: 1, spineBend: 4, headTurn: 0, headTilt: 0, footPoint: 5, bodyPitch: 80, grip: 0.18, hipsY: -0.06 },
  // settle: Speed is nearly gone; arms reduce their swing and the knees remain soft.
  { t: 0.56, leftUpperArm: [0, -0.86, -0.5], leftForearm: [0, -0.98, -0.2], rightUpperArm: [0, -0.8, 0.6], rightForearm: [0, -0.96, 0.28], leftThigh: [0, -0.92, -0.38], leftShin: [0, -0.99, 0.1], rightThigh: [0, -0.62, 0.78], rightShin: [0, -0.91, -0.41], leftPalm: [0, 0, 1], rightPalm: [0, 0, 1], bodyRoll: 0, spineBend: 2, headTurn: 0, headTilt: 1, footPoint: 4, bodyPitch: 84, grip: 0.06, hipsY: -0.04 },
  // balance: Final small step catches balance; chest stacks over pelvis and head remains steady.
  { t: 0.68, leftUpperArm: [0, -0.93, -0.36], leftForearm: [0, -0.99, -0.1], rightUpperArm: [0, -0.91, 0.41], rightForearm: [0, -0.99, 0.12], leftThigh: [0, -0.98, -0.18], leftShin: [0, -1, 0.02], rightThigh: [0, -0.88, 0.47], rightShin: [0, -0.97, -0.23], leftPalm: [0, 0, 1], rightPalm: [0, 0, 1], bodyRoll: 0, spineBend: 1, headTurn: 0, headTilt: 0, footPoint: 3, bodyPitch: 87, grip: 0.06, hipsY: -0.02 },
  // recover: Feet draw toward a comfortable stance and the hands relax beside the body.
  { t: 0.8, leftUpperArm: [0, -0.97, -0.24], leftForearm: [0, -1, -0.04], rightUpperArm: [0, -0.96, 0.28], rightForearm: [0, -1, 0.04], leftThigh: [0, -1, -0.05], leftShin: [0, -1, 0], rightThigh: [0, -0.97, 0.23], rightShin: [0, -0.99, -0.08], leftPalm: [0, 0, 1], rightPalm: [0, 0, 1], bodyRoll: 0, spineBend: 0, headTurn: 0, headTilt: 0, footPoint: 2, bodyPitch: 89, grip: 0.06, hipsY: 0 },
  // stand: Body reaches a stable standing posture with only residual arm motion.
  { t: 0.91, leftUpperArm: [0, -0.99, 0.1], leftForearm: [0, -1, 0.02], rightUpperArm: [0, -0.99, 0.1], rightForearm: [0, -1, 0.02], leftThigh: [0, -1, 0], leftShin: [0, -1, 0], rightThigh: [0, -1, 0], rightShin: [0, -1, 0], leftPalm: [0, 0, 1], rightPalm: [0, 0, 1], bodyRoll: 0, spineBend: 0, headTurn: 0, headTilt: 0, footPoint: 0, bodyPitch: 90, grip: 0.06, hipsY: 0 },
  // idle: Fully stopped in a neutral stance, ready to blend into idle.
  { t: 1, leftUpperArm: [0, -0.99, 0.08], leftForearm: [0, -1, 0.01], rightUpperArm: [0, -0.99, 0.08], rightForearm: [0, -1, 0.01], leftThigh: [0, -1, 0], leftShin: [0, -1, 0], rightThigh: [0, -1, 0], rightShin: [0, -1, 0], leftPalm: [0, 0, 1], rightPalm: [0, 0, 1], bodyRoll: 0, spineBend: 0, headTurn: 0, headTilt: 0, footPoint: 0, bodyPitch: 90, grip: 0.06, hipsY: 0 },
];

const DURATION = 1;

export default defineAnimation({
  slug: 'sprint-stop',
  name: 'Sprint Stop',
  clip: 'SprintStop',
  subcategory: 'animations',
  kind: 'once',
  duration: DURATION,
  keys: POSES.map((pose) => referenceKey(pose, DURATION, 90)),
});
