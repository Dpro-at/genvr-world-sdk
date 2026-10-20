import type { RigBone } from '../_animation.js';
import { defineBody, type BodyJoint } from '../_body-type.js';

/**
 * The man in the blue shirt (owner, 2026-10-20: a base character for now): a Ready Player Me demo character modified
 * locally (hair, shirt and shoe colours; see apps/web/public/bodies/CREDITS.md), turned into our T-pose with
 * world-aligned joints by the character import (studio/user-avatar-import.ts canonicalCharacter), 1.80 m, with its 52
 * face shapes (ARKit names: expressions and the speaking mouth). The model is served from the web app at
 * `/bodies/rpm-male.glb`; the joints below are its rest positions (meters, facing +z, left +x).
 */
const JOINTS: ReadonlyArray<[string, string | null, [number, number, number]]> = [
  ['Hips', null, [0, 0.97874, -0.03878]],
  ['LeftUpLeg', 'Hips', [0.09163, 0.98383, -0.04178]],
  ['LeftLeg', 'LeftUpLeg', [0.12061, 0.54451, -0.04754]],
  ['LeftFoot', 'LeftLeg', [0.14622, 0.1207, -0.08861]],
  ['LeftToeBase', 'LeftFoot', [0.14864, 0.0396, 0.0292]],
  ['LeftToe_End', 'LeftToeBase', [0.15164, 0.03404, 0.1242]],
  ['RightUpLeg', 'Hips', [-0.09163, 0.98383, -0.04178]],
  ['RightLeg', 'RightUpLeg', [-0.12061, 0.5445, -0.04754]],
  ['RightFoot', 'RightLeg', [-0.14622, 0.1207, -0.08861]],
  ['RightToeBase', 'RightFoot', [-0.14864, 0.0396, 0.0292]],
  ['RightToe_End', 'RightToeBase', [-0.15164, 0.03404, 0.1242]],
  ['Spine', 'Hips', [0, 1.07333, -0.0357]],
  ['Spine1', 'Spine', [0, 1.19805, -0.04885]],
  ['Spine2', 'Spine1', [0, 1.31343, -0.06859]],
  ['LeftShoulder', 'Spine2', [0.0453, 1.44825, -0.08474]],
  ['LeftArm', 'LeftShoulder', [0.15947, 1.44365, -0.08538]],
  ['LeftForeArm', 'LeftArm', [0.43332, 1.44365, -0.09499]],
  ['LeftHand', 'LeftForeArm', [0.67532, 1.44365, -0.10348]],
  ['LeftHandIndex1', 'LeftHand', [0.77127, 1.43672, -0.07672]],
  ['LeftHandIndex2', 'LeftHandIndex1', [0.81247, 1.42476, -0.07491]],
  ['LeftHandIndex3', 'LeftHandIndex2', [0.8366, 1.41234, -0.07259]],
  ['LeftHandIndex4', 'LeftHandIndex3', [0.86255, 1.3928, -0.07105]],
  ['LeftHandMiddle1', 'LeftHand', [0.77185, 1.43714, -0.1022]],
  ['LeftHandMiddle2', 'LeftHandMiddle1', [0.81508, 1.42982, -0.10476]],
  ['LeftHandMiddle3', 'LeftHandMiddle2', [0.84609, 1.41585, -0.10377]],
  ['LeftHandMiddle4', 'LeftHandMiddle3', [0.86841, 1.3913, -0.10524]],
  ['LeftHandPinky1', 'LeftHand', [0.75745, 1.43202, -0.14916]],
  ['LeftHandPinky2', 'LeftHandPinky1', [0.78137, 1.42529, -0.15985]],
  ['LeftHandPinky3', 'LeftHandPinky2', [0.79994, 1.41553, -0.16459]],
  ['LeftHandPinky4', 'LeftHandPinky3', [0.81954, 1.39963, -0.16636]],
  ['LeftHandRing1', 'LeftHand', [0.76531, 1.43583, -0.12597]],
  ['LeftHandRing2', 'LeftHandRing1', [0.80386, 1.42774, -0.13434]],
  ['LeftHandRing3', 'LeftHandRing2', [0.83269, 1.40869, -0.13805]],
  ['LeftHandRing4', 'LeftHandRing3', [0.85519, 1.39116, -0.14083]],
  ['LeftHandThumb1', 'LeftHand', [0.70208, 1.43167, -0.07567]],
  ['LeftHandThumb2', 'LeftHandThumb1', [0.72661, 1.41352, -0.05016]],
  ['LeftHandThumb3', 'LeftHandThumb2', [0.75007, 1.39678, -0.04489]],
  ['LeftHandThumb4', 'LeftHandThumb3', [0.77772, 1.37714, -0.04455]],
  ['Neck', 'Spine2', [-0, 1.46253, -0.07978]],
  ['Head', 'Neck', [-0, 1.57387, -0.04114]],
  ['HeadTop_End', 'Head', [-0, 1.79113, -0.0037]],
  ['LeftEye', 'Head', [0.02917, 1.65771, 0.03866]],
  ['RightEye', 'Head', [-0.02872, 1.65767, 0.03866]],
  ['RightShoulder', 'Spine2', [-0.0453, 1.44825, -0.08474]],
  ['RightArm', 'RightShoulder', [-0.15947, 1.44365, -0.08538]],
  ['RightForeArm', 'RightArm', [-0.43332, 1.44365, -0.09499]],
  ['RightHand', 'RightForeArm', [-0.67532, 1.44365, -0.10348]],
  ['RightHandIndex1', 'RightHand', [-0.77127, 1.43672, -0.07672]],
  ['RightHandIndex2', 'RightHandIndex1', [-0.81247, 1.42476, -0.07492]],
  ['RightHandIndex3', 'RightHandIndex2', [-0.8366, 1.41234, -0.07259]],
  ['RightHandIndex4', 'RightHandIndex3', [-0.86255, 1.3928, -0.07106]],
  ['RightHandMiddle1', 'RightHand', [-0.77185, 1.43714, -0.1022]],
  ['RightHandMiddle2', 'RightHandMiddle1', [-0.81508, 1.42982, -0.10476]],
  ['RightHandMiddle3', 'RightHandMiddle2', [-0.84609, 1.41585, -0.10377]],
  ['RightHandMiddle4', 'RightHandMiddle3', [-0.86841, 1.3913, -0.10524]],
  ['RightHandPinky1', 'RightHand', [-0.75745, 1.43202, -0.14916]],
  ['RightHandPinky2', 'RightHandPinky1', [-0.78137, 1.42529, -0.15985]],
  ['RightHandPinky3', 'RightHandPinky2', [-0.79994, 1.41553, -0.16459]],
  ['RightHandPinky4', 'RightHandPinky3', [-0.81954, 1.39963, -0.16636]],
  ['RightHandRing1', 'RightHand', [-0.76531, 1.43583, -0.12597]],
  ['RightHandRing2', 'RightHandRing1', [-0.80386, 1.42774, -0.13434]],
  ['RightHandRing3', 'RightHandRing2', [-0.83269, 1.40869, -0.13805]],
  ['RightHandRing4', 'RightHandRing3', [-0.85519, 1.39117, -0.14083]],
  ['RightHandThumb1', 'RightHand', [-0.70208, 1.43167, -0.07567]],
  ['RightHandThumb2', 'RightHandThumb1', [-0.72661, 1.41352, -0.05016]],
  ['RightHandThumb3', 'RightHandThumb2', [-0.75007, 1.39678, -0.04489]],
  ['RightHandThumb4', 'RightHandThumb3', [-0.77771, 1.37715, -0.04455]],
];

const joints: BodyJoint[] = JOINTS.map(([name, parent, at]) => ({ name, parent, at }));

/** Every joint that is a standard animation bone plays that bone (fingers stay at rest). */
const animation: Record<string, readonly RigBone[]> = {};
const ANIMATED =
  /^(Hips|Spine|Spine1|Spine2|Neck|Head|(Left|Right)(UpLeg|Leg|Foot|ToeBase|Shoulder|Arm|ForeArm|Hand))$/;
for (const joint of joints) if (ANIMATED.test(joint.name)) animation[joint.name] = [joint.name as RigBone];

export default defineBody({
  id: 'rpm-male',
  name: 'Man (blue shirt)',
  bonePrefix: 'mixamorig',
  joints,
  parts: [],
  animation,
  fit: {},
  sketchArm: { start: 0.2, axisY: 1.44, hangX: 0.2, topY: 1.44 },
  proportional: true,
  model: '/bodies/rpm-male.glb',
  picture: '/bodies/rpm-male.png',
  triangles: 13369,
});
