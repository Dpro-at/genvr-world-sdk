import { AnimationClip, Bone, Box3, BufferAttribute, BufferGeometry, Group, LoadingManager, Matrix4, MeshStandardMaterial, Quaternion, Skeleton, SkinnedMesh, Vector3, type Material, type Object3D } from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { unifyMorphs } from '@genvr/runtime';
import { avatarDigest, USER_AVATAR_BYTES, UserAvatarMetadata, type UserAvatarAsset } from '../src/user-avatar-library';

const standard = (name: string) => name.replace(/^.*:/, '').replace(/^mixamorig\d*/i, '');
const required = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', ...['Left', 'Right'].flatMap(side => ['Shoulder', 'Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot'].map(part => side + part))];
const nameOf = (file: string) => file.replace(/\.(fbx|glb)$/i, '').slice(0, 150) || 'Imported avatar';

function validateGlb(data: ArrayBuffer) {
  const view = new DataView(data);
  if (data.byteLength < 24 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(8, true) !== data.byteLength) throw new Error('Invalid GLB file.');
  const length = view.getUint32(12, true);
  if (length > data.byteLength - 20) throw new Error('Invalid GLB JSON length.');
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 20, length)));
  if (json.buffers?.some((row: { uri?: string }) => row.uri) || json.images?.some((row: { uri?: string }) => row.uri && !row.uri.startsWith('data:'))) throw new Error('Use a self-contained GLB with embedded resources.');
}

/** Parses only files selected by the user; remote textures and arbitrary filesystem paths are never fetched. */
async function readScene(file: File, companions: readonly File[]): Promise<{ root: Group; clips: AnimationClip[]; release(): void }> {
  if (!/\.(fbx|glb)$/i.test(file.name) || file.size > 256 * 1024 * 1024 || file.size < 24) throw new Error('Choose FBX or GLB, up to 256 MB. Extract ZIP downloads first.');
  const urls: string[] = [], textures = new Map<string, File>();
  for (const companion of companions) {
    const name = companion.name.toLowerCase();
    if (textures.has(name) && textures.get(name) !== companion) throw new Error(`Duplicate companion filename: ${companion.name}. Import one character folder at a time.`);
    textures.set(name, companion);
  }
  const manager = new LoadingManager();
  manager.setURLModifier(url => {
    if (/^(data:|blob:)/i.test(url)) return url;
    const name = decodeURIComponent(url.split(/[\\/]/).at(-1)?.split('?')[0] ?? '').toLowerCase();
    const texture = textures.get(name);
    if (!texture && /normal/i.test(name)) { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1; const context = canvas.getContext('2d')!; context.fillStyle = '#8080ff'; context.fillRect(0, 0, 1, 1); return canvas.toDataURL(); }
    if (!texture) throw new Error(`Missing local texture: ${name}. Select its texture files with the character.`);
    const objectUrl = URL.createObjectURL(texture); urls.push(objectUrl); return objectUrl;
  });
  const release = () => urls.forEach(url => URL.revokeObjectURL(url));
  try {
    const data = await file.arrayBuffer();
    if (/\.glb$/i.test(file.name)) {
      validateGlb(data);
      const gltf = await new GLTFLoader(manager).parseAsync(data, '');
      return { root: gltf.scene, clips: gltf.animations, release };
    }
    // FBX textures can finish loading after parse() returns.
    let loaded = Promise.resolve();
    manager.onStart = () => { loaded = new Promise<void>((resolve, reject) => { manager.onLoad = () => resolve(); manager.onError = url => reject(new Error(`Texture could not be loaded: ${url.split('/').at(-1)}`)); }); };
    const root = new FBXLoader(manager).parse(data, '');
    await loaded;
    return { root, clips: root.animations, release };
  } catch (error) { release(); throw error; }
}

/** Native clips start from a T-pose. Arms hanging clearly below the shoulder line (an A-pose bind) are turned
 * straight out before the bind is baked; arms already near T are left exactly as they are. */
function straightenArms(byName: Map<string, Bone>): 't-from-a' | undefined {
  const at = (bone: Bone) => bone.getWorldPosition(new Vector3());
  let changed = false;
  for (const side of ['Left', 'Right']) {
    const arm = byName.get(side + 'Arm')!, fore = byName.get(side + 'ForeArm')!, hand = byName.get(side + 'Hand')!;
    const out = at(arm).sub(at(byName.get('Neck')!)); out.y = 0;
    if (out.lengthSq() < 1e-12) continue;
    out.normalize();
    const upper = at(fore).sub(at(arm));
    if (upper.lengthSq() < 1e-12 || Math.asin(Math.min(1, -upper.normalize().y)) < 25 * Math.PI / 180) continue;
    for (const [bone, child] of [[arm, fore], [fore, hand]] as const) {
      const dir = at(child).sub(at(bone));
      if (dir.lengthSq() < 1e-12) continue;
      const turn = new Quaternion().setFromUnitVectors(dir.normalize(), out);
      const parent = bone.parent ? bone.parent.getWorldQuaternion(new Quaternion()) : new Quaternion();
      bone.quaternion.copy(parent.invert().multiply(turn.multiply(bone.getWorldQuaternion(new Quaternion()))));
      bone.updateMatrixWorld(true);
    }
    changed = true;
  }
  return changed ? 't-from-a' : undefined;
}

/** Canonical world-aligned bind axes let native clips and imported motion share the existing runtime. */
export function canonicalCharacter(root: Group): { root: Group; joints: NonNullable<UserAvatarMetadata['joints']>; height: number; restPose?: 't-from-a' } {
  const meshes: SkinnedMesh[] = [];
  root.traverse(node => { if ((node as SkinnedMesh).isSkinnedMesh) meshes.push(node as SkinnedMesh); });
  if (!meshes.length) throw new Error('No rigged character found. Download With Skin.');
  for (const mesh of meshes) mesh.skeleton.pose();
  root.updateMatrixWorld(true);
  const source: Bone[] = [], byName = new Map<string, Bone>(), influence = new Map<Bone, number>();
  for (const mesh of meshes) { const indices = mesh.geometry.getAttribute('skinIndex'), weights = mesh.geometry.getAttribute('skinWeight'); for (let i = 0; i < indices.count; i++) for (let k = 0; k < 4; k++) { const bone = mesh.skeleton.bones[indices.getComponent(i, k)]; if (bone) influence.set(bone, (influence.get(bone) ?? 0) + weights.getComponent(i, k)); } }
  root.traverse(node => {
    const bone = node as Bone;
    if (!bone.isBone) return;
    const name = standard(bone.name);
    const existing = byName.get(name);
    if (existing) {
      // Clothing sub-rigs can contain coincident aliases of the main skeleton's bones.
      if ((influence.get(bone) ?? 0) > (influence.get(existing) ?? 0)) { byName.set(name, bone); source[source.indexOf(existing)] = bone; }
      return;
    }
    byName.set(name, bone); source.push(bone);
  });
  if (source.length > 128 || required.some(name => !byName.has(name))) throw new Error('Character needs a standard humanoid skeleton with no more than 128 joints.');
  const restPose = straightenArms(byName);
  root.updateMatrixWorld(true);
  const bounds = new Box3().makeEmpty(), point = new Vector3();
  for (const mesh of meshes) {
    mesh.skeleton.update();
    const positions = mesh.geometry.getAttribute('position');
    if (positions.count > 500000) throw new Error('Character mesh exceeds 500000 vertices.');
    for (let i = 0; i < positions.count; i++) { point.fromBufferAttribute(positions, i); mesh.applyBoneTransform(i, point).applyMatrix4(mesh.matrixWorld); bounds.expandByPoint(point); }
  }
  const rawHeight = bounds.max.y - bounds.min.y;
  if (!Number.isFinite(rawHeight) || rawHeight <= 0) throw new Error('Character bounds are invalid.');
  const height = 1.8, scale = height / rawHeight;
  if (height < .3 || height > 4) throw new Error('Character must be 0.3–4 metres tall after centimetre conversion.');
  const origin = new Vector3((bounds.min.x + bounds.max.x) / 2, bounds.min.y, (bounds.min.z + bounds.max.z) / 2);
  const joints = source.map(bone => {
    let parent: Object3D | null = bone.parent;
    while (parent && (!(parent as Bone).isBone || standard(parent.name) === standard(bone.name))) parent = parent.parent;
    const at = bone.getWorldPosition(new Vector3()).sub(origin).multiplyScalar(scale);
    return { name: standard(bone.name), parent: parent ? standard(parent.name) : null, at: at.toArray() as [number, number, number] };
  });
  if (joints.filter(joint => joint.parent === null).length !== 1 || joints[0]?.name !== 'Hips') throw new Error('Character needs a single Hips root.');
  const bones = joints.map(joint => { const bone = new Bone(); bone.name = 'mixamorig' + joint.name; return bone; });
  const ids = new Map(joints.map((joint, i) => [joint.name, i]));
  joints.forEach((joint, i) => {
    const parent = joint.parent ? ids.get(joint.parent) : undefined;
    bones[i]!.position.fromArray(joint.at);
    if (parent !== undefined) { bones[i]!.position.sub(new Vector3(...joints[parent]!.at)); bones[parent]!.add(bones[i]!); }
  });
  const materials: Material[] = [], geometries: BufferGeometry[] = [], groups: Array<{ start: number; count: number; material: number }> = [], shapes: string[][] = [];
  const shifted = new Vector3();
  let start = 0;
  for (const mesh of meshes) {
    const geometry = mesh.geometry.clone(), positions = geometry.getAttribute('position');
    // Face shapes (FACE-IMPORT): each offset goes through the same bind pose and scale as its vertex.
    const names = Object.entries(mesh.morphTargetDictionary ?? {}).sort((a, b) => a[1] - b[1]).map(([name]) => name);
    const offsets = names.length ? (geometry.morphAttributes.position ?? []).slice(0, names.length) as BufferAttribute[] : [];
    const relative = geometry.morphTargetsRelative;
    const moved = offsets.map(attribute => new BufferAttribute(new Float32Array(attribute.count * 3), 3));
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i);
      offsets.forEach((attribute, k) => {
        shifted.fromBufferAttribute(attribute, i); if (relative) shifted.add(point);
        mesh.applyBoneTransform(i, shifted).applyMatrix4(mesh.matrixWorld).sub(origin).multiplyScalar(scale);
        moved[k]!.setXYZ(i, shifted.x, shifted.y, shifted.z);
      });
      mesh.applyBoneTransform(i, point).applyMatrix4(mesh.matrixWorld).sub(origin).multiplyScalar(scale);
      if (!point.toArray().every(Number.isFinite)) throw new Error('Character contains invalid positions.');
      positions.setXYZ(i, point.x, point.y, point.z);
      for (const attribute of moved) attribute.setXYZ(i, attribute.getX(i) - point.x, attribute.getY(i) - point.y, attribute.getZ(i) - point.z);
    }
    const indices = geometry.getAttribute('skinIndex'), weights = geometry.getAttribute('skinWeight');
    const remapped = new Uint16Array(indices.count * 4), normalized = new Float32Array(indices.count * 4);
    for (let i = 0; i < indices.count; i++) {
      let total = 0;
      for (let k = 0; k < 4; k++) { const weight = weights.getComponent(i, k); if (!Number.isFinite(weight) || weight < 0) throw new Error('Invalid skin weights.'); total += weight; remapped[i * 4 + k] = ids.get(standard(mesh.skeleton.bones[indices.getComponent(i, k)]?.name ?? '')) ?? 0; normalized[i * 4 + k] = weight; }
      for (let k = 0; k < 4; k++) normalized[i * 4 + k] = total ? normalized[i * 4 + k]! / total : k === 0 ? 1 : 0;
    }
    geometry.setAttribute('skinIndex', new BufferAttribute(remapped, 4)); geometry.setAttribute('skinWeight', new BufferAttribute(normalized, 4));
    if (!geometry.getAttribute('uv')) geometry.setAttribute('uv', new BufferAttribute(new Float32Array(positions.count * 2), 2));
    for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(name)) geometry.deleteAttribute(name);
    // Face shapes stay as offsets in the new space; all parts get the same list below so they merge.
    geometry.morphAttributes = moved.length ? { position: moved } : {}; geometry.morphTargetsRelative = true; geometry.computeVertexNormals();
    if (moved.some(attribute => !Array.from(attribute.array as Float32Array).every(Number.isFinite))) throw new Error('Character contains invalid face shapes.');
    if (!geometry.index) geometry.setIndex(Array.from({ length: positions.count }, (_, i) => i));
    const own = Array.isArray(mesh.material) ? mesh.material : [mesh.material], materialOffset = materials.length;
    for (const original of own) {
      const old = original as MeshStandardMaterial;
      const material = new MeshStandardMaterial({ color: old.color ?? 0xffffff, map: old.map ?? null, normalMap: old.normalMap ?? null, roughnessMap: old.roughnessMap ?? null, metalnessMap: old.metalnessMap ?? null, roughness: old.roughness ?? .8, metalness: old.metalness ?? 0, transparent: old.transparent, opacity: old.opacity, alphaTest: old.alphaTest, side: old.side });
      materials.push(material);
    }
    for (const group of geometry.groups.length ? geometry.groups : [{ start: 0, count: geometry.index!.count, materialIndex: 0 }]) groups.push({ start: start + group.start, count: group.count, material: materialOffset + (group.materialIndex ?? 0) });
    start += geometry.index!.count; geometry.clearGroups(); geometries.push(geometry); shapes.push(names.slice(0, moved.length));
  }
  const shapeNames = unifyMorphs(geometries.map((part, i) => ({ geometry: part, names: shapes[i]! })));
  const geometry = mergeGeometries(geometries, false);
  // Merging makes new shape attributes without their names, and without the offsets flag.
  geometry?.morphAttributes.position?.forEach((attribute, i) => { attribute.name = shapeNames[i] ?? attribute.name; });
  if (geometry) geometry.morphTargetsRelative = true;
  if (!geometry) throw new Error('Character mesh parts could not be combined.');
  for (const part of geometries) part.dispose();
  for (const group of groups) geometry.addGroup(group.start, group.count, group.material);
  const character = new SkinnedMesh(geometry, materials); character.name = 'ImportedCharacter';
  // Shape names by index, so the export keeps them (targetNames) and the face can find them by name.
  character.updateMorphTargets(); character.add(bones[0]!); character.updateMatrixWorld(true); character.bind(new Skeleton(bones), new Matrix4());
  const out = new Group(); out.add(character); return { root: out, joints, height, ...(restPose ? { restPose } : {}) };
}

async function glb(root: Group, clips: AnimationClip[] = []): Promise<ArrayBuffer> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const data = await Promise.race([new GLTFExporter().parseAsync(root, { binary: true, animations: clips, onlyVisible: false, maxTextureSize: 1024 }), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Conversion timed out. Check free disk space and try again.')), 20000); })]).finally(() => { if (timer) clearTimeout(timer); });
  if (!(data instanceof ArrayBuffer) || data.byteLength > USER_AVATAR_BYTES) throw new Error('Converted GLB exceeds 64 MB.');
  return data;
}

/** Character files can yield one character and several independently reusable motion entries. */
export async function importUserAvatar(file: File, mode: 'character' | 'motion', companions: readonly File[] = [], includeMotions = true): Promise<UserAvatarAsset[]> {
  const parsed = await readScene(file, companions), result: UserAvatarAsset[] = [];
  try {
    const add = async (kind: 'character' | 'motion', name: string, data: ArrayBuffer, extra: Partial<UserAvatarMetadata>) => {
      const sha256 = await avatarDigest(data);
      result.push({ data, metadata: UserAvatarMetadata.parse({ id: `user.mixamo.${sha256}.${kind}`, kind, name, originalFile: file.name, sha256, importedAt: new Date().toISOString(), source: 'user-import', provider: 'mixamo', sourcePage: 'https://www.mixamo.com/', bundled: false, ...extra }) });
    };
    // Export source motion before the bind-pose conversion changes any source bones.
    if (parsed.clips.length > 100) throw new Error('A file may contain at most 100 clips.');
    for (const original of includeMotions ? parsed.clips : []) {
      // Source exports may include an empty zero-length Take 001 alongside the real motion.
      if (!original.tracks.length && original.duration === 0) continue;
      if (!Number.isFinite(original.duration) || original.duration <= 0 || original.duration > 120) throw new Error(`Motion ${original.name} has invalid duration (${original.duration}s); maximum is 120 seconds.`);
      const root = parsed.root.clone(true);
      const remove: Object3D[] = []; root.traverse(node => { if ((node as SkinnedMesh).isMesh) remove.push(node); });
      for (const node of remove) { for (const child of [...node.children]) node.parent?.attach(child); node.removeFromParent(); }
      const clip = original.clone();
      // Morph-only tracks need a mesh and cannot be reused as skeleton motion.
      clip.tracks = clip.tracks.filter(track => /\.(quaternion|position|scale)$/.test(track.name));
      if (!clip.tracks.length) continue;
      const data = await glb(root, [clip]);
      if (data.byteLength > 16 * 1024 * 1024) throw new Error('Converted motion exceeds 16 MB.');
      await add('motion', `${nameOf(file.name)} · ${original.name || 'Motion'}`.slice(0, 150), data, { duration: original.duration });
    }
    let hasMesh = false; parsed.root.traverse(node => { if ((node as SkinnedMesh).isSkinnedMesh) hasMesh = true; });
    if (mode === 'character' && hasMesh) {
      const character = canonicalCharacter(parsed.root);
      await add('character', nameOf(file.name), await glb(character.root), { joints: character.joints, height: character.height, ...(character.restPose ? { restPose: character.restPose } : {}) });
    } else if (!result.length) throw new Error('No rigged character or skeletal animation found in this file.');
    return result;
  } finally {
    parsed.root.traverse(node => { const mesh = node as SkinnedMesh; mesh.geometry?.dispose(); for (const material of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) { for (const value of Object.values(material)) if (value && typeof value === 'object' && 'isTexture' in value) (value as { dispose(): void }).dispose(); material.dispose(); } });
    parsed.release();
  }
}
