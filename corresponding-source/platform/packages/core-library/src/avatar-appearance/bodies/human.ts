import type { RigBone } from '../_animation.js';
import { defineBody, type BodyJoint } from '../_body-type.js';
import { HUMAN_BOY_JOINTS, HUMAN_BOY_TRIANGLES } from './_human-joints.js';

/**
 * Our own generated body (CHAR-02, plan docs/superpowers/plans/2026-10-05-own-characters-phased.md): the runtime's
 * human generator builds it from settings (style anime, gender boy for now) out of baked CC0 base data
 * (`/human/human-base.bin`, credits in tooling/human-bake/CREDITS.md). Exactly the 52 standard bones; the joints
 * below are the default anime boy's rest joints, written by tooling/human-bake/bake.ts. Base shorts only: hair,
 * face pictures and clothes come as items later.
 */
const joints: BodyJoint[] = HUMAN_BOY_JOINTS.map(([name, parent, at, bind]) => ({
  name,
  parent,
  at: [...at],
  // The mesh stays in its own A-pose: the arm bones bind turned into it (as the warrior does).
  ...(bind ? { bind } : {}),
}));

/** Every joint that is a standard animation bone plays that bone (fingers stay at rest). */
const animation: Record<string, readonly RigBone[]> = {};
const ANIMATED =
  /^(Hips|Spine|Spine1|Spine2|Neck|Head|(Left|Right)(UpLeg|Leg|Foot|ToeBase|Shoulder|Arm|ForeArm|Hand))$/;
for (const joint of joints) if (ANIMATED.test(joint.name)) animation[joint.name] = [joint.name as RigBone];

export default defineBody({
  id: 'human',
  name: 'Anime body',
  bonePrefix: 'mixamorig',
  joints,
  parts: [],
  animation,
  fit: {},
  sketchArm: { start: 0.2, axisY: 1.4, hangX: 0.2, topY: 1.4 },
  model: '/human/human-base.bin',
  generated: 'human',
  picture: '/market/genvr.core.body.human.png',
  triangles: HUMAN_BOY_TRIANGLES,
});
