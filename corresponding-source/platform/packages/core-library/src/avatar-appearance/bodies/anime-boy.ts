import type { RigBone } from '../_animation.js';
import { defineBody, type BodyJoint } from '../_body-type.js';

/**
 * The anime boy (task P2-35, decision 111): the first mesh body. A 3D model made with Higgsfield
 * (Tripo multiview) from the owner's ChatGPT concept sheet (docs/reference/anime-body/concept),
 * reduced to 15,000 triangles, rigged with our 52 Mixamo bones and turned into a T-pose in Blender
 * (tooling/avatar-bodies/boy/v3_*.py). About 1.60 m. The model is served from the web app at
 * `/bodies/anime-boy.glb`; the joints below are its rest positions (meters, facing +z, left +x),
 * written by tooling/avatar-bodies/boy/v3_export.py.
 */
const JOINTS: ReadonlyArray<[string, string | null, [number, number, number]]> = [
  ['Hips', null, [0.0, 0.64107, -0.00551]],
  ['Spine', 'Hips', [0.0, 0.74023, -0.00551]],
  ['Spine1', 'Spine', [0.0, 0.91873, -0.00551]],
  ['Spine2', 'Spine1', [0.0, 1.09061, -0.00551]],
  ['Neck', 'Spine2', [0.0, 1.30216, 0.01536]],
  ['Head', 'Neck', [0.0, 1.34716, 0.01536]],
  ['LeftShoulder', 'Spine2', [0.04, 1.27016, -0.00551]],
  ['LeftArm', 'LeftShoulder', [0.16292, 1.26016, -0.00551]],
  ['LeftForeArm', 'LeftArm', [0.37525, 1.26016, -0.00551]],
  ['LeftHand', 'LeftForeArm', [0.57125, 1.26016, -0.00551]],
  ['LeftHandIndex1', 'LeftHand', [0.64368, 1.2605, 0.00648]],
  ['LeftHandIndex2', 'LeftHandIndex1', [0.66928, 1.2605, 0.00648]],
  ['LeftHandIndex3', 'LeftHandIndex2', [0.69488, 1.2605, 0.00648]],
  ['LeftHandMiddle1', 'LeftHand', [0.6434, 1.26027, -0.00151]],
  ['LeftHandMiddle2', 'LeftHandMiddle1', [0.669, 1.26027, -0.00151]],
  ['LeftHandMiddle3', 'LeftHandMiddle2', [0.69461, 1.26027, -0.00151]],
  ['LeftHandRing1', 'LeftHand', [0.64312, 1.26005, -0.0095]],
  ['LeftHandRing2', 'LeftHandRing1', [0.66872, 1.26005, -0.0095]],
  ['LeftHandRing3', 'LeftHandRing2', [0.69433, 1.26005, -0.0095]],
  ['LeftHandPinky1', 'LeftHand', [0.64284, 1.25982, -0.01749]],
  ['LeftHandPinky2', 'LeftHandPinky1', [0.66845, 1.25982, -0.01749]],
  ['LeftHandPinky3', 'LeftHandPinky2', [0.69405, 1.25982, -0.01749]],
  ['LeftHandThumb1', 'LeftHand', [0.59115, 1.26073, 0.01447]],
  ['LeftHandThumb2', 'LeftHandThumb1', [0.60479, 1.26117, 0.03017]],
  ['LeftHandThumb3', 'LeftHandThumb2', [0.61843, 1.26161, 0.04587]],
  ['RightShoulder', 'Spine2', [-0.04, 1.27016, -0.00551]],
  ['RightArm', 'RightShoulder', [-0.16217, 1.26016, -0.00551]],
  ['RightForeArm', 'RightArm', [-0.37445, 1.26016, -0.00551]],
  ['RightHand', 'RightForeArm', [-0.5704, 1.26016, -0.00551]],
  ['RightHandIndex1', 'RightHand', [-0.64279, 1.26047, 0.00648]],
  ['RightHandIndex2', 'RightHandIndex1', [-0.66839, 1.26047, 0.00648]],
  ['RightHandIndex3', 'RightHandIndex2', [-0.694, 1.26047, 0.00648]],
  ['RightHandMiddle1', 'RightHand', [-0.64254, 1.26026, -0.00151]],
  ['RightHandMiddle2', 'RightHandMiddle1', [-0.66814, 1.26026, -0.00151]],
  ['RightHandMiddle3', 'RightHandMiddle2', [-0.69374, 1.26026, -0.00151]],
  ['RightHandRing1', 'RightHand', [-0.64229, 1.26006, -0.0095]],
  ['RightHandRing2', 'RightHandRing1', [-0.66789, 1.26006, -0.0095]],
  ['RightHandRing3', 'RightHandRing2', [-0.69349, 1.26006, -0.0095]],
  ['RightHandPinky1', 'RightHand', [-0.64203, 1.25985, -0.0175]],
  ['RightHandPinky2', 'RightHandPinky1', [-0.66764, 1.25985, -0.0175]],
  ['RightHandPinky3', 'RightHandPinky2', [-0.69324, 1.25985, -0.0175]],
  ['RightHandThumb1', 'RightHand', [-0.59024, 1.26067, 0.01448]],
  ['RightHandThumb2', 'RightHandThumb1', [-0.60385, 1.26107, 0.0302]],
  ['RightHandThumb3', 'RightHandThumb2', [-0.61746, 1.26148, 0.04593]],
  ['LeftUpLeg', 'Hips', [0.08567, 0.62107, -0.00551]],
  ['LeftLeg', 'LeftUpLeg', [0.10424, 0.35227, -0.04184]],
  ['LeftFoot', 'LeftLeg', [0.08567, 0.08392, -0.00551]],
  ['LeftToeBase', 'LeftFoot', [0.0799, 0.02634, 0.12003]],
  ['RightUpLeg', 'Hips', [-0.09159, 0.62107, -0.00551]],
  ['RightLeg', 'RightUpLeg', [-0.11603, 0.35152, -0.03719]],
  ['RightFoot', 'RightLeg', [-0.09159, 0.08343, -0.00551]],
  ['RightToeBase', 'RightFoot', [-0.08614, 0.02802, 0.12571]],
];

const joints: BodyJoint[] = JOINTS.map(([name, parent, at]) => ({ name, parent, at }));

/** Every joint that is a standard animation bone plays that bone (fingers stay at rest). */
const animation: Record<string, readonly RigBone[]> = {};
const ANIMATED =
  /^(Hips|Spine|Spine1|Spine2|Neck|Head|(Left|Right)(UpLeg|Leg|Foot|ToeBase|Shoulder|Arm|ForeArm|Hand))$/;
for (const joint of joints) if (ANIMATED.test(joint.name)) animation[joint.name] = [joint.name as RigBone];

export default defineBody({
  id: 'anime-boy',
  name: 'Anime boy',
  bonePrefix: 'mixamorig',
  joints,
  parts: [],
  animation,
  fit: {},
  sketchArm: { start: 0.2, axisY: 1.3, hangX: 0.2, topY: 1.3 },
  model: '/bodies/anime-boy.glb',
  picture: '/bodies/anime-boy.webp',
  triangles: 15000,
});
