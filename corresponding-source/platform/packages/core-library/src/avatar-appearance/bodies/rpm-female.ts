import type { RigBone } from '../_animation.js';
import { defineBody, type BodyJoint } from '../_body-type.js';

/**
 * The woman (owner, 2026-10-20: a base character for now): a Ready Player Me demo character (see
 * apps/web/public/bodies/CREDITS.md), turned into our T-pose with world-aligned joints by the character import
 * (studio/user-avatar-import.ts canonicalCharacter), 1.80 m, with its 52 face shapes (ARKit names: expressions and the
 * speaking mouth). The model is served from the web app at `/bodies/rpm-female.glb`; the joints below are its rest
 * positions (meters, facing +z, left +x).
 */
const JOINTS: ReadonlyArray<[string, string | null, [number, number, number]]> = [
  ['Hips', null, [0.00001, 0.98432, 0.00335]],
  ['Spine', 'Hips', [0.00001, 1.07826, 0.0064]],
  ['Spine1', 'Spine', [0.00001, 1.20214, -0.00666]],
  ['Spine2', 'Spine1', [0.00001, 1.31674, -0.02626]],
  ['Neck', 'Spine2', [0.00001, 1.46482, -0.03738]],
  ['Head', 'Neck', [0.00001, 1.57541, 0.001]],
  ['HeadTop_End', 'Head', [0.00001, 1.79119, 0.03818]],
  ['LeftEye', 'Head', [0.02898, 1.65868, 0.08026]],
  ['RightEye', 'Head', [-0.02852, 1.65863, 0.08026]],
  ['LeftShoulder', 'Spine2', [0.045, 1.45064, -0.0423]],
  ['LeftArm', 'LeftShoulder', [0.15839, 1.44607, -0.04293]],
  ['LeftForeArm', 'LeftArm', [0.43038, 1.44607, -0.05248]],
  ['LeftHand', 'LeftForeArm', [0.67074, 1.44607, -0.06091]],
  ['LeftHandThumb1', 'LeftHand', [0.69732, 1.43418, -0.03329]],
  ['LeftHandThumb2', 'LeftHandThumb1', [0.72168, 1.41614, -0.00796]],
  ['LeftHandThumb3', 'LeftHandThumb2', [0.74498, 1.39952, -0.00272]],
  ['LeftHandThumb4', 'LeftHandThumb3', [0.77244, 1.38002, -0.00238]],
  ['LeftHandIndex1', 'LeftHand', [0.76604, 1.43918, -0.03434]],
  ['LeftHandIndex2', 'LeftHandIndex1', [0.80695, 1.42731, -0.03254]],
  ['LeftHandIndex3', 'LeftHandIndex2', [0.83093, 1.41498, -0.03023]],
  ['LeftHandIndex4', 'LeftHandIndex3', [0.8567, 1.39556, -0.02871]],
  ['LeftHandMiddle1', 'LeftHand', [0.76661, 1.43961, -0.05964]],
  ['LeftHandMiddle2', 'LeftHandMiddle1', [0.80955, 1.43234, -0.06218]],
  ['LeftHandMiddle3', 'LeftHandMiddle2', [0.84034, 1.41846, -0.0612]],
  ['LeftHandMiddle4', 'LeftHandMiddle3', [0.86252, 1.39407, -0.06266]],
  ['LeftHandRing1', 'LeftHand', [0.76012, 1.4383, -0.08325]],
  ['LeftHandRing2', 'LeftHandRing1', [0.79841, 1.43027, -0.09156]],
  ['LeftHandRing3', 'LeftHandRing2', [0.82704, 1.41135, -0.09525]],
  ['LeftHandRing4', 'LeftHandRing3', [0.84938, 1.39394, -0.09801]],
  ['LeftHandPinky1', 'LeftHand', [0.75231, 1.43452, -0.10628]],
  ['LeftHandPinky2', 'LeftHandPinky1', [0.77607, 1.42784, -0.1169]],
  ['LeftHandPinky3', 'LeftHandPinky2', [0.79451, 1.41814, -0.1216]],
  ['LeftHandPinky4', 'LeftHandPinky3', [0.81398, 1.40235, -0.12337]],
  ['RightShoulder', 'Spine2', [-0.04498, 1.45064, -0.0423]],
  ['RightArm', 'RightShoulder', [-0.15838, 1.44607, -0.04294]],
  ['RightForeArm', 'RightArm', [-0.43037, 1.44607, -0.05248]],
  ['RightHand', 'RightForeArm', [-0.67073, 1.44607, -0.06091]],
  ['RightHandThumb1', 'RightHand', [-0.69731, 1.43418, -0.03329]],
  ['RightHandThumb2', 'RightHandThumb1', [-0.72167, 1.41614, -0.00796]],
  ['RightHandThumb3', 'RightHandThumb2', [-0.74497, 1.39952, -0.00272]],
  ['RightHandThumb4', 'RightHandThumb3', [-0.77243, 1.38002, -0.00238]],
  ['RightHandIndex1', 'RightHand', [-0.76602, 1.43918, -0.03434]],
  ['RightHandIndex2', 'RightHandIndex1', [-0.80694, 1.42731, -0.03254]],
  ['RightHandIndex3', 'RightHandIndex2', [-0.83091, 1.41498, -0.03024]],
  ['RightHandIndex4', 'RightHandIndex3', [-0.85668, 1.39557, -0.02871]],
  ['RightHandMiddle1', 'RightHand', [-0.7666, 1.43961, -0.05964]],
  ['RightHandMiddle2', 'RightHandMiddle1', [-0.80953, 1.43234, -0.06219]],
  ['RightHandMiddle3', 'RightHandMiddle2', [-0.84033, 1.41846, -0.0612]],
  ['RightHandMiddle4', 'RightHandMiddle3', [-0.8625, 1.39408, -0.06266]],
  ['RightHandRing1', 'RightHand', [-0.76011, 1.4383, -0.08325]],
  ['RightHandRing2', 'RightHandRing1', [-0.7984, 1.43027, -0.09157]],
  ['RightHandRing3', 'RightHandRing2', [-0.82703, 1.41135, -0.09525]],
  ['RightHandRing4', 'RightHandRing3', [-0.84937, 1.39394, -0.09801]],
  ['RightHandPinky1', 'RightHand', [-0.7523, 1.43452, -0.10628]],
  ['RightHandPinky2', 'RightHandPinky1', [-0.77606, 1.42784, -0.1169]],
  ['RightHandPinky3', 'RightHandPinky2', [-0.7945, 1.41814, -0.12161]],
  ['RightHandPinky4', 'RightHandPinky3', [-0.81396, 1.40235, -0.12337]],
  ['LeftUpLeg', 'Hips', [0.09101, 0.98938, 0.00037]],
  ['LeftLeg', 'LeftUpLeg', [0.11979, 0.55303, -0.00535]],
  ['LeftFoot', 'LeftLeg', [0.14523, 0.13211, -0.04615]],
  ['LeftToeBase', 'LeftFoot', [0.14764, 0.05156, 0.07086]],
  ['LeftToe_End', 'LeftToeBase', [0.15061, 0.04603, 0.16522]],
  ['RightUpLeg', 'Hips', [-0.091, 0.98938, 0.00037]],
  ['RightLeg', 'RightUpLeg', [-0.11978, 0.55303, -0.00535]],
  ['RightFoot', 'RightLeg', [-0.14522, 0.1321, -0.04615]],
  ['RightToeBase', 'RightFoot', [-0.14763, 0.05156, 0.07086]],
  ['RightToe_End', 'RightToeBase', [-0.1506, 0.04603, 0.16522]],
];

const joints: BodyJoint[] = JOINTS.map(([name, parent, at]) => ({ name, parent, at }));

/** Every joint that is a standard animation bone plays that bone (fingers stay at rest). */
const animation: Record<string, readonly RigBone[]> = {};
const ANIMATED =
  /^(Hips|Spine|Spine1|Spine2|Neck|Head|(Left|Right)(UpLeg|Leg|Foot|ToeBase|Shoulder|Arm|ForeArm|Hand))$/;
for (const joint of joints) if (ANIMATED.test(joint.name)) animation[joint.name] = [joint.name as RigBone];

export default defineBody({
  id: 'rpm-female',
  name: 'Woman',
  bonePrefix: 'mixamorig',
  joints,
  parts: [],
  animation,
  fit: {},
  sketchArm: { start: 0.2, axisY: 1.44, hangX: 0.2, topY: 1.44 },
  proportional: true,
  model: '/bodies/rpm-female.glb',
  picture: '/bodies/rpm-female.png',
  triangles: 21753,
});
