import { findBody } from '@genvr/core-library';
import { chunks, GlbError, inspectGlb } from './glb.js';

/** One bone of the standard rig as read from a file: world rest position in meters (facing +z, left +x). */
export interface RigJoint {
  name: string;
  parent: string | null;
  at: [number, number, number];
}

export type RigReading =
  | {
      ok: true;
      pose: 't-pose';
      /** The standard bones in the standard order (a finger the file lacks sits on its parent). */
      joints: RigJoint[];
      /** Standard finger bones the file does not have. */
      missing: string[];
      /** Bones the file has beyond the standard ones (hair, skirt, tail): kept still for now. */
      extra: string[];
      /** The character's height in meters (its drawn box). */
      height: number;
    }
  | { ok: false; problems: string[]; found?: { extra: string[] } };

interface RigNode {
  name?: string;
  children?: number[];
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
}

/** The standard 52 bones (the Starter body's joints) in order, with their parents. */
const STANDARD = findBody('starter').joints.map((joint) => ({ name: joint.name, parent: joint.parent }));
const FINGER = /Hand(Thumb|Index|Middle|Ring|Pinky)\d$/;
/** Bones a body needs for our moves: everything but the fingers. */
const CORE = STANDARD.filter((bone) => !FINGER.test(bone.name)).map((bone) => bone.name);

/** A file's bone name in our terms: `mixamorig:Hips`, `mixamorig_Hips` and `Hips` are all `Hips`. */
export function standardBoneName(name: string): string {
  return name.replace(/^mixamorig\d*[:_]?/i, '');
}

/** Arms closer than this to level are a T-pose; up to `A_POSE_DEG` an A-pose. */
const T_POSE_DEG = 20;
const A_POSE_DEG = 70;

/**
 * The rig of an uploaded character (uploaded bodies, plan 2026-10-03, Task 1): the skinned mesh's bones matched to our
 * 52 standard bones (Mixamo names, with or without the `mixamorig` prefix), their world rest positions through the
 * node transforms (any armature scale included), the pose from the arms, the extra bones, and the height. Reads the
 * JSON and the binary chunk only; never renders. A body must stand in a T-pose facing +z for now (an A-pose needs the
 * bind rotations the warrior's tooling writes, a later step).
 */
export function inspectRig(bytes: Uint8Array): RigReading {
  let json: ReturnType<typeof chunks>['json'];
  try {
    json = chunks(bytes).json;
  } catch (error) {
    return {
      ok: false,
      problems: [error instanceof GlbError ? error.message : 'The file could not be read.'],
    };
  }
  const nodes = (json.nodes ?? []) as RigNode[];
  const skins = json.skins ?? [];
  if (skins.length === 0) return { ok: false, problems: ['The file has no rigged (skinned) character.'] };

  // The skin that matches most standard bones is the character's.
  const names = (skin: { joints: number[] }) =>
    skin.joints.map((index) => standardBoneName(nodes[index]?.name ?? ''));
  const skin = [...skins].sort(
    (a, b) =>
      names(b).filter((n) => CORE.includes(n)).length - names(a).filter((n) => CORE.includes(n)).length,
  )[0]!;
  const byName = new Map<string, number>();
  for (const index of skin.joints) {
    const name = standardBoneName(nodes[index]?.name ?? '');
    if (name && !byName.has(name)) byName.set(name, index);
  }
  const extra = [...byName.keys()].filter((name) => !STANDARD.some((bone) => bone.name === name));
  const absent = CORE.filter((name) => !byName.has(name));
  if (absent.length > 0)
    return {
      ok: false,
      problems: [
        `The rig lacks these standard bones: ${absent.join(', ')}. Rig the character with Mixamo's bone names (for example with Mixamo's auto-rigger).`,
      ],
      found: { extra },
    };

  // World matrices of every node (column-major 4x4, as glTF stores them), from the scene roots down.
  const world = new Map<number, number[]>();
  const visit = (index: number, parent: number[]) => {
    const node = nodes[index];
    if (!node || world.has(index)) return;
    const matrix = multiply(parent, localMatrix(node));
    world.set(index, matrix);
    for (const child of node.children ?? []) visit(child, matrix);
  };
  const children = new Set(nodes.flatMap((node) => node.children ?? []));
  const roots =
    json.scenes?.[json.scene ?? 0]?.nodes ?? nodes.map((_, i) => i).filter((i) => !children.has(i));
  for (const root of roots) visit(root, IDENTITY);

  const position = (name: string): [number, number, number] | null => {
    const index = byName.get(name);
    const matrix = index === undefined ? undefined : world.get(index);
    if (!matrix) return null;
    return [round(matrix[12]!), round(matrix[13]!), round(matrix[14]!)];
  };

  const joints: RigJoint[] = [];
  const missing: string[] = [];
  for (const bone of STANDARD) {
    let at = position(bone.name);
    if (!at) {
      // A finger the file lacks: on its parent (it has no weights in the mesh anyway).
      missing.push(bone.name);
      at = joints.find((joint) => joint.name === bone.parent)?.at ?? [0, 0, 0];
    }
    joints.push({ name: bone.name, parent: bone.parent, at });
  }

  const get = (name: string) => joints.find((joint) => joint.name === name)!.at;
  const problems: string[] = [];
  // Facing +z, the character's left hand is at +x.
  if (get('LeftHand')[0] <= get('RightHand')[0])
    problems.push('The character faces away (its left hand is on the right). Turn it to face forward (+z).');
  const armAngle = (side: 'Left' | 'Right') => {
    const arm = get(`${side}Arm`);
    const hand = get(`${side}Hand`);
    const dx = Math.abs(hand[0] - arm[0]);
    const dy = Math.abs(hand[1] - arm[1]);
    const dz = Math.abs(hand[2] - arm[2]);
    return (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
  };
  const worst = Math.max(armAngle('Left'), armAngle('Right'));
  if (worst > T_POSE_DEG)
    problems.push(
      worst <= A_POSE_DEG
        ? `The character stands in an A-pose (arms ${Math.round(worst)}° down). Put it in a T-pose, arms straight out to the sides, before uploading.`
        : `The arms are ${Math.round(worst)}° from level. Put the character in a T-pose, arms straight out to the sides.`,
    );
  if (problems.length > 0) return { ok: false, problems, found: { extra } };

  const bounds = inspectGlb(bytes).bounds;
  const height = bounds ? round(bounds.max[1] - bounds.min[1]) : round(get('Head')[1]);
  return { ok: true, pose: 't-pose', joints, missing, extra, height };
}

const round = (value: number) => Math.round(value * 1e5) / 1e5;

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** `a * b` for column-major 4x4 matrices. */
function multiply(a: readonly number[], b: readonly number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col += 1)
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row]! * b[col * 4 + k]!;
      out[col * 4 + row] = sum;
    }
  return out;
}

/** A node's local matrix: its `matrix`, or translation * rotation * scale. */
function localMatrix(node: RigNode): number[] {
  if (node.matrix?.length === 16) return [...node.matrix];
  const [tx, ty, tz] = (node.translation ?? [0, 0, 0]) as [number, number, number];
  const [x, y, z, w] = (node.rotation ?? [0, 0, 0, 1]) as [number, number, number, number];
  const [sx, sy, sz] = (node.scale ?? [1, 1, 1]) as [number, number, number];
  const xx = x * x,
    yy = y * y,
    zz = z * z,
    xy = x * y,
    xz = x * z,
    yz = y * z,
    wx = w * x,
    wy = w * y,
    wz = w * z;
  return [
    (1 - 2 * (yy + zz)) * sx,
    2 * (xy + wz) * sx,
    2 * (xz - wy) * sx,
    0,
    2 * (xy - wz) * sy,
    (1 - 2 * (xx + zz)) * sy,
    2 * (yz + wx) * sy,
    0,
    2 * (xz + wy) * sz,
    2 * (yz - wx) * sz,
    (1 - 2 * (xx + yy)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
}
