import type { RigBone, V3 } from '../_animation.js';
import { defineBody, type BodyJoint, type BodyPart } from '../_body-type.js';

/**
 * The Starter body (tasks P2-05, P2-20; decision 73): the first blocky test avatar on the
 * standard 52-bone humanoid rig (Mixamo names, the same bones as the agent_player pipeline), about
 * 1.8 m tall. Clothing and accessories are made for this body; other bodies fit them.
 */

const joints: BodyJoint[] = [];
const set = (name: string, parent: string | null, at: V3) => joints.push({ name, parent, at });
set('Hips', null, [0, 0.84, 0]);
for (const side of ['Left', 'Right'] as const) {
  const s = side === 'Left' ? 1 : -1;
  set(`${side}UpLeg`, 'Hips', [0.12 * s, 0.84, 0]);
  set(`${side}Leg`, `${side}UpLeg`, [0.12 * s, 0.44, 0]);
  set(`${side}Foot`, `${side}Leg`, [0.12 * s, 0.1, 0]);
  set(`${side}ToeBase`, `${side}Foot`, [0.12 * s, 0.03, 0.12]);
}
set('Spine', 'Hips', [0, 0.92, 0]);
set('Spine1', 'Spine', [0, 1.06, 0]);
set('Spine2', 'Spine1', [0, 1.2, 0]);
const arm = (side: 'Left' | 'Right') => {
  const s = side === 'Left' ? 1 : -1;
  set(`${side}Shoulder`, 'Spine2', [0.06 * s, 1.34, 0]);
  set(`${side}Arm`, `${side}Shoulder`, [0.24 * s, 1.34, 0]);
  set(`${side}ForeArm`, `${side}Arm`, [0.46 * s, 1.34, 0]);
  set(`${side}Hand`, `${side}ForeArm`, [0.66 * s, 1.34, 0]);
  for (const [finger, z] of [
    ['Index', 0.03],
    ['Middle', 0.01],
    ['Pinky', -0.03],
    ['Ring', -0.01],
  ] as const) {
    set(`${side}Hand${finger}1`, `${side}Hand`, [0.72 * s, 1.34, z]);
    set(`${side}Hand${finger}2`, `${side}Hand${finger}1`, [0.745 * s, 1.34, z]);
    set(`${side}Hand${finger}3`, `${side}Hand${finger}2`, [0.765 * s, 1.34, z]);
  }
  set(`${side}HandThumb1`, `${side}Hand`, [0.68 * s, 1.32, 0.05]);
  set(`${side}HandThumb2`, `${side}HandThumb1`, [0.7 * s, 1.32, 0.07]);
  set(`${side}HandThumb3`, `${side}HandThumb2`, [0.72 * s, 1.32, 0.08]);
};
arm('Left');
set('Neck', 'Spine2', [0, 1.38, 0]);
set('Head', 'Neck', [0, 1.42, 0]);
arm('Right');

const parts: BodyPart[] = [
  { joint: 'Hips', size: [0.46, 0.2, 0.27], center: [0, 0.9, 0], color: 'pants' },
  { joint: 'Spine1', size: [0.47, 0.2, 0.27], center: [0, 1.06, 0], color: 'shirt', area: 'torso' },
  { joint: 'Spine2', size: [0.5, 0.24, 0.29], center: [0, 1.26, 0], color: 'shirt', area: 'torso' },
  { joint: 'Neck', size: [0.14, 0.06, 0.14], center: [0, 1.4, 0], color: 'skin' },
  { joint: 'Head', size: [0.38, 0.36, 0.36], center: [0, 1.6, 0], color: 'skin' },
  // Hair cap and back of the head.
  { joint: 'Head', size: [0.4, 0.09, 0.38], center: [0, 1.79, -0.005], color: 'hair' },
  { joint: 'Head', size: [0.4, 0.26, 0.08], center: [0, 1.66, -0.155], color: 'hair' },
  // Face (on the front, +z).
  { joint: 'Head', size: [0.06, 0.07, 0.02], center: [0.08, 1.63, 0.18], color: 'eyes' },
  { joint: 'Head', size: [0.06, 0.07, 0.02], center: [-0.08, 1.63, 0.18], color: 'eyes' },
  { joint: 'Head', size: [0.14, 0.03, 0.02], center: [0, 1.52, 0.18], color: 'mouth' },
];
for (const side of ['Left', 'Right'] as const) {
  const s = side === 'Left' ? 1 : -1;
  const at = (x: number, y: number, z: number): V3 => [x * s, y, z];
  parts.push(
    {
      joint: `${side}Shoulder`,
      size: [0.1, 0.18, 0.22],
      center: at(0.2, 1.3, 0),
      color: 'shirt',
      area: 'upperArms',
    },
    {
      joint: `${side}Arm`,
      size: [0.23, 0.15, 0.15],
      center: at(0.35, 1.34, 0),
      color: 'shirt',
      area: 'upperArms',
    },
    {
      joint: `${side}ForeArm`,
      size: [0.2, 0.13, 0.13],
      center: at(0.56, 1.34, 0),
      color: 'skin',
      area: 'forearms',
    },
    { joint: `${side}Hand`, size: [0.11, 0.13, 0.11], center: at(0.715, 1.34, 0), color: 'skin' },
    {
      joint: `${side}UpLeg`,
      size: [0.19, 0.42, 0.21],
      center: at(0.12, 0.64, 0),
      color: 'pants',
      area: 'upperLegs',
    },
    {
      joint: `${side}Leg`,
      size: [0.17, 0.36, 0.19],
      center: at(0.12, 0.27, 0),
      color: 'pants',
      area: 'lowerLegs',
    },
    {
      joint: `${side}Foot`,
      size: [0.19, 0.1, 0.3],
      center: at(0.12, 0.05, 0.04),
      color: 'shoes',
      area: 'feet',
    },
  );
}

/** Every joint that is a standard animation bone plays that bone (fingers stay at rest). */
const animation: Record<string, readonly RigBone[]> = {};
const ANIMATED =
  /^(Hips|Spine|Spine1|Spine2|Neck|Head|(Left|Right)(UpLeg|Leg|Foot|ToeBase|Shoulder|Arm|ForeArm|Hand))$/;
for (const joint of joints) if (ANIMATED.test(joint.name)) animation[joint.name] = [joint.name as RigBone];

export default defineBody({
  id: 'starter',
  name: 'Starter',
  bonePrefix: 'mixamorig',
  joints,
  parts,
  animation,
  fit: {},
  sketchArm: { start: 0.235, axisY: 1.34, hangX: 0.32, topY: 1.36 },
});
