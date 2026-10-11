import type { RigBone, V3 } from '../_animation.js';
import { boundingBox, defineBody, type BodyJoint, type BodyPart, type FitTarget } from '../_body-type.js';

/**
 * The Simple body (decision 73, task P2-22): six parts like Roblox R6 (head, torso, and one
 * block each for the arms and legs) on a 6-joint skeleton. Arms and legs are stiff: elbows and
 * knees do not bend, so moves swing whole limbs from the shoulders and hips. Sleeves, hands, and
 * shoes are still painted areas on the limbs, so clothing works as on the other bodies. About
 * 1.83 m tall with hair.
 */

const joints: BodyJoint[] = [
  { name: 'Torso', parent: null, at: [0, 0.8, 0] },
  { name: 'Head', parent: 'Torso', at: [0, 1.4, 0] },
];
const parts: BodyPart[] = [
  // A band of the pants color at the waist, then the shirt.
  { joint: 'Torso', size: [0.6, 0.08, 0.3], center: [0, 0.84, 0], color: 'pants' },
  { joint: 'Torso', size: [0.6, 0.52, 0.3], center: [0, 1.14, 0], color: 'shirt', area: 'torso' },
  { joint: 'Head', size: [0.18, 0.04, 0.18], center: [0, 1.42, 0], color: 'skin' },
  { joint: 'Head', size: [0.38, 0.36, 0.36], center: [0, 1.62, 0], color: 'skin' },
  // Hair cap and back of the head.
  { joint: 'Head', size: [0.4, 0.09, 0.38], center: [0, 1.79, -0.005], color: 'hair' },
  { joint: 'Head', size: [0.4, 0.26, 0.08], center: [0, 1.66, -0.155], color: 'hair' },
  // Face (on the front, +z).
  { joint: 'Head', size: [0.065, 0.075, 0.02], center: [0.085, 1.65, 0.185], color: 'eyes' },
  { joint: 'Head', size: [0.065, 0.075, 0.02], center: [-0.085, 1.65, 0.185], color: 'eyes' },
  { joint: 'Head', size: [0.14, 0.03, 0.02], center: [0, 1.53, 0.185], color: 'mouth' },
];

const animation: Record<string, readonly RigBone[]> = {
  Torso: ['Hips', 'Spine', 'Spine1', 'Spine2'],
  Head: ['Neck', 'Head'],
};

/** Where Starter blocks (and the clothes on them) sit on this body. */
const fit: Partial<Record<RigBone, FitTarget>> = {
  Hips: { joint: 'Torso', box: { center: [0, 0.86, 0], size: [0.6, 0.12, 0.3] } },
  Spine1: { joint: 'Torso', box: { center: [0, 1.02, 0], size: [0.6, 0.2, 0.3] } },
  Spine2: { joint: 'Torso', box: { center: [0, 1.26, 0], size: [0.6, 0.28, 0.3] } },
  Neck: { joint: 'Torso', box: { center: [0, 1.42, 0], size: [0.18, 0.04, 0.18] } },
};

for (const side of ['Left', 'Right'] as const) {
  const s = side === 'Left' ? 1 : -1;
  const at = (x: number, y: number, z: number): V3 => [x * s, y, z];
  joints.push(
    { name: `${side}Arm`, parent: 'Torso', at: at(0.3, 1.32, 0) },
    { name: `${side}Leg`, parent: 'Torso', at: at(0.15, 0.8, 0) },
  );
  // One stiff block per limb, split into painted areas (sleeve, forearm, hand; leg, shoe).
  const upperArm = { center: at(0.425, 1.25, 0), size: [0.25, 0.3, 0.3] as V3 };
  const lowerArm = { center: at(0.675, 1.25, 0), size: [0.25, 0.3, 0.3] as V3 };
  const hand = { center: at(0.85, 1.25, 0), size: [0.1, 0.28, 0.28] as V3 };
  const upperLeg = { center: at(0.15, 0.625, 0), size: [0.3, 0.35, 0.3] as V3 };
  const lowerLeg = { center: at(0.15, 0.285, 0), size: [0.3, 0.33, 0.3] as V3 };
  const foot = { center: at(0.15, 0.06, 0.02), size: [0.3, 0.12, 0.34] as V3 };
  parts.push(
    { joint: `${side}Arm`, ...upperArm, color: 'shirt', area: 'upperArms' },
    { joint: `${side}Arm`, ...lowerArm, color: 'skin', area: 'forearms' },
    { joint: `${side}Arm`, ...hand, color: 'skin' },
    { joint: `${side}Leg`, ...upperLeg, color: 'pants', area: 'upperLegs' },
    { joint: `${side}Leg`, ...lowerLeg, color: 'pants', area: 'lowerLegs' },
    { joint: `${side}Leg`, ...foot, color: 'shoes', area: 'feet' },
  );
  // Only the shoulder and hip turn; elbow, knee, hand, and foot moves are left out.
  animation[`${side}Arm`] = [`${side}Shoulder`, `${side}Arm`];
  animation[`${side}Leg`] = [`${side}UpLeg`];
  fit[`${side}Shoulder`] = {
    joint: `${side}Arm`,
    box: { center: at(0.34, 1.25, 0), size: [0.08, 0.3, 0.3] },
  };
  fit[`${side}Arm`] = { joint: `${side}Arm`, box: upperArm };
  fit[`${side}ForeArm`] = { joint: `${side}Arm`, box: lowerArm };
  fit[`${side}Hand`] = { joint: `${side}Arm`, box: hand };
  fit[`${side}UpLeg`] = { joint: `${side}Leg`, box: upperLeg };
  fit[`${side}Leg`] = { joint: `${side}Leg`, box: lowerLeg };
  fit[`${side}Foot`] = { joint: `${side}Leg`, box: foot };
}

// The head with its hair and face (the neck block sits below, like the Starter body's neck bone).
fit.Head = { joint: 'Head', box: boundingBox(parts.filter((p) => p.joint === 'Head' && p.center[1] > 1.43)) };

export default defineBody({
  id: 'simple',
  name: 'Simple',
  bonePrefix: '',
  joints,
  parts,
  animation,
  fit,
  sketchArm: { start: 0.3, axisY: 1.25, hangX: 0.45, topY: 1.4 },
});
