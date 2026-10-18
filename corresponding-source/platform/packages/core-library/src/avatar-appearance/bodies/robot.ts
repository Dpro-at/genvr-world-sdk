import starter from './starter.js';
import { defineBody, type BodyPart } from '../_body-type.js';

/** Rigid, separated shells on the standard humanoid rig; each shell follows one joint. */
const parts: BodyPart[] = [
  { joint: 'Hips', center: [0, .86, 0], size: [.32, .13, .21], color: 'pants' },
  { joint: 'Spine', center: [0, .96, 0], size: [.22, .06, .17], color: 'pants' },
  { joint: 'Spine1', center: [0, 1.06, 0], size: [.30, .12, .20], color: 'skin', area: 'torso' },
  { joint: 'Spine2', center: [0, 1.23, 0], size: [.38, .18, .22], color: 'skin', area: 'torso' },
  { joint: 'Spine2', center: [0, 1.24, .116], size: [.14, .045, .015], color: 'shirt' },
  { joint: 'Neck', center: [0, 1.395, 0], size: [.10, .075, .10], color: 'pants' },
  { joint: 'Head', center: [0, 1.60, 0], size: [.36, .36, .30], color: 'skin' },
];
for (const side of ['Left', 'Right'] as const) {
  const s = side === 'Left' ? 1 : -1;
  parts.push(
    { joint: `${side}Shoulder`, center: [.17 * s, 1.34, 0], size: [.12, .08, .10], color: 'pants' },
    { joint: `${side}Arm`, center: [.24 * s, 1.34, 0], size: [.075, .09, .09], color: 'shirt' },
    { joint: `${side}Arm`, center: [.35 * s, 1.34, 0], size: [.15, .115, .115], color: 'skin', area: 'upperArms' },
    { joint: `${side}ForeArm`, center: [.46 * s, 1.34, 0], size: [.06, .08, .08], color: 'pants' },
    { joint: `${side}ForeArm`, center: [.56 * s, 1.34, 0], size: [.135, .10, .10], color: 'skin', area: 'forearms' },
    { joint: `${side}Hand`, center: [.675 * s, 1.34, 0], size: [.065, .075, .09], color: 'shirt' },
    { joint: `${side}UpLeg`, center: [.12 * s, .82, 0], size: [.09, .08, .09], color: 'shirt' },
    { joint: `${side}UpLeg`, center: [.12 * s, .64, 0], size: [.16, .29, .17], color: 'skin', area: 'upperLegs' },
    { joint: `${side}Leg`, center: [.12 * s, .44, 0], size: [.10, .09, .10], color: 'pants' },
    { joint: `${side}Leg`, center: [.12 * s, .27, 0], size: [.135, .25, .14], color: 'skin', area: 'lowerLegs' },
    { joint: `${side}Foot`, center: [.12 * s, .09, 0], size: [.085, .06, .085], color: 'pants' },
    { joint: `${side}Foot`, center: [.12 * s, .045, .045], size: [.17, .09, .27], color: 'shoes', area: 'feet' },
  );
  for (const joint of starter.joints.filter(joint => joint.name.startsWith(`${side}Hand`) && /[123]$/.test(joint.name))) {
    parts.push({ joint: joint.name, center: [joint.at[0] + .008 * s, joint.at[1], joint.at[2]], size: [.018, .022, .016], color: 'skin' });
  }
}
export default defineBody({
  id: 'robot', name: 'Standard robot', bonePrefix: 'genvr',
  joints: starter.joints, parts, animation: starter.animation, fit: {}, sketchArm: starter.sketchArm,
});
