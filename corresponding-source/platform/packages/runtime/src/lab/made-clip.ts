import { AnimationClip, Euler, Quaternion, QuaternionKeyframeTrack, VectorKeyframeTrack } from 'three/webgpu';
import { LAB_POSE_FPS, type LabMadeMotion } from '@genvr/contracts';
import type { AvatarBody } from '@genvr/core-library';
import { labClipPose, labPoseAt } from './pose.js';

const FINGER = /^(Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky)\d$/;
/** The lab robot's hip height (m): a made motion's hips offset is scaled to the body by its own hip height. */
const ROBOT_HIP = 0.84;

/**
 * A motion made in the Lab (board M11) as a clip of a body (board M19): the keys filled in frame by frame (at most 240
 * samples), each pose as the Core moves' rotations on the body's own joints, the fingers by name and the hips offset
 * scaled by the body's hip height. A loop ends on its first frame, so it repeats without a seam.
 */
export function madeMotionClip(motion: Pick<LabMadeMotion, 'frames' | 'loop' | 'keys'>, body: AvatarBody, name: string): AnimationClip {
  const keyed = { ...motion, draft: null };
  const step = Math.max(1, Math.ceil(motion.frames / 240));
  const frames: number[] = [];
  for (let f = 0; f < motion.frames; f += step) frames.push(f);
  frames.push(motion.loop ? motion.frames : motion.frames - 1);
  const poses = frames.map((f) => labClipPose(labPoseAt(keyed, f % motion.frames, false)));
  const times = frames.map((f) => f / LAB_POSE_FPS);
  const tracks: Array<QuaternionKeyframeTrack | VectorKeyframeTrack> = [];
  if (body.flat) return new AnimationClip(name, times.at(-1) ?? 0, tracks);
  const q = new Quaternion(), part = new Quaternion(), e = new Euler();
  const turn = (v: readonly number[] | undefined) => part.setFromEuler(e.set(((v?.[0] ?? 0) * Math.PI) / 180, ((v?.[1] ?? 0) * Math.PI) / 180, ((v?.[2] ?? 0) * Math.PI) / 180, 'XYZ'));
  for (const [joint, sources] of Object.entries(body.animation)) {
    const values: number[] = [];
    for (const pose of poses) {
      q.identity();
      for (const source of sources) q.multiply(turn(pose.bones[source]));
      values.push(q.x, q.y, q.z, q.w);
    }
    tracks.push(new QuaternionKeyframeTrack(`${body.bonePrefix}${joint}.quaternion`, times, values));
  }
  for (const joint of body.joints) {
    if (!FINGER.test(joint.name) || !poses.some((pose) => pose.bones[joint.name])) continue;
    const values: number[] = [];
    for (const pose of poses) { const t = turn(pose.bones[joint.name]); values.push(t.x, t.y, t.z, t.w); }
    tracks.push(new QuaternionKeyframeTrack(`${body.bonePrefix}${joint.name}.quaternion`, times, values));
  }
  const root = body.joints[0];
  if (root && poses.some((pose) => pose.root.some((v) => v !== 0))) {
    const hip = body.joints.find((j) => j.name === 'LeftUpLeg')?.at[1];
    const scale = hip ? hip / ROBOT_HIP : 1;
    tracks.push(new VectorKeyframeTrack(`${body.bonePrefix}${root.name}.position`, times,
      poses.flatMap((pose) => [root.at[0] + pose.root[0]! * scale, root.at[1] + pose.root[1]! * scale, root.at[2] + pose.root[2]! * scale])));
  }
  return new AnimationClip(name, times.at(-1) ?? 0, tracks);
}
