import { Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import { NORMAL_CHARACTER_SHAPE, type CharacterShape } from '@genvr/contracts';
import type { AvatarBody, BodyJoint } from '@genvr/core-library';

/**
 * Character shaping (CHAR-01): height, weight and overall size on the body's own skeleton. Bone names, parents and
 * rest axes never change, so every clip (local rotations from world-aligned T-pose rest frames) plays unchanged; only
 * the rest positions, the bind matrices and the skinned vertices move. Work happens in bind space, so a model bound
 * in its own pose (the warrior's A-pose) shapes the same way. Pure math on arrays: no renderer needed.
 */

/** What a bone is, for how it grows: the head keeps its size, feet keep their soles, hands grow a little. */
export type BoneRole = 'head' | 'neck' | 'spine' | 'arm' | 'hand' | 'leg' | 'foot' | 'other';

const ROLE_TESTS: Array<[BoneRole, RegExp]> = [
  ['foot', /Foot|Toe/],
  ['hand', /Hand|Thumb|Index|Middle|Ring|Pinky/],
  ['arm', /Arm/],
  ['leg', /Leg/],
  ['neck', /Neck/],
  ['spine', /Hips|Spine|Torso|Shoulder|Chest|Pelvis/],
];

/** The role of each joint of a body, in joint order. Everything under the head belongs to the head (hair too). */
export function boneRoles(body: Pick<AvatarBody, 'joints' | 'animation'>): BoneRole[] {
  const roles = new Map<string, BoneRole>();
  for (const joint of body.joints) {
    const parentRole = joint.parent ? roles.get(joint.parent) : undefined;
    const plays = body.animation[joint.name] ?? [];
    let role: BoneRole;
    if (parentRole === 'head' || joint.name === 'Head' || plays.includes('Head')) role = 'head';
    else {
      const text = [joint.name, ...plays].join(' ');
      role = ROLE_TESTS.find(([, test]) => test.test(text))?.[0] ?? 'other';
      // Hair, coat panels and tassels hang from the body: they follow its length, never its weight.
      if (role === 'other' && parentRole === 'hand') role = 'hand';
    }
    roles.set(joint.name, role);
  }
  return body.joints.map((joint) => roles.get(joint.name)!);
}

/** How much a bone of a role lengthens (along its parent link) and thickens (across its own direction). */
export function boneFactors(role: BoneRole, shape: CharacterShape): { length: number; thickness: number } {
  const h = shape.height;
  const w = shape.weight;
  const length = role === 'head' ? 1 : role === 'neck' ? 1 + (h - 1) * 0.5 : h;
  const thickness =
    role === 'spine' || role === 'arm' || role === 'leg'
      ? w
      : role === 'neck'
        ? 1 + (w - 1) * 0.6
        : role === 'hand'
          ? 1 + (w - 1) * 0.3
          : 1;
  return { length, thickness };
}

export interface ShapeBone {
  /** Parent bone index, or -1 for the root. */
  parent: number;
  /** World matrix of the bone when the mesh was bound (inverse of its bone inverse). */
  bind: Matrix4;
  /** Rest (T-pose) local position under its parent. */
  rest: Vector3;
  role: BoneRole;
}

export interface ShapeInput {
  /** Bind-space vertex positions (xyz). */
  positions: ArrayLike<number>;
  skinIndex: ArrayLike<number>;
  skinWeight: ArrayLike<number>;
  bones: readonly ShapeBone[];
}

export interface ShapeOutput {
  positions: Float32Array;
  /** New bind world matrices (same rotations). */
  bind: Matrix4[];
  /** New rest local positions. */
  rest: Vector3[];
  /** Lowest vertex before and after (the soles stay on the ground). */
  minY: { before: number; after: number };
}

const NORMAL: CharacterShape = NORMAL_CHARACTER_SHAPE;

/** Reshapes a skinned body in bind space (see the file comment). */
export function shapeSkin(input: ShapeInput, shape: CharacterShape = NORMAL): ShapeOutput {
  const { bones } = input;
  const count = bones.length;
  const factors = bones.map((bone) => boneFactors(bone.role, shape));
  const at: Vector3[] = [];
  const turn: Quaternion[] = [];
  const size: Vector3[] = [];
  for (const bone of bones) {
    const p = new Vector3();
    const q = new Quaternion();
    const s = new Vector3();
    bone.bind.decompose(p, q, s);
    at.push(p);
    turn.push(q);
    size.push(s);
  }
  // New bone positions by forward kinematics (each link scaled by its own length factor).
  const moved: Array<Vector3 | undefined> = new Array(count);
  const place = (i: number): Vector3 => {
    const known = moved[i];
    if (known) return known;
    const parent = bones[i]!.parent;
    const next =
      parent < 0
        ? at[i]!.clone().multiplyScalar(factors[i]!.length)
        : at[i]!.clone().sub(at[parent]!).multiplyScalar(factors[i]!.length).add(place(parent));
    moved[i] = next;
    return next;
  };
  for (let i = 0; i < count; i += 1) place(i);
  // Each bone's direction (toward its children, else away from its parent) and the stretch along it.
  const children: number[][] = bones.map(() => []);
  bones.forEach((bone, i) => {
    if (bone.parent >= 0) children[bone.parent]!.push(i);
  });
  const direction: Vector3[] = [];
  const along: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Vector3();
    for (const c of children[i]!) d.add(at[c]!.clone().sub(at[i]!));
    if (d.lengthSq() < 1e-10 && bones[i]!.parent >= 0) d.subVectors(at[i]!, at[bones[i]!.parent]!);
    if (d.lengthSq() < 1e-10) d.set(0, 1, 0);
    direction.push(d.normalize());
    const kids = children[i]!;
    along.push(
      kids.length > 0
        ? kids.reduce((sum, c) => sum + factors[c]!.length, 0) / kids.length
        : factors[i]!.length,
    );
  }

  const source = input.positions;
  const vertices = source.length / 3;
  const positions = new Float32Array(source.length);
  const v = new Vector3();
  const r = new Vector3();
  const a = new Vector3();
  const sum = new Vector3();
  let before = Infinity;
  let after = Infinity;
  for (let n = 0; n < vertices; n += 1) {
    v.set(source[n * 3]!, source[n * 3 + 1]!, source[n * 3 + 2]!);
    before = Math.min(before, v.y);
    sum.set(0, 0, 0);
    let total = 0;
    for (let k = 0; k < 4; k += 1) {
      const weight = input.skinWeight[n * 4 + k]!;
      if (!(weight > 0)) continue;
      const b = input.skinIndex[n * 4 + k]!;
      if (b >= count) continue;
      r.subVectors(v, at[b]!);
      a.copy(direction[b]!).multiplyScalar(r.dot(direction[b]!));
      r.sub(a).multiplyScalar(factors[b]!.thickness);
      sum.addScaledVector(moved[b]!.clone().addScaledVector(a, along[b]!).add(r), weight);
      total += weight;
    }
    if (total > 0) sum.divideScalar(total);
    else sum.copy(v);
    positions[n * 3] = sum.x;
    positions[n * 3 + 1] = sum.y;
    positions[n * 3 + 2] = sum.z;
    after = Math.min(after, sum.y);
  }
  // Soles back on the ground, then the overall size (around the ground point under the body).
  const lift = vertices > 0 ? before - after : 0;
  const s = shape.scale;
  for (let n = 0; n < vertices; n += 1) {
    positions[n * 3] = positions[n * 3]! * s;
    positions[n * 3 + 1] = (positions[n * 3 + 1]! + lift) * s;
    positions[n * 3 + 2] = positions[n * 3 + 2]! * s;
  }
  const bind = moved.map((p, i) => {
    const point = p!.clone();
    point.y += lift;
    point.multiplyScalar(s);
    return new Matrix4().compose(point, turn[i]!, size[i]!);
  });
  const rest = bones.map((bone, i) => {
    const next = bone.rest.clone().multiplyScalar(factors[i]!.length);
    if (bone.parent < 0) next.y += lift;
    return next.multiplyScalar(s);
  });
  return {
    positions,
    bind,
    rest,
    minY: { before: vertices > 0 ? before : 0, after: vertices > 0 ? (after + lift) * s : 0 },
  };
}

/** A body's joints at new rest positions (T-pose world points from the local rest positions, in joint order). */
export function shapedJoints(joints: readonly BodyJoint[], rest: readonly Vector3[]): BodyJoint[] {
  const world = new Map<string, Vector3>();
  return joints.map((joint, i) => {
    const local = rest[i] ?? new Vector3(...joint.at);
    const parent = joint.parent ? world.get(joint.parent) : undefined;
    const point = parent ? parent.clone().add(local) : local.clone();
    world.set(joint.name, point);
    return { ...joint, at: [point.x, point.y, point.z] };
  });
}

/** A copy of a body at a shape: joints at the new rest, and the size clips use for the Hips drop. */
export function shapedBody<T extends AvatarBody>(
  body: T,
  rest: readonly Vector3[],
  shape: CharacterShape,
): T {
  return {
    ...body,
    joints: shapedJoints(body.joints, rest),
    scale: { height: shape.height * shape.scale, width: shape.weight, head: 1 },
  };
}
