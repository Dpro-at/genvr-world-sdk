import { Quaternion, Vector3, type Bone } from 'three/webgpu';

/** Toes never bend down and never more than this (radians, 45°). */
export const TOE_ROLL_MAX = Math.PI / 4;

/**
 * Toe roll for bodies with toe shells on ToeBase: when the heel lifts, the toes stay flat on the ground.
 * Runs after the clips each frame. A clip that keys ToeBase itself wins: the bone is left alone once its
 * rotation is no longer the one set here on the last frame.
 */
export function createToeRoll(toes: readonly Bone[]) {
  const last = new Map<Bone, Quaternion>();
  const forward = new Vector3(), axis = new Vector3(), up = new Vector3(0, 1, 0);
  const world = new Quaternion(), parent = new Quaternion(), turn = new Quaternion();
  return {
    update() {
      for (const toe of toes) {
        const previous = last.get(toe);
        if (previous && !previous.equals(toe.quaternion)) { last.delete(toe); continue; }
        toe.quaternion.identity();
        toe.updateWorldMatrix(true, false);
        // Bone forward (+Z at rest) in the world: how far it points below the ground plane is the heel lift.
        forward.set(0, 0, 1).applyQuaternion(toe.getWorldQuaternion(world)).normalize();
        const lift = Math.min(TOE_ROLL_MAX, Math.max(0, Math.asin(Math.min(1, -forward.y))));
        if (lift > 1e-4 && axis.crossVectors(forward, up).lengthSq() > 1e-8) {
          axis.normalize();
          turn.setFromAxisAngle(axis, lift);
          const parentWorld = toe.parent ? toe.parent.getWorldQuaternion(parent) : parent.identity();
          // world' = turn · world  →  local' = parent⁻¹ · turn · world
          toe.quaternion.copy(parentWorld.clone().invert().multiply(turn).multiply(world));
        }
        last.set(toe, toe.quaternion.clone());
      }
    },
  };
}
