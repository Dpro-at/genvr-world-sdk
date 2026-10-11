import type { RigBone, V3 } from '../_animation.js';
import { boundingBox, defineBody, type BodyJoint, type BodyPart, type FitTarget } from '../_body-type.js';

/**
 * The Classic body (decision 73, task P2-22): the Roblox-like main avatar. Fifteen jointed blocks
 * like Roblox R15 (head, upper and lower torso, and upper, lower, and end parts of each arm and
 * leg) with its own 15-joint skeleton; a big square head, a wide torso, and thick limbs, about
 * 1.85 m tall with hair. Core animations drive it through the joint map below.
 */

const joints: BodyJoint[] = [
  { name: 'LowerTorso', parent: null, at: [0, 0.9, 0] },
  { name: 'UpperTorso', parent: 'LowerTorso', at: [0, 1, 0] },
  { name: 'Head', parent: 'UpperTorso', at: [0, 1.42, 0] },
];
const parts: BodyPart[] = [
  { joint: 'LowerTorso', size: [0.62, 0.2, 0.31], center: [0, 0.9, 0], color: 'pants' },
  { joint: 'UpperTorso', size: [0.62, 0.42, 0.31], center: [0, 1.21, 0], color: 'shirt', area: 'torso' },
  { joint: 'Head', size: [0.2, 0.04, 0.2], center: [0, 1.43, 0], color: 'skin' },
  { joint: 'Head', size: [0.4, 0.38, 0.38], center: [0, 1.63, 0], color: 'skin' },
  // Hair cap and back of the head.
  { joint: 'Head', size: [0.42, 0.09, 0.4], center: [0, 1.81, -0.005], color: 'hair' },
  { joint: 'Head', size: [0.42, 0.28, 0.08], center: [0, 1.68, -0.165], color: 'hair' },
  // Face (on the front, +z).
  { joint: 'Head', size: [0.07, 0.08, 0.02], center: [0.09, 1.66, 0.195], color: 'eyes' },
  { joint: 'Head', size: [0.07, 0.08, 0.02], center: [-0.09, 1.66, 0.195], color: 'eyes' },
  { joint: 'Head', size: [0.15, 0.03, 0.02], center: [0, 1.54, 0.195], color: 'mouth' },
];

const animation: Record<string, readonly RigBone[]> = {
  LowerTorso: ['Hips'],
  UpperTorso: ['Spine', 'Spine1', 'Spine2'],
  Head: ['Neck', 'Head'],
};

/** Where Starter blocks (and the clothes on them) sit on this body. */
const fit: Partial<Record<RigBone, FitTarget>> = {
  Hips: { joint: 'LowerTorso', box: { center: [0, 0.9, 0], size: [0.62, 0.2, 0.31] } },
  Spine1: { joint: 'UpperTorso', box: { center: [0, 1.095, 0], size: [0.62, 0.19, 0.31] } },
  Spine2: { joint: 'UpperTorso', box: { center: [0, 1.3, 0], size: [0.62, 0.24, 0.31] } },
  Neck: { joint: 'UpperTorso', box: { center: [0, 1.43, 0], size: [0.2, 0.04, 0.2] } },
};

for (const side of ['Left', 'Right'] as const) {
  const s = side === 'Left' ? 1 : -1;
  const at = (x: number, y: number, z: number): V3 => [x * s, y, z];
  joints.push(
    { name: `${side}UpperArm`, parent: 'UpperTorso', at: at(0.31, 1.35, 0) },
    { name: `${side}LowerArm`, parent: `${side}UpperArm`, at: at(0.58, 1.27, 0) },
    { name: `${side}Hand`, parent: `${side}LowerArm`, at: at(0.82, 1.27, 0) },
    { name: `${side}UpperLeg`, parent: 'LowerTorso', at: at(0.155, 0.8, 0) },
    { name: `${side}LowerLeg`, parent: `${side}UpperLeg`, at: at(0.155, 0.42, 0) },
    { name: `${side}Foot`, parent: `${side}LowerLeg`, at: at(0.155, 0.12, 0) },
  );
  const upperArm = { center: at(0.445, 1.27, 0), size: [0.27, 0.3, 0.3] as V3 };
  const lowerArm = { center: at(0.7, 1.27, 0), size: [0.24, 0.28, 0.28] as V3 };
  const hand = { center: at(0.88, 1.27, 0), size: [0.12, 0.26, 0.26] as V3 };
  const upperLeg = { center: at(0.155, 0.61, 0), size: [0.3, 0.38, 0.3] as V3 };
  const lowerLeg = { center: at(0.155, 0.27, 0), size: [0.29, 0.3, 0.29] as V3 };
  const foot = { center: at(0.155, 0.06, 0.03), size: [0.3, 0.12, 0.36] as V3 };
  parts.push(
    { joint: `${side}UpperArm`, ...upperArm, color: 'shirt', area: 'upperArms' },
    { joint: `${side}LowerArm`, ...lowerArm, color: 'skin', area: 'forearms' },
    { joint: `${side}Hand`, ...hand, color: 'skin' },
    { joint: `${side}UpperLeg`, ...upperLeg, color: 'pants', area: 'upperLegs' },
    { joint: `${side}LowerLeg`, ...lowerLeg, color: 'pants', area: 'lowerLegs' },
    { joint: `${side}Foot`, ...foot, color: 'shoes', area: 'feet' },
  );
  animation[`${side}UpperArm`] = [`${side}Shoulder`, `${side}Arm`];
  animation[`${side}LowerArm`] = [`${side}ForeArm`];
  animation[`${side}Hand`] = [`${side}Hand`];
  animation[`${side}UpperLeg`] = [`${side}UpLeg`];
  animation[`${side}LowerLeg`] = [`${side}Leg`];
  animation[`${side}Foot`] = [`${side}Foot`];
  fit[`${side}Shoulder`] = {
    joint: `${side}UpperArm`,
    box: { center: at(0.35, 1.27, 0), size: [0.08, 0.3, 0.3] },
  };
  fit[`${side}Arm`] = { joint: `${side}UpperArm`, box: upperArm };
  fit[`${side}ForeArm`] = { joint: `${side}LowerArm`, box: lowerArm };
  fit[`${side}Hand`] = { joint: `${side}Hand`, box: hand };
  fit[`${side}UpLeg`] = { joint: `${side}UpperLeg`, box: upperLeg };
  fit[`${side}Leg`] = { joint: `${side}LowerLeg`, box: lowerLeg };
  fit[`${side}Foot`] = { joint: `${side}Foot`, box: foot };
}

// The head with its hair and face (the neck block sits below, like the Starter body's neck bone).
fit.Head = { joint: 'Head', box: boundingBox(parts.filter((p) => p.joint === 'Head' && p.center[1] > 1.44)) };

export default defineBody({
  id: 'classic',
  name: 'Classic',
  bonePrefix: '',
  joints,
  parts,
  animation,
  fit,
  sketchArm: { start: 0.31, axisY: 1.27, hangX: 0.46, topY: 1.42 },
});
