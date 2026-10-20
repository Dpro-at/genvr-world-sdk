import { AnimationMixer, LoopRepeat, Quaternion, Vector3, type Bone } from 'three/webgpu';
import { CORE_ANIMATIONS } from '@genvr/core-library';
import { DEFAULT_MOTION_STYLES, LAB_STEP, type MotionCheckCell, type MotionStyleId } from '@genvr/contracts';
import { createGenvrAvatar, DEFAULT_LOOK, type AvatarLook } from '../avatar.js';
import { checkMove, PLANT_HEIGHT, rankCells, type CheckFrame, type CheckLimb, type Vec3 } from './motion-check.js';
import { LAB_GROUND_MOVES } from './sim.js';

/**
 * Board M16 · the sampler: plays a built-in move on a body at the Lab's fixed step and records the frames the check
 * reads. Moves play in place, so the body is moved along: a Lab ground move at its Lab speed, another looping move at
 * the speed its planted feet imply (none for a move in place); one-off moves (jumps, turns, landings) stay in place. Bodies built in code (the Standard robot) run headless;
 * mesh bodies are sampled the same way once the viewport has loaded them.
 */
export interface SampledMove { move: string; body: string; loop: boolean; torsoRadius: number; supported: boolean; offFloor: boolean; frames: CheckFrame[];
  /** Body speed used (m/s, x and z). */
  velocity: [number, number]; }

/** A seat or a wall carries the weight. */
export const SUPPORTED_MOVES = new Set(['Sit', 'SitGround', 'Climb']);
/** Played in the air (Jump is the airborne pose) or in water. */
export const OFF_FLOOR_MOVES = new Set(['Jump', 'Swim', 'SwimBreast']);

const X: Vec3 = [1, 0, 0], Y: Vec3 = [0, 1, 0];
const vec = (v: Vector3): Vec3 => [v.x, v.y, v.z];
const moved = (p: Vec3, dx: number, dz: number): Vec3 => [p[0] + dx, p[1], p[2] + dz];
const limbMoved = (l: CheckLimb, dx: number, dz: number): CheckLimb => ({ root: moved(l.root, dx, dz), mid: moved(l.mid, dx, dz), end: moved(l.end, dx, dz), axis: l.axis });

/** Moves a recorded frame along the floor. */
export function moveFrame(f: CheckFrame, dx: number, dz: number): CheckFrame {
  return { t: f.t, hips: moved(f.hips, dx, dz), chest: moved(f.chest, dx, dz), neck: moved(f.neck, dx, dz), head: moved(f.head, dx, dz),
    feet: [{ heel: moved(f.feet[0].heel, dx, dz), toe: moved(f.feet[0].toe, dx, dz) }, { heel: moved(f.feet[1].heel, dx, dz), toe: moved(f.feet[1].toe, dx, dz) }],
    legs: [limbMoved(f.legs[0], dx, dz), limbMoved(f.legs[1], dx, dz)], arms: [limbMoved(f.arms[0], dx, dz), limbMoved(f.arms[1], dx, dz)] };
}

/** The body speed a move played in place implies: minus the median speed of its sole points while they touch the floor. */
export function impliedVelocity(frames: readonly CheckFrame[]): [number, number] {
  const xs: number[] = [], zs: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1]!, b = frames[i]!, dt = (b.t - a.t) || 1;
    for (const foot of [0, 1] as const) for (const point of ['heel', 'toe'] as const) {
      const p = a.feet[foot][point], q = b.feet[foot][point];
      if (p[1] < PLANT_HEIGHT && q[1] < PLANT_HEIGHT) { xs.push((q[0] - p[0]) / dt); zs.push((q[2] - p[2]) / dt); }
    }
  }
  const median = (values: number[]) => { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]!; };
  const vx = -median(xs), vz = -median(zs);
  return Math.hypot(vx, vz) > 0.2 ? [vx, vz] : [0, 0];
}

export function sampleMoves(look: AvatarLook = { ...DEFAULT_LOOK, body: 'robot' }, moves = CORE_ANIMATIONS.map(row => row.clip), step = LAB_STEP): SampledMove[] {
  const avatar = createGenvrAvatar(look);
  try {
    const bone = (name: string) => { const found = avatar.skeleton.bones.find(b => b.name.endsWith(name)); if (!found) throw new Error(`The body has no ${name} joint.`); return found; };
    const at = (b: Bone) => vec(b.getWorldPosition(new Vector3()));
    avatar.root.updateMatrixWorld(true);
    // Rest pose (T-pose facing +z, +x is the body's left): heights of the sole joints and the hinge axes in each bone's own frame.
    const floor = avatar.root.getWorldPosition(new Vector3()).y;
    const restHeight = (name: string) => at(bone(name))[1] - floor;
    const soles = (['Left', 'Right'] as const).map(side => ({ heel: restHeight(`${side}Foot`), toe: restHeight(`${side}ToeBase`) }));
    const localAxis = (name: string, axis: Vec3) => new Vector3(...axis).applyQuaternion(bone(name).getWorldQuaternion(new Quaternion()).invert());
    // Knees bend the shin back (+x), the left elbow brings the hand forward (−y), the right elbow (+y).
    const axes = { LeftUpLeg: localAxis('LeftUpLeg', X), RightUpLeg: localAxis('RightUpLeg', X), LeftArm: localAxis('LeftArm', [0, -1, 0]), RightArm: localAxis('RightArm', Y) };
    const [leftShoulder, rightShoulder] = [at(bone('LeftArm')), at(bone('RightArm'))];
    const torsoRadius = Math.hypot(leftShoulder[0] - rightShoulder[0], leftShoulder[1] - rightShoulder[1], leftShoulder[2] - rightShoulder[2]) * 0.3;
    const limb = (root: string, mid: string, end: string, upper: keyof typeof axes): CheckLimb => ({
      root: at(bone(root)), mid: at(bone(mid)), end: at(bone(end)), axis: vec(axes[upper].clone().applyQuaternion(bone(upper).getWorldQuaternion(new Quaternion()))),
    });
    const sole = (name: string, height: number): Vec3 => { const p = at(bone(name)); return [p[0], p[1] - height, p[2]]; };
    const out: SampledMove[] = [];
    for (const name of moves) {
      const item = CORE_ANIMATIONS.find(row => row.clip === name), clip = avatar.clips.find(row => row.name === name);
      if (!item || !clip) continue;
      const mixer = new AnimationMixer(avatar.root);
      mixer.clipAction(clip).setLoop(LoopRepeat, Infinity).play();
      const inPlace: CheckFrame[] = [], count = Math.max(2, Math.round(clip.duration / step) + 1);
      for (let i = 0; i < count; i++) {
        const t = Math.min(clip.duration, i * step);
        mixer.setTime(i === count - 1 ? clip.duration - 1e-6 : t); avatar.updateSprings(i ? step : 0); avatar.root.updateMatrixWorld(true);
        inPlace.push({ t, hips: at(bone('Hips')), chest: at(bone('Spine2')), neck: at(bone('Neck')), head: at(bone('Head')),
          feet: [{ heel: sole('LeftFoot', soles[0]!.heel), toe: sole('LeftToeBase', soles[0]!.toe) }, { heel: sole('RightFoot', soles[1]!.heel), toe: sole('RightToeBase', soles[1]!.toe) }],
          legs: [limb('LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftUpLeg'), limb('RightUpLeg', 'RightLeg', 'RightFoot', 'RightUpLeg')],
          arms: [limb('LeftArm', 'LeftForeArm', 'LeftHand', 'LeftArm'), limb('RightArm', 'RightForeArm', 'RightHand', 'RightArm')] });
      }
      mixer.stopAllAction(); mixer.uncacheRoot(avatar.root);
      const declared = Object.values(LAB_GROUND_MOVES).find(row => row.clip.replace(/ /g, '') === name)?.speed;
      const velocity: [number, number] = declared !== undefined ? [0, declared] : SUPPORTED_MOVES.has(name) || OFF_FLOOR_MOVES.has(name) || item.kind !== 'loop' ? [0, 0] : impliedVelocity(inPlace);
      out.push({ move: name, body: look.body ?? 'robot', loop: item.kind === 'loop', torsoRadius, supported: SUPPORTED_MOVES.has(name), offFloor: OFF_FLOOR_MOVES.has(name), velocity,
        frames: inPlace.map(f => moveFrame(f, velocity[0] * f.t, velocity[1] * f.t)) });
    }
    return out;
  } finally { avatar.dispose(); }
}

/** Check all moves on one body in the chosen styles; the ranked list puts the worst first. */
export function checkAllMoves(look?: AvatarLook, styles: readonly MotionStyleId[] = ['realistic'], limits = DEFAULT_MOTION_STYLES): MotionCheckCell[] {
  const sampled = sampleMoves(look);
  return rankCells(styles.flatMap(style => sampled.map(move => checkMove({ ...move, style }, limits[style].limits))));
}
