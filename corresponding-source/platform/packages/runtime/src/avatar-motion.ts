import { canonicalBoneName } from './avatar-rig-compatibility.js';
import { AnimationClip, Object3D, Skeleton, SkinnedMesh, Vector3, Matrix4, Quaternion, type Bone } from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { findBody } from '@genvr/core-library';
import { clone, retargetClip } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GenvrAvatar } from './avatar.js';

/** Import supplied motion data without downloading a model or changing the avatar's geometry. */
export async function retargetAvatarMotion(data: ArrayBuffer, avatar: { root: Object3D; body: GenvrAvatar['body'] }, name: string): Promise<AnimationClip> {
  if (data.byteLength > 16 * 1024 * 1024) throw new Error('Motion file exceeds 16 MB.');
  if (data.byteLength < 24 || new DataView(data).getUint32(0, true) !== 0x46546c67) throw new Error('Expected a motion-only GLB file.');
  const jsonSize = new DataView(data).getUint32(12, true);
  const document = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 20, jsonSize)));
  if (document.meshes?.length || document.images?.length || document.buffers?.some((buffer: { uri?: string }) => buffer.uri)) throw new Error('Use a self-contained motion-only GLB file.');
  const gltf = await new GLTFLoader().parseAsync(data, '');
  const scene = gltf.scene, clips = gltf.animations;
  const clip = clips[0];
  if (!clip || clip.duration <= 0 || clip.duration > 120) throw new Error('Motion needs a clip of at most two minutes.');
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
  // Imported rigs point their local Y along limbs; our rig keeps world-aligned bind axes.
  // Match those axes before copying world rotations, otherwise legs and arms fold onto the torso.
  target.skeleton.pose();targetRoot.updateMatrixWorld(true);
  const localOffsets: Record<string, Matrix4> = {};
  for (const bone of target.skeleton.bones) {
    const sourceBone = nodes.find(node => node.name === names[bone.name]);
    if (!sourceBone) continue;
    const targetChild = bone.children.find(child => (child as Bone).isBone && names[child.name]);
    const sourceChild = targetChild ? nodes.find(node => node.name === names[targetChild.name]) : sourceBone.children.find(child => child.position.lengthSq() > 1e-8);
    const targetAxis = (targetChild?.position ?? bone.position).clone();
    const sourceAxis = sourceChild?.position.clone();
    if (!sourceAxis || targetAxis.lengthSq() < 1e-8 || sourceAxis.lengthSq() < 1e-8) continue;
    const offset = new Quaternion().setFromUnitVectors(targetAxis.normalize(), sourceAxis.normalize());
    localOffsets[bone.name] = new Matrix4().makeRotationFromQuaternion(offset);
  }
  const rest = hips.position.clone();
  const sourceRestHeight = Math.max(.01, Math.abs(sourceHip.getWorldPosition(new Vector3()).y));
  const source = Object.assign(scene, { skeleton: new Skeleton(nodes as Bone[]) });
  // The implementation accepts localOffsets; the upstream clip-options declaration omits it.
  const options = { hip: sourceHip.name, names, fps: 30, hipInfluence: new Vector3(0, 1, 0), localOffsets };
  const motion = retargetClip(target, source, clip, options);
  // The avatar mixer targets its root group; address named bones directly, not a mesh-only skeleton path.
  for (const track of motion.tracks) track.name = track.name.replace(/^\.bones\[([^\]]+)\]/, '$1');
  // Keep locomotion in place and retain only relative vertical movement. Non-root offsets remain the target's own.
  for (const track of motion.tracks) {
    if (!track.name.endsWith('.position')) continue;
    const firstY = track.values[1] ?? 0;
    const sourceHeight = sourceRestHeight;
    const scale = Math.max(.1, Math.min(10, Math.abs(rest.y) / sourceHeight));
    for (let i = 0; i < track.values.length; i += 3) {
      track.values[i] = rest.x; track.values[i + 1] = rest.y + ((track.values[i + 1] ?? 0) - firstY) * scale; track.values[i + 2] = rest.z;
    }
  }
  if (motion.tracks.some(track => Array.from(track.values).some(v => !Number.isFinite(v)))) throw new Error('Motion contains invalid transforms.');
  motion.name = name;
  return motion;
}
