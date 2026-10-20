import { AnimationMixer, LoopRepeat, Quaternion, Vector3, type Bone } from 'three/webgpu';
import { CORE_ANIMATIONS } from '@genvr/core-library';
import { DEFAULT_MOTION_STYLES, LAB_STEP, type MotionCheckCell, type MotionStyleId } from '@genvr/contracts';
import { createGenvrAvatar, DEFAULT_LOOK, type AvatarLook } from '../avatar.js';
import { checkMove, rankCells, type CheckFrame, type CheckLimb, type Vec3 } from './motion-check.js';
import { LAB_GROUND_MOVES } from './sim.js';

/**
 * Board M16 · the sampler: plays a built-in move on a body at the Lab's fixed step and records the frames the check
 * reads. Moves stay in place, so a ground move gets its Lab speed (m/s) added as forward motion; feet then stand
 * still on the floor when the move is right. Bodies built in code (the Standard robot) run headless; mesh bodies
 * are sampled the same way once the viewport has loaded them.
 */
export interface SampledMove { move: string; body: string; loop: boolean; torsoRadius: number; frames: CheckFrame[]; }

const X: Vec3 = [1, 0, 0], Y: Vec3 = [0, 1, 0];
const vec = (v: Vector3): Vec3 => [v.x, v.y, v.z];

export function sampleMoves(look: AvatarLook = { ...DEFAULT_LOOK, body: 'robot' }, moves = CORE_ANIMATIONS.map(row => row.clip), step = LAB_STEP): SampledMove[] {
  const avatar = createGenvrAvatar(look);
  try {
    const bone = (name: string) => { const found = avatar.skeleton.bones.find(b => b.name.endsWith(name)); if (!found) throw new Error(`The body has no ${name} joint.`); return found; };
    const at = (b: Bone) => b.getWorldPosition(new Vector3());
    avatar.root.updateMatrixWorld(true);
    // Rest pose (T-pose facing +z, +x is the body's left): heights of the sole joints and the hinge axes in each bone's own frame.
    const restHeight = (name: string) => at(bone(name)).y - avatar.root.getWorldPosition(new Vector3()).y;
    const soles = (['Left', 'Right'] as const).map(side => ({ heel: restHeight(`${side}Foot`), toe: restHeight(`${side}ToeBase`) }));
    const localAxis = (name: string, axis: Vec3) => new Vector3(...axis).applyQuaternion(bone(name).getWorldQuaternion(new Quaternion()).invert());
    // Knees bend the shin back (+x), the left elbow brings the hand forward (−y), the right elbow (+y).
    const axes = { LeftUpLeg: localAxis('LeftUpLeg', X), RightUpLeg: localAxis('RightUpLeg', X), LeftArm: localAxis('LeftArm', [0, -1, 0]), RightArm: localAxis('RightArm', Y) };
    const torsoRadius = at(bone('LeftArm')).distanceTo(at(bone('RightArm'))) * 0.3;
    const limb = (root: string, mid: string, end: string, upper: keyof typeof axes, forward: number): CheckLimb => ({
      root: shift(vec(at(bone(root))), forward), mid: shift(vec(at(bone(mid))), forward), end: shift(vec(at(bone(end))), forward),
      axis: vec(axes[upper].clone().applyQuaternion(bone(upper).getWorldQuaternion(new Quaternion()))),
    });
    const shift = (p: Vec3, forward: number): Vec3 => [p[0], p[1], p[2] + forward];
    const sole = (name: string, height: number, forward: number): Vec3 => { const p = vec(at(bone(name))); return [p[0], p[1] - height, p[2] + forward]; };
    const out: SampledMove[] = [];
    for (const name of moves) {
      const item = CORE_ANIMATIONS.find(row => row.clip === name), clip = avatar.clips.find(row => row.name === name);
      if (!item || !clip) continue;
      const loop = item.kind === 'loop', speed = LAB_GROUND_MOVES[name]?.speed ?? 0;
      const mixer = new AnimationMixer(avatar.root), action = mixer.clipAction(clip);
      action.setLoop(LoopRepeat, Infinity).play();
      const frames: CheckFrame[] = [], count = Math.max(2, Math.round(clip.duration / step) + 1);
      for (let i = 0; i < count; i++) {
        const t = Math.min(clip.duration, i * step), forward = speed * t;
        mixer.setTime(i === count - 1 ? clip.duration - 1e-6 : t); avatar.updateSprings(i ? step : 0); avatar.root.updateMatrixWorld(true);
        frames.push({ t,
          hips: shift(vec(at(bone('Hips'))), forward), chest: shift(vec(at(bone('Spine2'))), forward), neck: shift(vec(at(bone('Neck'))), forward), head: shift(vec(at(bone('Head'))), forward),
          feet: [{ heel: sole('LeftFoot', soles[0]!.heel, forward), toe: sole('LeftToeBase', soles[0]!.toe, forward) }, { heel: sole('RightFoot', soles[1]!.heel, forward), toe: sole('RightToeBase', soles[1]!.toe, forward) }],
          legs: [limb('LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftUpLeg', forward), limb('RightUpLeg', 'RightLeg', 'RightFoot', 'RightUpLeg', forward)],
          arms: [limb('LeftArm', 'LeftForeArm', 'LeftHand', 'LeftArm', forward), limb('RightArm', 'RightForeArm', 'RightHand', 'RightArm', forward)] });
      }
      mixer.stopAllAction(); mixer.uncacheRoot(avatar.root);
      out.push({ move: name, body: look.body ?? 'robot', loop, torsoRadius, frames });
    }
    return out;
  } finally { avatar.dispose(); }
}

/** Check all moves on one body in the chosen styles; the ranked list puts the worst first. */
export function checkAllMoves(look?: AvatarLook, styles: readonly MotionStyleId[] = ['realistic'], limits = DEFAULT_MOTION_STYLES): MotionCheckCell[] {
  const sampled = sampleMoves(look);
  return rankCells(styles.flatMap(style => sampled.map(move => checkMove({ ...move, style }, limits[style].limits))));
}
