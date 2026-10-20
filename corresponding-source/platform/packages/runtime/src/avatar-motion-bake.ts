import { AnimationMixer, Euler, LoopOnce, type AnimationClip, type Bone } from 'three/webgpu';
import { defineAnimation, findBody, type AnimationItem, type Key, type Pose, type RigBone } from '@genvr/core-library';
import { createGenvrAvatar, DEFAULT_LOOK } from './avatar.js';
import { retargetMotionScene } from './avatar-motion.js';
import type { Object3D } from 'three/webgpu';

/**
 * Our own motion file (owner, 2026-10-20: "read them by moving our skeleton, store the motion as JSON"): a motion
 * played on our skeleton and written as our animation keys (Euler XYZ degrees per rig bone from the T-pose, and the
 * hips height offset), the same data as the Core moves. It plays through our own clip pipeline on every body.
 */
export interface BakedMotion {
  format: 'genvr.motion';
  version: 1;
  slug: string;
  name: string;
  category: string;
  /** Where the motion came from (a pack or a file name); never a file path. */
  source: string;
  kind: 'loop' | 'once';
  duration: number;
  keys: Key[];
}

const RIG_BONES: readonly RigBone[] = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  ...(['Left', 'Right'] as const).flatMap((side) => (['UpLeg', 'Leg', 'Foot', 'ToeBase', 'Shoulder', 'Arm', 'ForeArm', 'Hand'] as const).map((part) => `${side}${part}` as RigBone))];
/** Keys per second in a baked motion. */
export const BAKE_FPS = 30;
const round = (value: number, step: number) => Math.round(value / step) * step;

/**
 * Plays a source motion (a loaded motion skeleton and its clip) on our Standard skeleton and writes it as our keys.
 * A loop is a motion whose last pose comes back to its first.
 */
export function bakeMotion(scene: Object3D, clip: AnimationClip, meta: { slug: string; name: string; category: string; source: string }): BakedMotion {
  const avatar = createGenvrAvatar({ ...DEFAULT_LOOK, body: 'robot' });
  try {
    const motion = retargetMotionScene(scene, clip, avatar, meta.slug);
    const body = findBody('robot');
    const bones = new Map<string, Bone>(avatar.mesh.skeleton.bones.map((bone) => [bone.name.slice(body.bonePrefix.length), bone]));
    const hips = bones.get('Hips')!, restY = hips.position.y;
    const mixer = new AnimationMixer(avatar.root), action = mixer.clipAction(motion);
    action.setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.play();
    const count = Math.max(2, Math.round(motion.duration * BAKE_FPS) + 1);
    const euler = new Euler(), keys: Key[] = [];
    for (let i = 0; i < count; i += 1) {
      const time = Math.min(motion.duration, i / BAKE_FPS);
      mixer.setTime(time);
      const pose: Pose = {};
      for (const name of RIG_BONES) {
        const bone = bones.get(name);
        if (!bone) continue;
        euler.setFromQuaternion(bone.quaternion, 'XYZ');
        pose[name] = [round(euler.x * 180 / Math.PI, 0.1), round(euler.y * 180 / Math.PI, 0.1), round(euler.z * 180 / Math.PI, 0.1)];
      }
      pose.hipsY = round(hips.position.y - restY, 0.001);
      keys.push([round(time, 0.001), pose]);
    }
    mixer.stopAllAction(); mixer.uncacheRoot(avatar.root);
    const first = keys[0]![1], last = keys.at(-1)![1];
    const apart = Math.max(...RIG_BONES.map((name) => {
      const a = first[name], b = last[name];
      return a && b ? Math.max(...a.map((v, i) => Math.abs(((v - b[i]! + 540) % 360) - 180))) : 0;
    }));
    return { format: 'genvr.motion', version: 1, ...meta, kind: apart < 12 ? 'loop' : 'once', duration: round(motion.duration, 0.001), keys };
  } finally { avatar.dispose(); }
}

/** A baked motion as an animation item, ready for `fixedClip` on any body (its clip is named by the library id). */
export function bakedAnimation(motion: BakedMotion, clip: string): AnimationItem {
  return { ...defineAnimation({ slug: `private.${motion.slug}`, name: motion.name, clip, subcategory: 'animations', kind: motion.kind, duration: motion.duration, keys: motion.keys }), recorded: true };
}
