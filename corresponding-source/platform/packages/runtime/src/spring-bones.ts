import { Quaternion, Vector3, type Bone, type Skeleton } from 'three/webgpu';

/**
 * Swinging hair, coat panels, and tassels (P2-35 warrior): chains of bones that the clips never
 * key, moved each frame like the VRM spring bones. Every joint keeps the world point of its
 * child (the tail) with its last speed; each step the tail keeps some of that speed (drag), is
 * pulled back toward the rest shape the parent gives it (stiffness) and down (gravity), stays at
 * the bone's length, and is pushed out of the body's spheres (colliders: head, back, thighs), so
 * a thigh lifts the coat instead of passing through it. Then the bone turns to point at its tail.
 * Cheap: a few vector operations per joint, fine on phones.
 */

export interface SpringChainSetup {
  /** Joint names, root first; the last one is the tip (its position only). */
  readonly joints: readonly string[];
  readonly stiffness: number;
  readonly drag: number;
  /** Share of the body's motion the chain does not follow each step (air: hair trails when running). */
  readonly air?: number;
  readonly gravity: number;
  readonly radius: number;
  /** Degrees a joint may turn away from its rest direction (none: no limit). */
  readonly maxAngle?: number;
}

export interface SpringColliderSetup {
  readonly joint: string;
  readonly offset: readonly [number, number, number];
  readonly radius: number;
}

interface Joint {
  bone: Bone;
  /** The child's rest offset in this bone's frame (the bone's direction and length). */
  axis: Vector3;
  length: number;
  tail: Vector3;
  prev: Vector3;
  /** Where the joint itself was last step: the chain follows the body's motion, swings on its own. */
  head: Vector3;
}

interface Chain {
  setup: SpringChainSetup;
  joints: Joint[];
}

interface Collider {
  bone: Bone;
  offset: Vector3;
  radius: number;
}

/** The longest step simulated at once (a hitch in frames must not throw the hair). */
const MAX_STEP = 1 / 30;
/** A jump of the whole avatar this far (teleport, respawn) restarts the chains at rest. */
const RESET_DISTANCE = 2;

const down = new Vector3(0, -1, 0);
const head = new Vector3();
const rest = new Vector3();
const next = new Vector3();
const center = new Vector3();
const dir = new Vector3();
const parentQ = new Quaternion();
const turn = new Quaternion();
const identity = new Quaternion();
const aim = new Vector3();
const moved = new Vector3();
const fall = new Vector3();
const tilted = new Vector3();

export class SpringBones {
  readonly #chains: Chain[] = [];
  readonly #colliders: Collider[] = [];
  readonly #root: Bone | undefined;
  #started = false;

  constructor(
    skeleton: Skeleton,
    chains: readonly SpringChainSetup[],
    colliders: readonly SpringColliderSetup[],
    nodeName: (joint: string) => string,
  ) {
    this.#root = skeleton.bones[0];
    const bone = (name: string) => skeleton.getBoneByName(nodeName(name));
    for (const setup of chains) {
      const joints: Joint[] = [];
      for (let i = 0; i < setup.joints.length - 1; i += 1) {
        const b = bone(setup.joints[i]!);
        const child = bone(setup.joints[i + 1]!);
        if (!b || !child) break;
        const axis = child.position.clone();
        joints.push({
          bone: b,
          axis,
          length: axis.length(),
          tail: new Vector3(),
          prev: new Vector3(),
          head: new Vector3(),
        });
      }
      if (joints.length > 0) this.#chains.push({ setup, joints });
    }
    for (const c of colliders) {
      const b = bone(c.joint);
      if (b) this.#colliders.push({ bone: b, offset: new Vector3(...c.offset), radius: c.radius });
    }
  }

  get chainCount(): number {
    return this.#chains.length;
  }

  /** Puts every chain back in its rest shape (the next update starts from there). */
  reset(): void {
    this.#started = false;
  }

  /** Call after the clips have posed the skeleton this frame. */
  update(delta: number): void {
    if (this.#chains.length === 0) return;
    // The clips set local turns; bring the whole body's world matrices up to date first.
    this.#root?.updateWorldMatrix(true, true);
    if (!this.#started) {
      this.#restart();
      return;
    }
    let left = Math.min(delta, 0.25);
    while (left > 1e-4) {
      const dt = Math.min(left, MAX_STEP);
      this.#step(dt);
      left -= dt;
    }
  }

  #restart(): void {
    for (const chain of this.#chains)
      for (const joint of chain.joints) {
        joint.bone.quaternion.identity();
        joint.bone.updateWorldMatrix(true, false);
        this.#restTail(joint, joint.tail);
        joint.prev.copy(joint.tail);
        joint.head.copy(head);
        joint.length = joint.tail.distanceTo(head); // world length (the avatar may be scaled)
      }
    this.#started = true;
  }

  /** Where the joint's tail would be if the bone kept its rest turn under its parent. */
  #restTail(joint: Joint, out: Vector3): Vector3 {
    const bone = joint.bone;
    bone.parent!.getWorldQuaternion(parentQ);
    head.setFromMatrixPosition(bone.matrixWorld);
    return out.copy(joint.axis).applyQuaternion(parentQ).add(head);
  }

  #step(dt: number): void {
    const colliders = this.#colliders.map((c) => ({
      at: c.bone.localToWorld(center.copy(c.offset)).clone(),
      radius: c.radius,
    }));
    for (const { setup, joints } of this.#chains) {
      for (const joint of joints) {
        const bone = joint.bone;
        bone.quaternion.identity();
        bone.updateWorldMatrix(false, false);
        head.setFromMatrixPosition(bone.matrixWorld);
        this.#restTail(joint, rest);
        if (joint.tail.distanceTo(rest) > RESET_DISTANCE) {
          joint.tail.copy(rest);
          joint.prev.copy(rest);
          joint.head.copy(head);
        }
        // Gravity only where the body is not upright: the model's rest shape already hangs, so
        // standing straight adds nothing (a plain pull made the ponytail sag 15 degrees); leaning or
        // lying down lets the chain fall toward the real down.
        fall.copy(down).sub(tilted.copy(down).applyQuaternion(parentQ));
        // Verlet: follow the body's motion (all but the air's share), keep some of the chain's own
        // swing (drag), pull toward the rest shape, and let it fall.
        moved.subVectors(head, joint.head);
        joint.head.copy(head);
        next
          .copy(joint.tail)
          .addScaledVector(moved, 1 - (setup.air ?? 0))
          .addScaledVector(dir.subVectors(joint.tail, joint.prev).sub(moved), 1 - setup.drag)
          .addScaledVector(dir.subVectors(rest, joint.tail), Math.min(1, setup.stiffness * dt))
          .addScaledVector(fall, setup.gravity * dt * dt);
        next.sub(head).setLength(joint.length).add(head);
        for (const c of colliders) {
          const reach = c.radius + setup.radius;
          dir.subVectors(next, c.at);
          const d = dir.length();
          if (d < reach && d > 1e-6) {
            next.copy(c.at).addScaledVector(dir, reach / d);
            next.sub(head).setLength(joint.length).add(head);
          }
        }
        // Never further from the rest direction than the chain allows (no flipping over the pivot).
        if (setup.maxAngle !== undefined) {
          const limit = (setup.maxAngle * Math.PI) / 180;
          dir.subVectors(rest, head).normalize();
          aim.subVectors(next, head).normalize();
          const angle = Math.acos(Math.min(1, Math.max(-1, dir.dot(aim))));
          if (angle > limit) {
            turn.setFromUnitVectors(dir, aim);
            turn.slerp(identity, 1 - limit / angle);
            next.copy(dir).applyQuaternion(turn).multiplyScalar(joint.length).add(head);
          }
        }
        joint.prev.copy(joint.tail);
        joint.tail.copy(next);
        // Turn the bone from its rest direction to the tail, in its parent's frame.
        bone.parent!.getWorldQuaternion(parentQ);
        dir.copy(joint.axis).applyQuaternion(parentQ).normalize();
        turn.setFromUnitVectors(dir, next.sub(head).normalize());
        bone.quaternion.copy(parentQ).invert().multiply(turn).multiply(parentQ);
        bone.updateWorldMatrix(false, true);
      }
    }
  }
}
