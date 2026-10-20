import { defineAnimation, referenceKey, type ReferencePose } from '../_animation.js';

/**
 * Turn 180, built from the owner's move file docs/reference/character-anime/moves/turn-180/move.json by
 * tooling/moves/build-moves.ts (limbs by the joint-law builders). Edit the move file and rebuild, not this file.
 */
const POSES: ReferencePose[] = [
  // ready: Neutral start; head prepares to lead the 180-degree change of direction.
  { t: 0, leftUpperArm: [0.04, -0.99, 0.1], leftForearm: [0.02, -1, 0.03], rightUpperArm: [-0.04, -0.99, 0.1], rightForearm: [-0.02, -1, 0.03], leftThigh: [0.04, -1, 0.02], leftShin: [0.02, -1, 0], rightThigh: [-0.04, -1, 0.02], rightShin: [-0.02, -1, 0], leftPalm: [0.05, 0.02, -1], rightPalm: [-0.05, 0.02, -1], bodyRoll: 0, spineBend: 0, headTurn: 0, headTilt: 0, footPoint: 0, bodyPitch: 90, grip: 0.05, hipsY: 0 },
  // look-left: Eyes and head turn left first, followed by the upper chest; the pelvis deliberately lags behind.
  { t: 0.09, leftUpperArm: [0.06, -0.97, 0.23], leftForearm: [0.03, -0.99, 0.1], rightUpperArm: [-0.06, -0.98, -0.18], rightForearm: [-0.03, -1, -0.06], leftThigh: [0.08, -0.98, 0.16], leftShin: [0.03, -1, -0.04], rightThigh: [-0.06, -0.99, -0.1], rightShin: [-0.02, -1, 0.03], leftPalm: [0.05, 0.02, -1], rightPalm: [-0.05, 0.02, -1], bodyRoll: -1, spineBend: 2, headTurn: 38, headTilt: 0, footPoint: 0, bodyPitch: 88, grip: 0.06, hipsY: -0.02 },
  // load-right: Weight compresses onto the right leg; the left foot becomes light for the first turning step.
  { t: 0.2, leftUpperArm: [0.1, -0.9, 0.43], leftForearm: [0.05, -0.98, 0.19], rightUpperArm: [-0.1, -0.92, -0.38], rightForearm: [-0.05, -0.98, -0.16], leftThigh: [0.24, -0.89, 0.38], leftShin: [0.09, -0.97, -0.22], rightThigh: [-0.08, -0.98, -0.17], rightShin: [-0.03, -0.99, 0.08], leftPalm: [0.06, 0.03, -1], rightPalm: [-0.06, 0.03, -1], bodyRoll: -3, spineBend: 4, headTurn: 42, headTilt: 0, footPoint: 2, bodyPitch: 86, grip: 0.08, hipsY: -0.07 },
  // left-step: Left foot steps around the body as the right foot pivots; arms counter the rotation to control momentum.
  { t: 0.32, leftUpperArm: [0.13, -0.82, 0.56], leftForearm: [0.07, -0.95, 0.3], rightUpperArm: [-0.12, -0.88, -0.46], rightForearm: [-0.06, -0.97, -0.23], leftThigh: [0.38, -0.75, 0.54], leftShin: [0.15, -0.9, -0.41], rightThigh: [-0.07, -0.99, -0.1], rightShin: [-0.03, -1, 0.04], leftPalm: [0.06, 0.03, -1], rightPalm: [-0.06, 0.03, -1], bodyRoll: -3, spineBend: 4, headTurn: 34, headTilt: 0, footPoint: 6, bodyPitch: 85, grip: 0.08, hipsY: -0.06 },
  // first-pivot: Pelvis rotates through roughly the first half of the turn while the head continues tracking the destination. The stepping knee bends so the foot lifts (board M16).
  { t: 0.44, leftUpperArm: [0.1, -0.88, 0.46], leftForearm: [0.05, -0.98, 0.2], rightUpperArm: [-0.1, -0.88, -0.46], rightForearm: [-0.05, -0.98, -0.2], leftThigh: [0.18, -0.96, 0.22], leftShin: [0.07, -0.99, -0.1], rightThigh: [-0.2, -0.92, -0.34], rightShin: [-0.08, -0.49, -0.85], leftPalm: [0.05, 0.03, -1], rightPalm: [-0.05, 0.03, -1], bodyRoll: 0, spineBend: 3, headTurn: 26, headTilt: 0, footPoint: 4, bodyPitch: 87, grip: 0.07, hipsY: -0.04 },
  // right-follow: Right foot swings around to continue the rotation; the body stays low enough to keep the pivot stable.
  { t: 0.56, leftUpperArm: [0.07, -0.94, 0.34], leftForearm: [0.04, -0.99, 0.14], rightUpperArm: [-0.09, -0.9, -0.42], rightForearm: [-0.05, -0.98, -0.18], leftThigh: [0.08, -0.99, 0.1], leftShin: [0.03, -1, -0.03], rightThigh: [-0.34, -0.8, 0.49], rightShin: [-0.13, -0.92, -0.37], leftPalm: [0.05, 0.03, -1], rightPalm: [-0.05, 0.03, -1], bodyRoll: 2, spineBend: 3, headTurn: 20, headTilt: 0, footPoint: 6, bodyPitch: 87, grip: 0.07, hipsY: -0.03 },
  // second-pivot: Feet exchange support through the second half of the turn; shoulders follow the pelvis without overtwisting. The stepping knee bends so the foot lifts (board M16).
  { t: 0.68, leftUpperArm: [0.07, -0.94, -0.33], leftForearm: [0.04, -0.99, -0.14], rightUpperArm: [-0.07, -0.94, 0.33], rightForearm: [-0.04, -0.99, 0.14], leftThigh: [0.2, -0.92, -0.34], leftShin: [0.08, -0.49, -0.85], rightThigh: [-0.18, -0.96, 0.22], rightShin: [-0.07, -0.99, -0.1], leftPalm: [0.05, 0.03, -1], rightPalm: [-0.05, 0.03, -1], bodyRoll: 0, spineBend: 2, headTurn: 12, headTilt: 0, footPoint: 4, bodyPitch: 88, grip: 0.06, hipsY: -0.03 },
  // square-up: Feet square toward the opposite direction and the head settles back to neutral relative to the torso.
  { t: 0.8, leftUpperArm: [0.05, -0.98, 0.18], leftForearm: [0.03, -1, 0.06], rightUpperArm: [-0.05, -0.97, 0.22], rightForearm: [-0.03, -0.99, 0.08], leftThigh: [0.06, -0.99, 0.08], leftShin: [0.02, -1, -0.02], rightThigh: [-0.14, -0.97, 0.2], rightShin: [-0.05, -0.99, -0.09], leftPalm: [0.05, 0.02, -1], rightPalm: [-0.05, 0.02, -1], bodyRoll: 1, spineBend: 1, headTurn: 5, headTilt: 0, footPoint: 2, bodyPitch: 89, grip: 0.05, hipsY: -0.01 },
  // settle: Residual arm and shoulder motion dies away after the 180-degree pivot.
  { t: 0.91, leftUpperArm: [0.04, -0.99, 0.11], leftForearm: [0.02, -1, 0.03], rightUpperArm: [-0.04, -0.99, 0.12], rightForearm: [-0.02, -1, 0.04], leftThigh: [0.04, -1, 0.02], leftShin: [0.02, -1, 0], rightThigh: [-0.05, -1, 0.04], rightShin: [-0.02, -1, -0.01], leftPalm: [0.05, 0.02, -1], rightPalm: [-0.05, 0.02, -1], bodyRoll: 0, spineBend: 0.5, headTurn: 0, headTilt: 0, footPoint: 0, bodyPitch: 90, grip: 0.05, hipsY: 0 },
  // finish: Final neutral pose facing exactly opposite the starting direction after a +180-degree root yaw.
  { t: 1, leftUpperArm: [0.04, -0.99, 0.1], leftForearm: [0.02, -1, 0.03], rightUpperArm: [-0.04, -0.99, 0.1], rightForearm: [-0.02, -1, 0.03], leftThigh: [0.04, -1, 0.02], leftShin: [0.02, -1, 0], rightThigh: [-0.04, -1, 0.02], rightShin: [-0.02, -1, 0], leftPalm: [0.05, 0.02, -1], rightPalm: [-0.05, 0.02, -1], bodyRoll: 0, spineBend: 0, headTurn: 0, headTilt: 0, footPoint: 0, bodyPitch: 90, grip: 0.05, hipsY: 0 },
];

const DURATION = 0.92;

export default defineAnimation({
  slug: 'turn-180',
  name: 'Turn 180',
  clip: 'Turn180',
  subcategory: 'animations',
  kind: 'once',
  duration: DURATION,
  keys: POSES.map((pose) => referenceKey(pose, DURATION, 90)),
});
