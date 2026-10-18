import { Matrix4, NodeUpdateType, TSL } from 'three/webgpu';
import type { Object3D } from 'three/webgpu';

/** Keep object transforms stable across shadow, opaque and transparent draws in one frame. */
export class ObjectMotionHistory {
  readonly #objects = new WeakMap<Object3D, { frame: number; current: Matrix4; previous: Matrix4 }>();
  previous(object: Object3D, frame: number): Matrix4 {
    let state = this.#objects.get(object);
    if (!state) {
      state = { frame, current: object.matrixWorld.clone(), previous: object.matrixWorld.clone() };
      this.#objects.set(object, state);
    } else if (state.frame !== frame) {
      state.previous.copy(state.current);
      state.current.copy(object.matrixWorld);
      state.frame = frame;
    }
    return state.previous;
  }
}

/**
 * Reproject the current deformed surface with the previous object transform. Custom skinning
 * and shared shadow skeleton updates do not provide a reliable previous deformed surface.
 * This retains camera/root motion without treating the rest pose as a new pose every frame.
 * Bone deformation is deliberately excluded from motion blur until it has matching GPU history.
 */
export function skinnedObjectVelocity(currentVP: any, previousVP: any): any {
  const history = new ObjectMotionHistory();
  const previousModel = TSL.uniform(new Matrix4()).onUpdate(({ object, frameId }) => {
    if (object) return history.previous(object, frameId);
    return new Matrix4();
  }, NodeUpdateType.OBJECT);
  const current = currentVP.mul(TSL.vec4(TSL.positionWorld, 1));
  const previous = previousVP.mul(previousModel).mul(TSL.vec4(TSL.positionLocal, 1));
  return current.xy.div(current.w).sub(previous.xy.div(previous.w)).mul(TSL.vec2(0.5, -0.5));
}
