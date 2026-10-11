import { Bone, Box3, Group, Skeleton, Vector3, type Object3D } from 'three/webgpu';
import { findBody, type AvatarBody } from '@genvr/core-library';
import { describe, expect, it } from 'vitest';
import { AvatarAnimator } from '../src/animator.js';
import { createGenvrAvatar, DEFAULT_LOOK, rightHandGrip, type HandGrip } from '../src/avatar.js';
import { heldBlockMesh, heldItemMesh, holdInRightHand } from '../src/player-hands.js';

const MELEE_TOOL = 'genvr.core.gameplay.melee-tool';

/** The melee tool's size in the world and how far its grip (0.1 m up the item) is from the hand. */
function measure(root: Object3D, tool: Object3D, hand: HandGrip) {
  root.updateMatrixWorld(true);
  const size = new Box3().setFromObject(tool).getSize(new Vector3());
  const grip = tool.localToWorld(new Vector3(0, 0.1, 0));
  const wrist = new Vector3().setFromMatrixPosition(hand.bone.matrixWorld);
  return { length: Math.max(size.x, size.y, size.z), fromHand: grip.distanceTo(wrist) };
}

/** A body's skeleton as the runtime builds it (bones unrotated at rest, named with the prefix). */
function skeletonOf(body: AvatarBody): { root: Group; skeleton: Skeleton } {
  const byName = new Map<string, { bone: Bone; at: readonly number[] }>();
  const bones = body.joints.map((joint) => {
    const bone = new Bone();
    bone.name = body.bonePrefix + joint.name;
    const parent = joint.parent ? byName.get(joint.parent) : undefined;
    if (parent) {
      bone.position.set(
        joint.at[0] - parent.at[0]!,
        joint.at[1] - parent.at[1]!,
        joint.at[2] - parent.at[2]!,
      );
      parent.bone.add(bone);
    } else bone.position.set(...joint.at);
    byName.set(joint.name, { bone, at: joint.at });
    return bone;
  });
  const root = new Group();
  root.add(bones[0]!);
  return { root, skeleton: new Skeleton(bones) };
}

describe('holding things in the right hand (P9-12)', () => {
  it.each(['classic', 'simple', 'starter', 'flat'] as const)(
    'the %s body holds the melee tool at its real size in its hand, while it plays',
    (body) => {
      const avatar = createGenvrAvatar({ ...DEFAULT_LOOK, body });
      const animator = new AvatarAnimator(avatar.mesh, avatar.clips);
      animator.play('Idle');
      animator.update(0.5);
      const hand = avatar.rightHand;
      expect(hand).not.toBeNull();
      const tool = heldItemMesh(MELEE_TOOL)!;
      holdInRightHand(tool, hand, 'item');
      expect(tool.parent).toBe(hand!.bone);
      const { length, fromHand } = measure(avatar.root, tool, hand!);
      expect(length).toBeGreaterThan(0.8);
      expect(length).toBeLessThan(1.2);
      // One-piece arms (Simple) have their joint at the shoulder: the palm is out at the end.
      expect(
        tool.localToWorld(new Vector3(0, 0.1, 0)).distanceTo(handPoint(avatar.root, hand!)),
      ).toBeLessThan(0.05);
      if (body !== 'simple') expect(fromHand).toBeLessThan(0.3);
    },
  );

  it.each(['warrior', 'anime-boy'] as const)(
    'the %s mesh body (prefixed Mixamo bones) holds it too',
    (id) => {
      const body = findBody(id);
      const { root, skeleton } = skeletonOf(body);
      const hand = rightHandGrip(body, skeleton);
      expect(hand?.bone.name).toBe('mixamorigRightHand');
      const tool = heldItemMesh(MELEE_TOOL)!;
      holdInRightHand(tool, hand, 'item');
      const { length, fromHand } = measure(root, tool, hand!);
      expect(length).toBeGreaterThan(0.8);
      expect(length).toBeLessThan(1.2);
      expect(fromHand).toBeLessThan(0.3);
    },
  );

  it('holds a block just past the fingers of a block hand, as before', () => {
    const avatar = createGenvrAvatar();
    const block = heldBlockMesh();
    holdInRightHand(block, avatar.rightHand, 'block');
    expect(block.position.x).toBeCloseTo(-0.14);
    expect(block.position.y).toBeCloseTo(-0.02);
    expect(block.position.z).toBeCloseTo(0.1);
    holdInRightHand(block, null, 'block');
    expect(block.parent).toBeNull();
  });
});

function handPoint(root: Object3D, hand: HandGrip): Vector3 {
  root.updateMatrixWorld(true);
  return hand.bone.localToWorld(hand.palm.clone());
}
