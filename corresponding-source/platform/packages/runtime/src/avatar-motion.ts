import { canonicalBoneName } from './avatar-rig-compatibility.js';
import { AnimationClip, AnimationMixer, LoopOnce, Object3D, QuaternionKeyframeTrack, SkinnedMesh, Vector3, VectorKeyframeTrack, Quaternion, type Bone, type KeyframeTrack } from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { findBody } from '@genvr/core-library';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { settleClip, type GenvrAvatar } from './avatar.js';

/** Import supplied motion data without downloading a model or changing the avatar's geometry. */
export async function retargetAvatarMotion(data: ArrayBuffer, avatar: { root: Object3D; body: GenvrAvatar['body'] }, name: string): Promise<AnimationClip> {
  if (data.byteLength > 16 * 1024 * 1024) throw new Error('Motion file exceeds 16 MB.');
  if (data.byteLength < 24 || new DataView(data).getUint32(0, true) !== 0x46546c67) throw new Error('Expected a motion-only GLB file.');
  const jsonSize = new DataView(data).getUint32(12, true);
  const document = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 20, jsonSize)));
  if (document.meshes?.length || document.images?.length || document.buffers?.some((buffer: { uri?: string }) => buffer.uri)) throw new Error('Use a self-contained motion-only GLB file.');
  const gltf = await new GLTFLoader().parseAsync(data, '');
  const scene = gltf.scene, clip = gltf.animations[0];
  if (!clip || clip.duration <= 0 || clip.duration > 120) throw new Error('Motion needs a clip of at most two minutes.');
  return retargetMotionScene(scene, clip, avatar, name);
}

/** Retarget one clip of an already loaded source skeleton onto the avatar (the GLB import above, or a test). */
export function retargetMotionScene(scene: Object3D, clip: AnimationClip, avatar: { root: Object3D; body: GenvrAvatar['body'] }, name: string): AnimationClip {
  const nodes: Object3D[] = [];
  scene.traverse(node => { if (node.name) nodes.push(node); });
  const normalized = canonicalBoneName;
  const sourceNames = new Map(nodes.map(node => [normalized(node.name), node.name]));
  const targetRoot = clone(avatar.root);
  let target: SkinnedMesh | undefined;
  targetRoot.traverse(node => { if ((node as SkinnedMesh).isSkinnedMesh && node.name === 'avatar-body') target = node as SkinnedMesh; });
  if (!target) throw new Error('Avatar has no compatible skeleton.');
  targetRoot.updateMatrixWorld(true); scene.updateMatrixWorld(true);
  const body = findBody(avatar.body);
  const names = Object.fromEntries(target.skeleton.bones.map(bone => {
    const joint = bone.name.startsWith(body.bonePrefix) ? bone.name.slice(body.bonePrefix.length) : bone.name;
    const standard = body.animation[joint]?.at(-1) ?? normalized(joint);
    return [bone.name, sourceNames.get(standard) ?? ''];
  }));
  const matched = Object.values(names).filter(Boolean).length;
  if (matched < 10) throw new Error('Motion skeleton does not match this avatar.');
  const hips = target.skeleton.bones.find(bone => normalized(names[bone.name] ?? '') === 'Hips');
  const sourceHip = nodes.find(node => normalized(node.name) === 'Hips');
  if (!hips || !sourceHip) throw new Error('Motion needs a Hips joint.');
  const rest = hips.position.clone();
  const sourceRestHeight = Math.max(.01, Math.abs(sourceHip.getWorldPosition(new Vector3()).y));
  const motion = sampleBindRelative(target, targetRoot, names, scene, clip, sourceHip);
  // Keep locomotion in place and retain only relative vertical movement. Non-root offsets remain the target's own.
  for (const track of motion.tracks) {
    if (!track.name.endsWith('.position')) continue;
    const firstY = track.values[1] ?? 0;
    const sourceHeight = sourceRestHeight;
    // Source files are often in centimetres (hips near 96) and ours in metres: a 1/100 scale is normal here.
    const scale = Math.max(.001, Math.min(10, Math.abs(rest.y) / sourceHeight));
    for (let i = 0; i < track.values.length; i += 3) {
      track.values[i] = rest.x; track.values[i + 1] = rest.y + ((track.values[i + 1] ?? 0) - firstY) * scale; track.values[i + 2] = rest.z;
    }
  }
  if (motion.tracks.some(track => Array.from(track.values).some(v => !Number.isFinite(v)))) throw new Error('Motion contains invalid transforms.');
  motion.name = name;
  // On this body's own legs: down to the floor when it never touches it, and never under it.
  return settleClip(motion, body);
}

const MOTION_FPS = 30;
/**
 * The child that continues each joint's chain, for lining up rest poses: the hips point up the spine, not to a leg
 * (rigs put the leg joints level with the hips or below them, which would tilt the whole pelvis).
 */
const CHAIN: Record<string, string> = { Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head',
  ...Object.fromEntries(['Left', 'Right'].flatMap(side => [[`${side}Shoulder`, `${side}Arm`], [`${side}Arm`, `${side}ForeArm`], [`${side}ForeArm`, `${side}Hand`],
    [`${side}Hand`, `${side}HandMiddle1`], [`${side}UpLeg`, `${side}Leg`], [`${side}Leg`, `${side}Foot`], [`${side}Foot`, `${side}ToeBase`]])) };
const worldQuat = (node: Object3D) => node.getWorldQuaternion(new Quaternion());
const worldPos = (node: Object3D) => node.getWorldPosition(new Vector3());

/**
 * Each target bone takes the source bone's change from its own rest pose (in world space), laid on the target's rest
 * pose after the two rest directions are aligned. Matching only the bone direction leaves the roll around the bone free,
 * which twists arms and shoulders when the two rigs use different bone axes; the bind-relative change keeps the roll.
 */
function sampleBindRelative(target: SkinnedMesh, targetRoot: Object3D, names: Record<string, string>, scene: Object3D, clip: AnimationClip, sourceHip: Object3D): AnimationClip {
  const byName = new Map<string, Object3D>();
  scene.traverse(node => { if (node.name) byName.set(node.name, node); });
  target.skeleton.pose(); targetRoot.updateMatrixWorld(true); scene.updateMatrixWorld(true);
  const depth = (node: Object3D | null): number => (node ? 1 + depth(node.parent) : 0);
  // Parents first, so each bone's parent pose is known when the bone is placed.
  const bones = [...target.skeleton.bones].sort((a, b) => depth(a) - depth(b));
  const parentOf = (bone: Bone) => (bones.includes(bone.parent as Bone) ? bone.parent as Bone : null);
  const rootParent = new Map(bones.filter(bone => !parentOf(bone)).map(bone => [bone, bone.parent ? worldQuat(bone.parent) : new Quaternion()]));
  const bindLocal = new Map(bones.map(bone => [bone, bone.quaternion.clone()]));
  const plan = bones.map(bone => {
    const source = byName.get(names[bone.name] ?? '');
    if (!source) return { bone, source: undefined, sourceBindInverse: new Quaternion(), aligned: new Quaternion() };
    // Rest alignment: turn the target's rest bone direction onto the source's rest bone direction.
    const next = CHAIN[canonicalBoneName(source.name)];
    const mapped = bone.children.filter(child => (child as Bone).isBone && byName.has(names[child.name] ?? ''));
    const targetChild = mapped.find(child => canonicalBoneName(names[child.name]!) === next) ?? mapped[0];
    const sourceChild = targetChild ? byName.get(names[targetChild.name]!) : undefined;
    const align = new Quaternion();
    if (targetChild && sourceChild) {
      const to = worldPos(sourceChild).sub(worldPos(source)), from = worldPos(targetChild).sub(worldPos(bone));
      if (to.lengthSq() > 1e-10 && from.lengthSq() > 1e-10) align.setFromUnitVectors(from.normalize(), to.normalize());
    }
    return { bone, source, sourceBindInverse: worldQuat(source).invert(), aligned: align.multiply(worldQuat(bone)) };
  });
  const mixer = new AnimationMixer(scene), action = mixer.clipAction(clip);
  action.setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.play();
  const count = Math.max(2, Math.round(clip.duration * MOTION_FPS) + 1);
  const times = Array.from({ length: count }, (_, i) => Math.min(clip.duration, i / MOTION_FPS));
  const values = new Map(plan.filter(p => p.source).map(p => [p.bone, [] as number[]]));
  const hipY: number[] = [];
  const world = new Map<Bone, Quaternion>(), delta = new Quaternion(), local = new Quaternion();
  for (const time of times) {
    mixer.setTime(time); scene.updateMatrixWorld(true);
    hipY.push(0, worldPos(sourceHip).y, 0);
    for (const { bone, source, sourceBindInverse, aligned } of plan) {
      const parent = parentOf(bone), parentWorld = parent ? world.get(parent)! : rootParent.get(bone)!;
      if (!source) { world.set(bone, parentWorld.clone().multiply(bindLocal.get(bone)!)); continue; }
      delta.copy(worldQuat(source)).multiply(sourceBindInverse);
      const next = delta.clone().multiply(aligned);
      world.set(bone, next);
      local.copy(parentWorld).invert().multiply(next);
      const out = values.get(bone)!, at = out.length;
      // Keep neighbouring keys on the same side so interpolation takes the short way.
      if (at && local.x * out[at - 4]! + local.y * out[at - 3]! + local.z * out[at - 2]! + local.w * out[at - 1]! < 0) local.set(-local.x, -local.y, -local.z, -local.w);
      out.push(local.x, local.y, local.z, local.w);
    }
  }
  mixer.stopAllAction(); mixer.uncacheRoot(scene);
  const tracks: KeyframeTrack[] = [...values].map(([bone, v]) => new QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, v));
  const hips = plan.find(p => p.source === sourceHip)?.bone;
  if (hips) tracks.push(new VectorKeyframeTrack(`${hips.name}.position`, times, hipY));
  return new AnimationClip(clip.name, clip.duration, tracks);
}
