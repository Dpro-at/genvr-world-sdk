import { defineAnimation, referenceKey, type ReferencePose } from '../_animation.js';

/**
 * Front crawl, the fast swim, from the owner's reference (CHAR-02):
 * docs/reference/character-anime/01-boy-body/swim-reference/crawl-chatgpt.webp (pictures) and
 * crawl-directions.json (ChatGPT's direction table). Two fixes, both checked against the pictures: the table's
 * arm z signs were mixed (pulls pointing at the sky, recoveries at the pool bottom), so the upper arm is under the
 * water except in its recovery and the forearm always hangs toward the water; and its breath turned the head
 * toward the low shoulder, here it turns to the raised side.
 *
 * Body frame: +y is ahead of the swimmer, +z the pool bottom (the runtime lies the body almost flat).
 */
const POSES: ReferencePose[] = [
  { t: 0, leftUpperArm: [0.05, 0.99, 0.1], leftForearm: [0.02, 0.99, 0.12], rightUpperArm: [-0.08, -0.93, 0.36], rightForearm: [-0.03, -0.98, 0.18],
    leftThigh: [0.02, -0.99, -0.1], leftShin: [0.01, -0.98, -0.2], rightThigh: [-0.02, -0.98, 0.18], rightShin: [-0.01, -0.99, 0.1],
    bodyRoll: 20, spineBend: 2, headTurn: 0, headTilt: 6, footPoint: 35, bodyPitch: 3, grip: 0.05 },
  { t: 0.125, leftUpperArm: [0.04, 0.99, 0.08], leftForearm: [0.01, 1, 0.04], rightUpperArm: [-0.42, 0.18, -0.89], rightForearm: [-0.3, 0.7, 0.65],
    leftThigh: [0.02, -0.98, 0.18], leftShin: [0.01, -0.99, 0.08], rightThigh: [-0.02, -0.99, -0.1], rightShin: [-0.01, -0.97, -0.24],
    bodyRoll: 30, spineBend: 2, headTurn: 0, headTilt: 5, footPoint: 38, bodyPitch: 3, grip: 0.05 },
  { t: 0.25, leftUpperArm: [0.06, 0.94, 0.34], leftForearm: [0.03, 0.42, 0.91], rightUpperArm: [-0.34, 0.55, -0.76], rightForearm: [-0.18, 0.87, 0.46],
    leftThigh: [0.02, -0.99, -0.08], leftShin: [0.01, -0.96, -0.28], rightThigh: [-0.02, -0.98, 0.18], rightShin: [-0.01, -0.99, 0.09],
    bodyRoll: 18, spineBend: 2, headTurn: 0, headTilt: 6, footPoint: 38, bodyPitch: 3, grip: 0.08 },
  { t: 0.375, leftUpperArm: [0.08, 0.55, 0.83], leftForearm: [0.03, -0.2, 0.98], rightUpperArm: [-0.05, 0.98, 0.18], rightForearm: [-0.02, 0.99, 0.1],
    leftThigh: [0.02, -0.98, 0.17], leftShin: [0.01, -0.99, 0.1], rightThigh: [-0.02, -0.99, -0.08], rightShin: [-0.01, -0.96, -0.27],
    bodyRoll: 5, spineBend: 2, headTurn: 0, headTilt: 5, footPoint: 40, bodyPitch: 2, grip: 0.1 },
  { t: 0.5, leftUpperArm: [0.06, -0.55, 0.83], leftForearm: [0.02, -0.92, 0.39], rightUpperArm: [-0.04, 0.99, 0.1], rightForearm: [-0.01, 1, 0.05],
    leftThigh: [0.02, -0.99, -0.1], leftShin: [0.01, -0.97, -0.24], rightThigh: [-0.02, -0.98, 0.18], rightShin: [-0.01, -0.99, 0.08],
    bodyRoll: -20, spineBend: 2, headTurn: 0, headTilt: 5, footPoint: 38, bodyPitch: 3, grip: 0.08 },
  { t: 0.625, leftUpperArm: [0.4, 0.18, -0.9], leftForearm: [0.28, 0.7, 0.66], rightUpperArm: [-0.06, 0.94, 0.34], rightForearm: [-0.03, 0.42, 0.91],
    leftThigh: [0.02, -0.98, 0.18], leftShin: [0.01, -0.99, 0.08], rightThigh: [-0.02, -0.99, -0.1], rightShin: [-0.01, -0.97, -0.24],
    bodyRoll: -30, spineBend: 2, headTurn: 0, headTilt: 5, footPoint: 38, bodyPitch: 3, grip: 0.07 },
  { t: 0.75, leftUpperArm: [0.32, 0.57, -0.76], leftForearm: [0.16, 0.88, 0.45], rightUpperArm: [-0.08, 0.55, 0.83], rightForearm: [-0.03, -0.2, 0.98],
    leftThigh: [0.02, -0.99, -0.08], leftShin: [0.01, -0.96, -0.28], rightThigh: [-0.02, -0.98, 0.17], rightShin: [-0.01, -0.99, 0.09],
    bodyRoll: -35, spineBend: 3, headTurn: 55, headTilt: -3, footPoint: 40, bodyPitch: 4, grip: 0.1 },
  { t: 0.875, leftUpperArm: [0.05, 0.97, 0.23], leftForearm: [0.02, 0.99, 0.12], rightUpperArm: [-0.07, -0.53, 0.85], rightForearm: [-0.02, -0.91, 0.41],
    leftThigh: [0.02, -0.98, 0.18], leftShin: [0.01, -0.99, 0.08], rightThigh: [-0.02, -0.99, -0.09], rightShin: [-0.01, -0.96, -0.27],
    bodyRoll: -12, spineBend: 2, headTurn: 15, headTilt: 4, footPoint: 38, bodyPitch: 3, grip: 0.08 },
];

const DURATION = 1.4;
/** The body angle this swim is played at (degrees off flat, see `clipTilt` in the runtime). */
const BASE_PITCH = 3;

export default defineAnimation({
  slug: 'swim',
  name: 'Swim',
  clip: 'Swim',
  subcategory: 'animations',
  kind: 'loop',
  duration: DURATION,
  keys: [...POSES, { ...POSES[0]!, t: 1 }].map((pose) => referenceKey(pose, DURATION, BASE_PITCH)),
});
