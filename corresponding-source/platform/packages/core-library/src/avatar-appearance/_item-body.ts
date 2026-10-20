import { readAvatarLook, type AvatarLook, type GenvrManifest } from '@genvr/contracts';
import type { RigBone } from './_animation.js';
import { isItemBodyId, type AvatarBody, type BodyJoint } from './_body-type.js';

/** Standard bones a body needs for our moves (fingers may be missing). */
const CORE_BONES = [
  'Hips',
  'Spine',
  'Spine1',
  'Spine2',
  'Neck',
  'Head',
  ...['Left', 'Right'].flatMap((side) =>
    ['Shoulder', 'Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot'].map((bone) => `${side}${bone}`),
  ),
];

/** Every joint that is a standard animation bone plays that bone (fingers stay at rest), as the mesh bodies do. */
const ANIMATED =
  /^(Hips|Spine|Spine1|Spine2|Neck|Head|(Left|Right)(UpLeg|Leg|Foot|ToeBase|Shoulder|Arm|ForeArm|Hand))$/;

/**
 * A creator's uploaded body item as an `AvatarBody` (uploaded bodies, plan 2026-10-03, Task 2), built the way the
 * Core mesh bodies are (anime boy): the joints read from the file on upload, the standard bones played 1:1, no block
 * parts and no item fits, the model and picture from the item's package links. The runtime's skeleton, binding and
 * clips take it unchanged. Null for an item that is not a body, a non-creator id, or a rig without the core bones.
 */
export function bodyFromItem(
  manifest: GenvrManifest,
  files: { model: string; picture?: string },
): AvatarBody | null {
  const data = manifest.body;
  if (!data || !isItemBodyId(manifest.id)) return null;
  const names = new Set(data.joints.map((joint) => joint.name));
  if (CORE_BONES.some((bone) => !names.has(bone))) return null;
  const joints: BodyJoint[] = data.joints.map(({ name, parent, at }) => ({ name, parent, at: [...at] }));
  const animation: Record<string, readonly RigBone[]> = {};
  for (const joint of joints) if (ANIMATED.test(joint.name)) animation[joint.name] = [joint.name as RigBone];
  return {
    manifest,
    id: manifest.id,
    bonePrefix: 'mixamorig',
    joints,
    parts: [],
    animation,
    fit: {},
    // Body cards show the picture; the flat sketch numbers only matter for block bodies.
    sketchArm: { start: 0.2, axisY: 1.3, hangX: 0.2, topY: 1.3 },
    model: files.model,
    // Characters people import are real proportions (made by character services or scans).
    proportional: true,
    ...(files.picture ? { picture: files.picture } : {}),
  };
}

/**
 * A player's look with a body they may wear (uploaded bodies, plan Task 4): Genvr's bodies always, a creator's body
 * item only when `allowed` lists it (the join ticket); any other body item becomes Classic. Read leniently, as the room
 * reads every look.
 */
export function keepAllowedBody(look: unknown, allowed: readonly string[]): AvatarLook {
  const read = readAvatarLook(look);
  return isItemBodyId(read.body) && !allowed.includes(read.body) ? { ...read, body: 'classic' } : read;
}
