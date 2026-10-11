import { describe, expect, it } from 'vitest';
import { Bone, Group, Skeleton, Vector3 } from 'three/webgpu';
import { SpringBones } from '../src/spring-bones.js';

/** A body root with a chain of three joints hanging 0.3 m down from it (like a coat panel). */
function rig() {
  const world = new Group();
  const root = new Bone();
  root.name = 'Hips';
  const a = new Bone();
  a.name = 'Coat1';
  const b = new Bone();
  b.name = 'Coat2';
  const end = new Bone();
  end.name = 'CoatEnd';
  a.position.set(0, -0.1, 0.15);
  b.position.set(0, -0.3, 0);
  end.position.set(0, -0.3, 0);
  root.add(a);
  a.add(b);
  b.add(end);
  world.add(root);
  const skeleton = new Skeleton([root, a, b, end]);
  return { world, root, a, b, end, skeleton };
}

const chain = {
  joints: ['Coat1', 'Coat2', 'CoatEnd'],
  stiffness: 5,
  drag: 0.15,
  air: 0.1,
  gravity: 6,
  radius: 0.02,
};
const tip = (bone: Bone) => bone.getWorldPosition(new Vector3());

describe('spring bones', () => {
  it('keeps a hanging chain still when the body does not move', () => {
    const { skeleton, end } = rig();
    const springs = new SpringBones(skeleton, [chain], [], (n) => n);
    const start = tip(end);
    for (let i = 0; i < 120; i += 1) springs.update(1 / 60);
    expect(tip(end).distanceTo(start)).toBeLessThan(0.005);
  });

  it('trails behind a moving body, then settles back', () => {
    const { skeleton, world, end } = rig();
    const springs = new SpringBones(skeleton, [chain], [], (n) => n);
    springs.update(1 / 60);
    for (let i = 0; i < 10; i += 1) {
      world.position.x += 0.05; // running sideways at 3 m/s
      springs.update(1 / 60);
    }
    const lag = world.position.x - tip(end).x;
    expect(lag).toBeGreaterThan(0.02);
    for (let i = 0; i < 300; i += 1) springs.update(1 / 60);
    expect(Math.abs(world.position.x - tip(end).x)).toBeLessThan(0.01);
  });

  it('keeps the chain out of a collider sphere', () => {
    const { skeleton, end } = rig();
    // A thigh sphere just behind the panel's rest line.
    const springs = new SpringBones(
      skeleton,
      [chain],
      [{ joint: 'Hips', offset: [0, -0.5, 0.1], radius: 0.1 }],
      (n) => n,
    );
    for (let i = 0; i < 60; i += 1) springs.update(1 / 60);
    const center = new Vector3(0, -0.5, 0.1);
    const mid = skeleton.getBoneByName('Coat2')!.getWorldPosition(new Vector3());
    expect(mid.distanceTo(center)).toBeGreaterThanOrEqual(0.1 + 0.02 - 3e-3);
    expect(tip(end).y).toBeLessThan(-0.4);
  });

  it('ignores chains whose joints the skeleton lacks', () => {
    const { skeleton } = rig();
    const springs = new SpringBones(skeleton, [{ ...chain, joints: ['Nope1', 'Nope2'] }], [], (n) => n);
    expect(springs.chainCount).toBe(0);
    springs.update(1 / 60);
  });
});

describe('spring bone limits', () => {
  it('never turns a joint further from rest than its limit', () => {
    const { skeleton, world, end } = rig();
    const limited = { ...chain, air: 0.9, maxAngle: 30 };
    const springs = new SpringBones(skeleton, [limited], [], (n) => n);
    springs.update(1 / 60);
    for (let i = 0; i < 30; i += 1) {
      world.position.z += 0.2; // a violent dash forward
      springs.update(1 / 60);
    }
    const a = skeleton.getBoneByName('Coat1')!;
    // The first joint hangs straight down at rest; with a 30 degree limit its tail stays within 30 degrees.
    const head = a.getWorldPosition(new Vector3());
    const tail = skeleton.getBoneByName('Coat2')!.getWorldPosition(new Vector3());
    const angle = new Vector3(0, -1, 0).angleTo(tail.sub(head).normalize());
    expect((angle * 180) / Math.PI).toBeLessThan(30.5);
    expect(end.parent).toBeTruthy();
  });
});
