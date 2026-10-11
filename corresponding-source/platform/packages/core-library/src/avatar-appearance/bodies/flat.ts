import type { RigBone, V3 } from '../_animation.js';
import { boundingBox, defineBody, type BodyJoint, type BodyPart, type FitTarget } from '../_body-type.js';

/**
 * The 2D body (decision 93, task P2-23): a flat character for side-view places, seen in profile.
 * It is thin across (x) and faces +z like every body, with a nose and feet that point forward;
 * its arms hang at rest, and its joints turn only in its own plane, so it moves like a drawn
 * character. Clothing made for the Starter body is laid flat onto it (arms turned to hang).
 * About 1.9 m tall with hair.
 */

const joints: BodyJoint[] = [
  { name: 'Hips', parent: null, at: [0, 0.85, 0] },
  { name: 'Chest', parent: 'Hips', at: [0, 1, 0] },
  { name: 'Head', parent: 'Chest', at: [0, 1.42, 0] },
];
const parts: BodyPart[] = [
  { joint: 'Hips', size: [0.12, 0.2, 0.3], center: [0, 0.9, 0], color: 'pants' },
  { joint: 'Chest', size: [0.12, 0.42, 0.32], center: [0, 1.21, 0], color: 'shirt', area: 'torso' },
  { joint: 'Head', size: [0.08, 0.05, 0.12], center: [0, 1.44, 0], color: 'skin' },
  { joint: 'Head', size: [0.13, 0.4, 0.4], center: [0, 1.66, 0.01], color: 'skin' },
  // The nose makes the profile.
  { joint: 'Head', size: [0.06, 0.07, 0.05], center: [0, 1.63, 0.235], color: 'skin' },
  // Hair cap and back of the head.
  { joint: 'Head', size: [0.14, 0.09, 0.42], center: [0, 1.85, -0.01], color: 'hair' },
  { joint: 'Head', size: [0.14, 0.3, 0.1], center: [0, 1.7, -0.19], color: 'hair' },
  // Eye and mouth go through the head, so both sides show them.
  { joint: 'Head', size: [0.15, 0.08, 0.05], center: [0, 1.71, 0.15], color: 'eyes' },
  { joint: 'Head', size: [0.15, 0.03, 0.06], center: [0, 1.55, 0.18], color: 'mouth' },
];

const animation: Record<string, readonly RigBone[]> = {
  Hips: ['Hips'],
  Chest: ['Spine', 'Spine1', 'Spine2'],
  Head: ['Neck', 'Head'],
};

/** Where Starter blocks (and the clothes on them) sit on this body. */
const fit: Partial<Record<RigBone, FitTarget>> = {
  Hips: { joint: 'Hips', box: { center: [0, 0.9, 0], size: [0.12, 0.2, 0.3] } },
  Spine1: { joint: 'Chest', box: { center: [0, 1.095, 0], size: [0.12, 0.19, 0.32] } },
  Spine2: { joint: 'Chest', box: { center: [0, 1.305, 0], size: [0.12, 0.23, 0.32] } },
  Neck: { joint: 'Chest', box: { center: [0, 1.44, 0], size: [0.08, 0.05, 0.12] } },
};

for (const side of ['Left', 'Right'] as const) {
  const s = side === 'Left' ? 1 : -1;
  const at = (x: number, y: number, z: number): V3 => [x * s, y, z];
  joints.push(
    { name: `${side}UpperArm`, parent: 'Chest', at: at(0.085, 1.38, 0) },
    { name: `${side}LowerArm`, parent: `${side}UpperArm`, at: at(0.085, 1.11, 0) },
    { name: `${side}Hand`, parent: `${side}LowerArm`, at: at(0.085, 0.85, 0) },
    { name: `${side}UpperLeg`, parent: 'Hips', at: at(0.03, 0.81, 0) },
    { name: `${side}LowerLeg`, parent: `${side}UpperLeg`, at: at(0.03, 0.44, 0) },
    { name: `${side}Foot`, parent: `${side}LowerLeg`, at: at(0.03, 0.1, 0) },
  );
  // Arms hang at rest, beside the body (outside it across, so each side shows its own arm).
  const shoulder = { center: at(0.085, 1.37, 0), size: [0.04, 0.06, 0.1] as V3 };
  const upperArm = { center: at(0.085, 1.25, 0), size: [0.04, 0.28, 0.1] as V3 };
  const lowerArm = { center: at(0.085, 0.98, 0), size: [0.04, 0.26, 0.09] as V3 };
  const hand = { center: at(0.085, 0.8, 0.01), size: [0.045, 0.1, 0.1] as V3 };
  const upperLeg = { center: at(0.03, 0.62, 0), size: [0.05, 0.38, 0.14] as V3 };
  const lowerLeg = { center: at(0.03, 0.27, 0), size: [0.05, 0.34, 0.13] as V3 };
  const foot = { center: at(0.03, 0.05, 0.05), size: [0.055, 0.1, 0.24] as V3 };
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
  // T-pose arm items: their length (Starter x, outward) runs down the hanging arm.
  const hanging = [2, side === 'Left' ? -1 : 1, 3] as const;
  fit[`${side}Shoulder`] = { joint: `${side}UpperArm`, box: shoulder, axes: hanging };
  fit[`${side}Arm`] = { joint: `${side}UpperArm`, box: upperArm, axes: hanging };
  fit[`${side}ForeArm`] = { joint: `${side}LowerArm`, box: lowerArm, axes: hanging };
  fit[`${side}Hand`] = { joint: `${side}Hand`, box: hand, axes: hanging };
  fit[`${side}UpLeg`] = { joint: `${side}UpperLeg`, box: upperLeg };
  fit[`${side}Leg`] = { joint: `${side}LowerLeg`, box: lowerLeg };
  fit[`${side}Foot`] = { joint: `${side}Foot`, box: foot };
}

// The head with its hair and face (the neck block sits below, like the Starter body's neck bone).
fit.Head = { joint: 'Head', box: boundingBox(parts.filter((p) => p.joint === 'Head' && p.center[1] > 1.46)) };

export default defineBody({
  id: 'flat',
  name: '2D',
  bonePrefix: '',
  joints,
  parts,
  animation,
  fit,
  flat: true,
  // Flat bodies are drawn in profile with their arms already hanging (no T-pose to turn).
  sketchArm: { start: 0.085, axisY: 1.25, hangX: 0.085, topY: 1.4 },
});
