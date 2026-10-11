import { defineAnimation, referenceKey, type ReferencePose } from '../_animation.js';

/**
 * Breaststroke, the calm swim, from the owner's reference (CHAR-02):
 * docs/reference/character-anime/01-boy-body/swim-reference/breaststroke-directions.json. Pull, breathe with the
 * head and shoulders up, shoot the arms ahead, then one whip kick, then glide. In the leg recovery the heels come
 * up toward the surface, so the shins of poses 4-5 point to -z (the table had them toward the bottom).
 *
 * Body frame: +y is ahead of the swimmer, +z the pool bottom (the runtime lies the body nearly flat).
 */
const POSES: ReferencePose[] = [
  { t: 0, leftUpperArm: [0.03, 1, 0], leftForearm: [0.01, 1, 0], rightUpperArm: [-0.03, 1, 0], rightForearm: [-0.01, 1, 0],
    leftThigh: [0.02, -1, 0], leftShin: [0.01, -1, 0], rightThigh: [-0.02, -1, 0], rightShin: [-0.01, -1, 0],
    bodyRoll: 0, spineBend: 0, headTurn: 0, headTilt: 8, footPoint: 50, bodyPitch: 2, grip: 0.05 },
  { t: 0.125, leftUpperArm: [0.35, 0.93, 0.08], leftForearm: [0.55, 0.82, 0.15], rightUpperArm: [-0.35, 0.93, 0.08], rightForearm: [-0.55, 0.82, 0.15],
    leftThigh: [0.02, -1, 0], leftShin: [0.01, -1, 0], rightThigh: [-0.02, -1, 0], rightShin: [-0.01, -1, 0],
    bodyRoll: 0, spineBend: 2, headTurn: 0, headTilt: 5, footPoint: 48, bodyPitch: 3, grip: 0.05 },
  { t: 0.25, leftUpperArm: [0.62, 0.75, 0.2], leftForearm: [0.38, 0.45, 0.81], rightUpperArm: [-0.62, 0.75, 0.2], rightForearm: [-0.38, 0.45, 0.81],
    leftThigh: [0.02, -1, 0], leftShin: [0.01, -1, 0], rightThigh: [-0.02, -1, 0], rightShin: [-0.01, -1, 0],
    bodyRoll: 0, spineBend: -4, headTurn: 0, headTilt: 0, footPoint: 45, bodyPitch: 5, grip: 0.08 },
  { t: 0.375, leftUpperArm: [0.52, 0.45, 0.45], leftForearm: [-0.18, 0.28, 0.94], rightUpperArm: [-0.52, 0.45, 0.45], rightForearm: [0.18, 0.28, 0.94],
    leftThigh: [0.1, -0.96, 0.15], leftShin: [0.08, -0.75, -0.45], rightThigh: [-0.1, -0.96, 0.15], rightShin: [-0.08, -0.75, -0.45],
    bodyRoll: 0, spineBend: -10, headTurn: 0, headTilt: -8, footPoint: 35, bodyPitch: 8, grip: 0.08 },
  { t: 0.5, leftUpperArm: [0.22, 0.55, 0.35], leftForearm: [-0.15, 0.62, 0.25], rightUpperArm: [-0.22, 0.55, 0.35], rightForearm: [0.15, 0.62, 0.25],
    leftThigh: [0.25, -0.78, 0.2], leftShin: [0.35, 0.15, -0.35], rightThigh: [-0.25, -0.78, 0.2], rightShin: [-0.35, 0.15, -0.35],
    bodyRoll: 0, spineBend: -12, headTurn: 0, headTilt: -12, footPoint: 10, bodyPitch: 10, grip: 0.05 },
  { t: 0.625, leftUpperArm: [0.1, 0.98, 0.05], leftForearm: [0.04, 1, 0.02], rightUpperArm: [-0.1, 0.98, 0.05], rightForearm: [-0.04, 1, 0.02],
    leftThigh: [0.38, -0.72, 0.15], leftShin: [0.75, -0.35, 0.15], rightThigh: [-0.38, -0.72, 0.15], rightShin: [-0.75, -0.35, 0.15],
    bodyRoll: 0, spineBend: -5, headTurn: 0, headTilt: 2, footPoint: 12, bodyPitch: 6, grip: 0.03 },
  { t: 0.75, leftUpperArm: [0.03, 1, 0], leftForearm: [0.01, 1, 0], rightUpperArm: [-0.03, 1, 0], rightForearm: [-0.01, 1, 0],
    leftThigh: [0.3, -0.92, 0.05], leftShin: [0.55, -0.82, -0.05], rightThigh: [-0.3, -0.92, 0.05], rightShin: [-0.55, -0.82, -0.05],
    bodyRoll: 0, spineBend: 0, headTurn: 0, headTilt: 7, footPoint: 35, bodyPitch: 3, grip: 0.02 },
  { t: 0.875, leftUpperArm: [0.03, 1, 0], leftForearm: [0.01, 1, 0], rightUpperArm: [-0.03, 1, 0], rightForearm: [-0.01, 1, 0],
    leftThigh: [0.04, -1, 0], leftShin: [0.03, -1, 0], rightThigh: [-0.04, -1, 0], rightShin: [-0.03, -1, 0],
    bodyRoll: 0, spineBend: 0, headTurn: 0, headTilt: 8, footPoint: 52, bodyPitch: 2, grip: 0.02 },
];

const DURATION = 1.8;
/** The body angle this swim is played at (degrees off flat, see `clipTilt` in the runtime). */
const BASE_PITCH = 5;

export default defineAnimation({
  slug: 'swim-breast',
  name: 'Breaststroke',
  clip: 'SwimBreast',
  subcategory: 'animations',
  kind: 'loop',
  duration: DURATION,
  keys: [...POSES, { ...POSES[0]!, t: 1 }].map((pose) => referenceKey(pose, DURATION, BASE_PITCH)),
});
