import { defineAnimation, referenceKey, type ReferencePose } from '../_animation.js';

/**
 * Slide, built from the owner's move file docs/reference/character-anime/moves/slide/move.json by
 * tooling/moves/build-moves.ts (limbs by the joint-law builders). Edit the move file and rebuild, not this file.
 */
const POSES: ReferencePose[] = [
  // entry-run: Character enters from a run with the gaze forward and begins preparing to lower the centre of mass.
  { t: 0, leftUpperArm: [0.04, -0.78, -0.63], leftForearm: [0.02, -0.95, -0.3], rightUpperArm: [-0.04, -0.4, 0.92], rightForearm: [-0.02, -0.72, 0.69], leftThigh: [0.05, -0.86, -0.5], leftShin: [0.02, -0.98, 0.18], rightThigh: [-0.05, -0.38, 0.92], rightShin: [-0.02, -0.7, -0.71], leftPalm: [0.06, 0.03, -0.99], rightPalm: [-0.06, 0.03, -0.99], bodyRoll: -2, spineBend: 5, headTurn: 0, headTilt: -2, footPoint: 14, bodyPitch: 70, grip: 0.12, hipsY: 0.01 },
  // drop: Hips drop quickly while the torso inclines forward; both knees flex to enter the slide without collapsing.
  { t: 0.1, leftUpperArm: [0.06, -0.58, -0.81], leftForearm: [0.03, -0.86, -0.5], rightUpperArm: [-0.06, -0.62, 0.78], rightForearm: [-0.03, -0.84, 0.54], leftThigh: [0.08, -0.62, 0.78], leftShin: [0.03, -0.74, -0.67], rightThigh: [-0.08, -0.7, 0.71], rightShin: [-0.03, -0.8, -0.6], leftPalm: [0.07, 0.04, -0.99], rightPalm: [-0.07, 0.04, -0.99], bodyRoll: 0, spineBend: 14, headTurn: 0, headTilt: 0, footPoint: 5, bodyPitch: 61, grip: 0.1, hipsY: -0.22 },
  // slide-entry: Lead leg extends forward as the trailing leg folds underneath; arms move back and outward to stabilise.
  { t: 0.2, leftUpperArm: [0.28, -0.42, -0.86], leftForearm: [0.04, -0.74, -0.67], rightUpperArm: [-0.08, -0.5, 0.86], rightForearm: [-0.04, -0.78, 0.62], leftThigh: [0.1, -0.24, 0.97], leftShin: [0.04, -0.82, -0.57], rightThigh: [-0.1, -0.58, 0.81], rightShin: [-0.04, -0.62, -0.78], leftPalm: [0.08, 0.05, -0.99], rightPalm: [-0.08, 0.05, -0.99], bodyRoll: 4, spineBend: 20, headTurn: 0, headTilt: 1, footPoint: 2, bodyPitch: 48, grip: 0.08, hipsY: -0.4 },
  // full-slide: Character reaches the lowest sliding silhouette: one leg forward, the other folded, chest controlled above the hips.
  { t: 0.32, leftUpperArm: [0.38, -0.32, -0.86], leftForearm: [0.05, -0.66, -0.75], rightUpperArm: [-0.1, -0.4, 0.91], rightForearm: [-0.05, -0.7, 0.71], leftThigh: [0.1, -0.08, 0.99], leftShin: [0.04, -0.92, -0.39], rightThigh: [-0.14, -0.42, 0.9], rightShin: [-0.06, -0.48, -0.87], leftPalm: [0.09, 0.05, -0.99], rightPalm: [-0.09, 0.05, -0.99], bodyRoll: 5, spineBend: 22, headTurn: 0, headTilt: 1, footPoint: 0, bodyPitch: 39, grip: 0.07, hipsY: -0.53 },
  // slide-hold: The slide is sustained briefly with minimal vertical movement; head remains up so the player can see ahead.
  { t: 0.46, leftUpperArm: [0.33, -0.38, -0.86], leftForearm: [0.04, -0.7, -0.71], rightUpperArm: [-0.08, -0.44, 0.89], rightForearm: [-0.04, -0.73, 0.68], leftThigh: [0.09, -0.1, 0.99], leftShin: [0.04, -0.94, -0.34], rightThigh: [-0.13, -0.45, 0.88], rightShin: [-0.05, -0.52, -0.85], leftPalm: [0.08, 0.05, -0.99], rightPalm: [-0.08, 0.05, -0.99], bodyRoll: 3, spineBend: 20, headTurn: 0, headTilt: 0, footPoint: 0, bodyPitch: 41, grip: 0.07, hipsY: -0.54 },
  // brake: Forward speed drops as the lead foot and folded leg begin preparing to bring the body back underneath the pelvis.
  { t: 0.6, leftUpperArm: [0.07, -0.5, -0.86], leftForearm: [0.04, -0.78, -0.62], rightUpperArm: [-0.07, -0.54, 0.84], rightForearm: [-0.04, -0.8, 0.6], leftThigh: [0.1, -0.22, 0.97], leftShin: [0.04, -0.88, -0.47], rightThigh: [-0.12, -0.5, 0.86], rightShin: [-0.05, -0.58, -0.81], leftPalm: [0.07, 0.05, -0.99], rightPalm: [-0.07, 0.05, -0.99], bodyRoll: 2, spineBend: 18, headTurn: 0, headTilt: 0, footPoint: 0, bodyPitch: 46, grip: 0.07, hipsY: -0.5 },
  // leg-recover: Lead foot draws closer and the trailing leg comes underneath, transitioning from the slide into a compact crouch.
  { t: 0.72, leftUpperArm: [0.06, -0.64, -0.77], leftForearm: [0.03, -0.86, -0.5], rightUpperArm: [-0.06, -0.64, 0.77], rightForearm: [-0.03, -0.86, 0.5], leftThigh: [0.1, -0.44, 0.89], leftShin: [0.04, -0.68, -0.73], rightThigh: [-0.1, -0.54, 0.84], rightShin: [-0.04, -0.62, -0.78], leftPalm: [0.06, 0.05, -0.99], rightPalm: [-0.06, 0.05, -0.99], bodyRoll: 1, spineBend: 16, headTurn: 0, headTilt: 0, footPoint: 0, bodyPitch: 56, grip: 0.07, hipsY: -0.42 },
  // crouch: Character catches the remaining momentum in a balanced crouch with knees aligned over the feet.
  { t: 0.84, leftUpperArm: [0.06, -0.76, 0.65], leftForearm: [0.03, -0.92, 0.39], rightUpperArm: [-0.06, -0.76, 0.65], rightForearm: [-0.03, -0.92, 0.39], leftThigh: [0.1, -0.54, 0.84], leftShin: [0.04, -0.64, -0.77], rightThigh: [-0.1, -0.54, 0.84], rightShin: [-0.04, -0.64, -0.77], leftPalm: [0.06, 0.05, -0.99], rightPalm: [-0.06, 0.05, -0.99], bodyRoll: 0, spineBend: 14, headTurn: 0, headTilt: 0, footPoint: 0, bodyPitch: 69, grip: 0.07, hipsY: -0.31 },
  // rise: Legs begin extending while the torso rises smoothly; the character remains ready to transition back into locomotion.
  { t: 0.93, leftUpperArm: [0.05, -0.9, 0.43], leftForearm: [0.02, -0.98, 0.18], rightUpperArm: [-0.05, -0.9, 0.43], rightForearm: [-0.02, -0.98, 0.18], leftThigh: [0.08, -0.72, 0.69], leftShin: [0.03, -0.8, -0.6], rightThigh: [-0.08, -0.72, 0.69], rightShin: [-0.03, -0.8, -0.6], leftPalm: [0.05, 0.04, -0.99], rightPalm: [-0.05, 0.04, -0.99], bodyRoll: 0, spineBend: 9, headTurn: 0, headTilt: 0, footPoint: 0, bodyPitch: 78, grip: 0.06, hipsY: -0.18 },
  // finish: Slide finishes in a low athletic stance that can blend directly into run, crouch or idle.
  { t: 1, leftUpperArm: [0.04, -0.96, 0.27], leftForearm: [0.02, -0.99, 0.1], rightUpperArm: [-0.04, -0.96, 0.27], rightForearm: [-0.02, -0.99, 0.1], leftThigh: [0.06, -0.88, 0.47], leftShin: [0.03, -0.91, -0.41], rightThigh: [-0.06, -0.88, 0.47], rightShin: [-0.03, -0.91, -0.41], leftPalm: [0.05, 0.04, -0.99], rightPalm: [-0.05, 0.04, -0.99], bodyRoll: 0, spineBend: 7, headTurn: 0, headTilt: 0, footPoint: 0, bodyPitch: 80, grip: 0.05, hipsY: -0.13 },
];

const DURATION = 1.05;

export default defineAnimation({
  slug: 'slide',
  name: 'Slide',
  clip: 'Slide',
  subcategory: 'animations',
  kind: 'once',
  duration: DURATION,
  keys: POSES.map((pose) => referenceKey(pose, DURATION, 90)),
});
