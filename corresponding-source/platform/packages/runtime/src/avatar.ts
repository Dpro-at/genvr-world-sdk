import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LEGACY_BONE_PREFIX } from './avatar-rig-compatibility.js';
import { createRobotFace } from './robot-face.js';
import { createToeRoll } from './toe-roll.js';
import { LAB_GROUND_MOVES } from './lab/sim.js';
import { applyAvatarExpression, EXPRESSION_KEYS, type AvatarExpression } from './avatar-expression.js';
import {
  AnimationClip,
  AnimationMixer,
  Bone,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  Euler,
  Group,
  LoopOnce,
  Matrix3,
  Matrix4,
  MeshStandardMaterial,
  MeshStandardNodeMaterial,
  Quaternion,
  QuaternionKeyframeTrack,
  Skeleton,
  SkinnedMesh,
  TSL,
  Vector3,
  VectorKeyframeTrack,
  type Material,
  type Texture,
} from 'three/webgpu';
import type { AvatarBodyType, AvatarScale, BodyId, MouthShape } from '@genvr/contracts';
import {
  CORE_ANIMATIONS,
  findBody,
  findSkinMaterial,
  lookParts,
  sizedBody,
  type AnimationItem,
  type AvatarBody,
  RELAXED_GRIP,
  type Key,
  type Pose,
  type RigBone,
  type V3,
  planarAngle,
  isItemBodyId,
} from '@genvr/core-library';
import { createGltfLoader } from './gltf.js';
import { SpringBones } from './spring-bones.js';
import { createMouth, MOUTH_GAP, type MouthMesh } from './mouth.js';
import { applyMouthMorphs, mouthMorphs, type MouthMorphs } from './visemes.js';
import { useDualQuaternionSkinning } from './character/dual-quaternion-skinning.js';
import {
  fitHumanProxy,
  humanHairMaterial,
  loadHumanProxy,
  setHumanHairColor,
  type HumanProxy,
} from './character/human/proxy.js';
import type { HumanData } from './character/human/format.js';
import {
  humanDetail,
  humanGeometry,
  humanMaterial,
  humanOutlineMaterial,
  loadHumanData,
  OUTLINE,
  setHumanColors,
  setHumanMouth,
} from './character/human/body.js';
import type { FaceUniforms } from './character/human/face.js';

/**
 * The Genvr avatar (tasks P2-05, P2-20, P2-22): blocky characters built from the Core Library
 * body types, each with its own skeleton: Classic (Roblox-like, 15 joints, the main avatar) and
 * Starter (the first test body on the standard 52-bone humanoid rig). The rest pose is a T-pose
 * facing +z with every bone's axes aligned to the world, feet at y = 0. Changing the body type
 * rebuilds the skeleton inside the same scene objects.
 */

/** The standard 52-bone humanoid rig: the Starter body's joints. */
export const STANDARD_BONES: readonly string[] = findBody('starter').joints.map((joint) => joint.name);
export type StandardBone = string;
export const bonePrefix = LEGACY_BONE_PREFIX;

/** Colors of the avatar's parts (hex strings), the body type, and the worn Core items. */
export interface AvatarLook {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  shoes: string;
  /** Classic when missing (decision 73). */
  body?: BodyId;
  /** Height, width, and head size (normal when missing). */
  scale?: AvatarScale;
  wear?: readonly string[];
  /** A fantasy skin material (Core Library `SKIN_MATERIALS` id) on a generated body. */
  skinMaterial?: string | undefined;
  /** Anime Shape of a generated body's face, 0..1. */
  animeShape?: number | undefined;
  /** Muscle and fat of a generated body (contracts `BUILD_KEYS`; absent keys 0). */
  build?: Readonly<Record<string, number>> | undefined;
  /** Hair, eyebrows and beard of a generated body (contracts `HumanHair`, asset ids such as `hair.short02`). */
  humanHair?: Readonly<{ head?: string | undefined; brows?: string | undefined; beard?: string | undefined }> | undefined;
}

export const DEFAULT_LOOK: AvatarLook = {
  skin: '#f2c49b',
  hair: '#3b2a20',
  shirt: '#6d4aff',
  pants: '#2b2d42',
  shoes: '#f2f2ee',
};

const nodeName = (body: AvatarBody, joint: string) => `${body.bonePrefix}${joint}`;

/**
 * Where a right hand holds things (P9-12): the bone that carries the hand, the palm in that bone's
 * own space, and the direction from the wrist to the fingers (bone space; bones rest unrotated, so
 * this is the T-pose arm, or the hanging arm of a flat body).
 */
export interface HandGrip {
  bone: Bone;
  palm: Vector3;
  along: Vector3;
}

/** How far past the wrist of a rigged hand (toward the knuckles) the palm is. */
const PALM_PAST_WRIST = 0.7;

/**
 * The right hand of a body and its skeleton: the joint that carries the hand (the body's fit for
 * the standard `RightHand` bone, else the joint that bone moves), found by its node name so rigs
 * with a bone prefix (imported mesh bodies) work too. The palm is the middle of the hand's block
 * (the fit box, or the hand joint's parts); rigged hands without blocks hold a little past the
 * wrist toward the knuckles. Null when the body has no right hand.
 */
export function rightHandGrip(body: AvatarBody, skeleton: Skeleton): HandGrip | null {
  const fit = body.fit.RightHand;
  const joint =
    body.joints.find((j) => j.name === fit?.joint) ??
    body.joints.find((j) => body.animation[j.name]?.includes('RightHand'));
  if (!joint) return null;
  const bone = skeleton.getBoneByName(nodeName(body, joint.name));
  if (!bone) return null;
  const at = new Vector3(...joint.at);
  const parent = body.joints.find((j) => j.name === joint.parent);
  const children = body.joints.filter((j) => j.parent === joint.name);
  // From the wrist toward the fingers: the knuckles, or the way the arm runs into this joint.
  const along = new Vector3();
  for (const child of children) along.add(new Vector3(...child.at).sub(at).divideScalar(children.length));
  const knuckles = along.length();
  if (knuckles === 0 && parent) along.subVectors(at, new Vector3(...parent.at));
  if (along.lengthSq() === 0) along.set(-1, 0, 0);
  along.normalize();
  const parts = body.parts.filter((part) => part.joint === joint.name);
  let palm: Vector3;
  if (fit) palm = new Vector3(...fit.box.center).sub(at);
  else if (parts.length > 0) {
    palm = new Vector3();
    for (const part of parts) palm.add(new Vector3(...part.center).sub(at).divideScalar(parts.length));
  } else palm = along.clone().multiplyScalar(knuckles * PALM_PAST_WRIST);
  return { bone, palm, along };
}

/** How far the top of a rigged head is above its `Head` joint (the joint sits at the skull's base). */
const RIGGED_HEAD = 0.22;

/** The top of a body's head above its feet at rest: its highest block, or above a rigged head joint. */
export function headTopOf(body: AvatarBody): number {
  if (body.parts.length > 0) return Math.max(...body.parts.map((part) => part.center[1] + part.size[1] / 2));
  const head = body.joints.find((joint) => joint.name === 'Head');
  return (head?.at[1] ?? 1.6) + RIGGED_HEAD;
}

/** Red the whole avatar turns for a moment when hit (P9-12), mixed into its own glow. */
const FLASH_RED = new Color(0xff2020);

type Glowing = Material & { emissive?: Color; emissiveIntensity?: number; emissiveMap?: Texture | null };

/**
 * The red of a hit (P9-12) on an avatar's own material: its glow turns red and fully on (a model's
 * glow may be off, `emissiveIntensity` 0, or come from a dark glow picture, which is set aside
 * while red). Amount 0 puts back exactly what the material had; a material swapped out mid-flash
 * gets its own glow back too. Nothing new is made per hit (a material set aside its glow picture
 * once is ready for the next hit).
 */
export class HitTint {
  readonly #own = new WeakMap<Material, { emissive: Color; intensity: number; map: Texture | null }>();
  #tinted: Glowing | null = null;

  apply(material: Material, amount: number): void {
    const next = material as Glowing;
    if (this.#tinted && this.#tinted !== next) this.#restore(this.#tinted);
    this.#tinted = null;
    if (!next.emissive) return;
    let own = this.#own.get(next);
    if (!own) {
      own = {
        emissive: next.emissive.clone(),
        intensity: next.emissiveIntensity ?? 1,
        map: next.emissiveMap ?? null,
      };
      this.#own.set(next, own);
    }
    if (amount <= 0) {
      this.#restore(next);
      return;
    }
    next.emissive.copy(own.emissive).lerp(FLASH_RED, amount);
    if (next.emissiveIntensity !== undefined) next.emissiveIntensity = Math.max(own.intensity, 1);
    if (next.emissiveMap) {
      next.emissiveMap = null;
      next.needsUpdate = true;
    }
    this.#tinted = next;
  }

  #restore(material: Glowing): void {
    const own = this.#own.get(material);
    if (!own || !material.emissive) return;
    material.emissive.copy(own.emissive);
    if (material.emissiveIntensity !== undefined) material.emissiveIntensity = own.intensity;
    if (own.map && material.emissiveMap !== own.map) {
      material.emissiveMap = own.map;
      material.needsUpdate = true;
    }
  }
}

/** Seconds a knocked-out avatar takes to fall and fade away (P9-12). */
export const DOWN_SECONDS = 1.2;
/** Height of the chest pivot of a body lying on the ground (m). */
const LYING_CHEST = 0.2;

/**
 * The knocked-out look at `amount` (0 = standing, 1 = gone; P9-12): the body falls backwards
 * around the chest in the first part, lying on the ground, then fades out.
 */
export function downLook(amount: number): { tilt: number; drop: number; opacity: number } {
  const a = Math.min(1, Math.max(0, amount));
  const fall = Math.min(1, a / 0.45) ** 2;
  // Fully there until 0.55, gone at 1.
  const opacity = Math.min(1, (1 - a) / 0.45);
  return { tilt: (-fall * Math.PI) / 2, drop: fall * (CHEST_HEIGHT - LYING_CHEST), opacity };
}

/**
 * The fade of a knocked-out avatar on its own material: see-through while fading, and exactly its
 * own `transparent` and `opacity` back at 1 (a model's material may be see-through by design).
 */
export class FadeLook {
  readonly #own = new WeakMap<Material, { transparent: boolean; opacity: number }>();
  #faded: Material | null = null;

  apply(material: Material, opacity: number): void {
    if (this.#faded && this.#faded !== material) this.#restore(this.#faded);
    this.#faded = null;
    let own = this.#own.get(material);
    if (!own) {
      own = { transparent: material.transparent, opacity: material.opacity };
      this.#own.set(material, own);
    }
    if (opacity >= 1) {
      this.#restore(material);
      return;
    }
    if (!material.transparent) {
      material.transparent = true;
      material.needsUpdate = true;
    }
    material.opacity = own.opacity * opacity;
    this.#faded = material;
  }

  #restore(material: Material): void {
    const own = this.#own.get(material);
    if (!own) return;
    if (material.transparent !== own.transparent) {
      material.transparent = own.transparent;
      material.needsUpdate = true;
    }
    material.opacity = own.opacity;
  }
}

/** Edge of the small cubes an avatar is drawn with in cube looks (P2-26), before fitting a part. */
export const AVATAR_CUBE = 0.1;

const {
  abs,
  attribute,
  dot,
  float,
  floor,
  fract,
  min,
  mix,
  normalGeometry,
  positionGeometry,
  sin,
  step,
  vec3,
  vertexColor,
} = TSL;

/**
 * The avatar drawn as small cubes (Voxel places, decision 104): every body part is split into
 * cells of about AVATAR_CUBE, fitted to the part's own edges, each a little lighter or darker than
 * its neighbors, with a faint line between them. Only the material changes, so the skeleton and
 * animations are the same as everywhere.
 */
function cubeMaterial(): Material {
  const material = new MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0, flatShading: true });
  const cell = positionGeometry.sub(attribute('cellOrigin', 'vec3')).div(attribute('cellSize', 'vec3'));
  const index = floor(cell);
  // Cells along a face: the axis the face looks along does not split it.
  const across = vec3(1).sub(abs(normalGeometry));
  const random = fract(sin(dot(index, vec3(12.9898, 78.233, 37.719))).mul(43758.5453));
  const tint = float(1).add(random.sub(0.5).mul(0.16));
  const edge = min(fract(cell), vec3(1).sub(fract(cell)));
  // Distance to the nearest line between cells on this face (faces ignore the axis they look along).
  const near = min(min(mix(1, edge.x, across.x), mix(1, edge.y, across.y)), mix(1, edge.z, across.z));
  const line = mix(0.85, 1, step(0.07, near));
  material.colorNode = vertexColor().mul(tint).mul(line);
  return material;
}

/** One skinned geometry for the whole body (one draw call); every vertex has a single bone. */
function bodyGeometry(look: AvatarLook, body: AvatarBody): BufferGeometry {
  const index = new Map(body.joints.map((joint, i) => [joint.name, i]));
  const positions: number[] = [];
  const normals: number[] = [];
  const vertexColors: number[] = [];
  const skinIndex: number[] = [];
  const skinWeight: number[] = [];
  const indices: number[] = [];
  // Where each part's cells start and how big they are (cube looks fit whole cells to a part).
  const cellOrigin: number[] = [];
  const cellSize: number[] = [];
  // Block parts exist only on Genvr's own bodies (an uploaded body is a mesh, with none). The body shown can be a
  // stand-in for the look's body (Classic while a mesh body loads), so its own id is used.
  if (isItemBodyId(body.id)) return new BufferGeometry();
  for (const part of lookParts({ ...look, body: body.id, ...(body.scale ? { scale: body.scale } : {}) })) {
    // The mouth is drawn as its own surface with the nine shapes (lip sync, P2-44); 2D bodies keep their block.
    if (part.face === 'mouth' && !body.flat) continue;
    const bone = index.get(part.joint);
    if (bone === undefined) continue;
    const box = new BoxGeometry(...part.size);
    box.translate(...part.center);
    const base = positions.length / 3;
    const p = box.getAttribute('position');
    const n = box.getAttribute('normal');
    const color = new Color(part.color);
    const size = part.size.map((s) => s / Math.max(1, Math.round(s / AVATAR_CUBE)));
    const origin = part.size.map((s, axis) => part.center[axis]! - s / 2);
    for (let i = 0; i < p.count; i += 1) {
      cellOrigin.push(...origin);
      cellSize.push(...size);
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
      vertexColors.push(color.r, color.g, color.b);
      skinIndex.push(bone, 0, 0, 0);
      skinWeight.push(1, 0, 0, 0);
    }
    const boxIndex = box.getIndex()!;
    for (let i = 0; i < boxIndex.count; i += 1) indices.push(base + boxIndex.getX(i));
    box.dispose();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(vertexColors), 3));
  geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(skinIndex), 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(new Float32Array(skinWeight), 4));
  geometry.setAttribute('cellOrigin', new BufferAttribute(new Float32Array(cellOrigin), 3));
  geometry.setAttribute('cellSize', new BufferAttribute(new Float32Array(cellSize), 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/** The body's bones in joint order, parented and placed at their rest positions. */
function buildSkeleton(body: AvatarBody): { root: Bone; skeleton: Skeleton } {
  const byName = new Map<string, { bone: Bone; at: readonly number[] }>();
  const bones = body.joints.map((joint) => {
    const bone = new Bone();
    bone.name = nodeName(body, joint.name);
    const parent = joint.parent ? byName.get(joint.parent) : undefined;
    if (parent) {
      bone.position.set(
        joint.at[0] - parent.at[0]!,
        joint.at[1] - parent.at[1]!,
        joint.at[2] - parent.at[2]!,
      );
      parent.bone.add(bone);
    } else {
      bone.position.set(...joint.at);
    }
    byName.set(joint.name, { bone, at: joint.at });
    return bone;
  });
  return { root: bones[0]!, skeleton: new Skeleton(bones) };
}

export interface GenvrAvatar {
  /** Add this to the scene; its position is the feet, rotation.y the facing. */
  readonly root: Group;
  /** Tilts the whole body (swimming) around the chest without changing the facing. */
  readonly pose: Group;
  readonly mesh: SkinnedMesh;
  /** The current body type's skeleton and clips (they change with the body type). */
  readonly skeleton: Skeleton;
  readonly clips: AnimationClip[];
  /** The worn body: a Genvr body, or a creator's uploaded body (its item id). */
  readonly body: AvatarBody['id'];
  /**
   * Changes colors, worn items, body type, and size at once. Returns true when the skeleton was
   * replaced (another body type or size): animators must bind to the new clips then.
   */
  setLook(look: AvatarLook): boolean;
  /** Draws the avatar as small cubes (Voxel places) or with smooth blocks. */
  setCubes(cubes: boolean): void;
  /** Swings hair, coat panels, and tassels (bodies with springs); call after the clips each frame. */
  updateSprings(delta: number): void;
  /**
   * Shows a mouth shape while the avatar speaks (lip sync, P2-44); `X` is at rest. Block bodies draw it, mesh bodies
   * show it through their mouth blend shapes; bodies without either (2D bodies for now) ignore it.
   */
  setMouth(shape: MouthShape): void;
  readonly expressionSupported: boolean;
  setExpression(expression: AvatarExpression): void;
  /** A world point the eyes follow (the camera, a speaker); null looks straight ahead. Screen-face bodies only. */
  setGazeTarget(point: Vector3 | null): void;
  updateExpression(delta: number): void;
  /** The mouth shape shown now (`X` at rest, and for bodies that cannot show one). */
  readonly mouth: MouthShape;
  /** Height of the top of the head above the feet at rest (m); follows the body type. */
  readonly headTop: number;
  /** Where the right hand holds things (null for bodies without a right arm); follows the body type. */
  readonly rightHand: HandGrip | null;
  /**
   * Tints the whole avatar red by `amount` (0 = its own colors, 1 = full red; P9-12 hits). Changes
   * the avatar's own material only, so nothing new is made per hit and nothing is drawn twice.
   */
  setFlash(amount: number): void;
  /**
   * Level of detail of a generated body: `full` near the camera, `lite` far away and on phones (the same body and
   * skeleton with fewer triangles). Other bodies ignore it.
   */
  setDetail(detail: 'full' | 'lite'): void;
  /**
   * The knocked-out look (P9-12): 0 stands, up to 1 fallen and faded out (see `downLook`). While
   * above 0 it owns the body's tilt, so callers leave `pose.rotation` alone.
   */
  setDown(amount: number): void;
  readonly down: number;
  dispose(): void;
}

// ---------------------------------------------------------------------------------------------
// Mesh bodies (decision 111, P2-35): a skinned 3D model bound to the body's own skeleton.
// ---------------------------------------------------------------------------------------------

interface BodyModel {
  geometry: BufferGeometry;
  material: Material | Material[];
  /** The model's morph target names (its blend shapes), by index. */
  morphs?: Record<string, number>;
  /** How the model's mouth blend shapes show the nine mouth shapes (lip sync P2-44); null without them. */
  mouth: MouthMorphs | null;
  /** Our generated body's baked data, for its shape variants (geometry by rounded Anime Shape and build). */
  human?: { data: HumanData; variants: Map<string, BufferGeometry> };
}

/** Most generated shape variants kept per body (the oldest unused goes first; editor sliders make many). */
const MAX_HUMAN_VARIANTS = 24;
const step20 = (value: number) => Math.round(value * 20) / 20;

/**
 * The geometry of a generated body for its Anime Shape and build (values in steps of 0.05, each variant made once
 * and kept while avatars use it).
 */
function humanVariant(model: BodyModel, look: Pick<AvatarLook, 'animeShape' | 'build'>): BufferGeometry {
  const anime = step20(Math.min(1, Math.max(0, look.animeShape ?? 0)));
  const build = Object.fromEntries(
    Object.entries(look.build ?? {})
      .map(([key, value]) => [key, step20(value)] as const)
      .filter(([, value]) => value !== 0)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  const key = JSON.stringify([anime, build]);
  if (!model.human || key === '[0,{}]') return model.geometry;
  let geometry = model.human.variants.get(key);
  if (geometry) {
    model.human.variants.delete(key);
  } else {
    geometry = humanGeometry(model.human.data, 'anime', 'boy', anime, build);
    if (model.human.variants.size >= MAX_HUMAN_VARIANTS) {
      // Drop the oldest variant no avatar draws any more (the stage and players keep theirs).
      for (const [old, kept] of model.human.variants)
        if (!kept.userData.users) {
          model.human.variants.delete(old);
          kept.dispose();
          break;
        }
    }
  }
  model.human.variants.set(key, geometry);
  return geometry;
}

/** The full-detail geometry behind a generated body's geometry (its lighter level of detail points back to it). */
const fullOf = (geometry: BufferGeometry): BufferGeometry =>
  (geometry.userData.full as BufferGeometry | undefined) ?? geometry;

/** Hair, eyebrows and beards (HAIR-01): loaded proxies by url, and their fit per shaped body geometry. */
const humanProxies = new Map<string, HumanProxy>();
const fittedProxies = new WeakMap<BufferGeometry, Map<string, BufferGeometry>>();
const fittedProxy = (body: BufferGeometry, proxy: HumanProxy): BufferGeometry => {
  let fits = fittedProxies.get(body);
  if (!fits) fittedProxies.set(body, (fits = new Map()));
  let fit = fits.get(proxy.id);
  if (!fit) fits.set(proxy.id, (fit = fitHumanProxy(proxy, body)));
  return fit;
};

/** Loaded models by body id, shared by every avatar that wears the body. */
const bodyModels = new Map<string, BodyModel>();
const bodyLoads = new Map<string, Promise<BodyModel | null>>();

/**
 * A model's skinned geometry bound to the body's own skeleton: vertices moved to their bind
 * position (the model's T-pose rest) and each skin index pointed at the body joint with the same
 * canonical bone name (including supported external namespaces). Unknown bones fall to
 * the root.
 */
export function bindModelGeometry(
  body: AvatarBody,
  source: BufferGeometry,
  boneNames: readonly string[],
  bindMatrix?: Matrix4,
): BufferGeometry {
  const clean = (name: string) => name.replace(/[^A-Za-z0-9_]/g, '');
  const index = new Map(body.joints.map((joint, i) => [clean(nodeName(body, joint.name)), i]));
  const remap = boneNames.map((name) => index.get(clean(name)) ?? 0);
  const geometry = source.clone();
  if (bindMatrix) {
    geometry.applyMatrix4(bindMatrix);
    // Blend shapes are offsets: they turn and scale with the model, they do not move with it.
    const linear = new Matrix3().setFromMatrix4(bindMatrix);
    const normals = new Matrix3().getNormalMatrix(bindMatrix);
    const offset = new Vector3();
    const turn = (attributes: BufferAttribute[] | undefined, matrix: Matrix3) => {
      for (const attribute of attributes ?? [])
        for (let i = 0; i < attribute.count; i += 1) {
          offset.fromBufferAttribute(attribute, i).applyMatrix3(matrix);
          attribute.setXYZ(i, offset.x, offset.y, offset.z);
        }
    };
    if (geometry.morphTargetsRelative) {
      turn(geometry.morphAttributes.position as BufferAttribute[] | undefined, linear);
      turn(geometry.morphAttributes.normal as BufferAttribute[] | undefined, normals);
    }
  }
  const skin = geometry.getAttribute('skinIndex');
  const indices = new Uint16Array(skin.count * 4);
  for (let i = 0; i < skin.count; i += 1)
    for (let k = 0; k < 4; k += 1) indices[i * 4 + k] = remap[skin.getComponent(i, k)] ?? 0;
  geometry.setAttribute('skinIndex', new BufferAttribute(indices, 4));
  return geometry;
}

/** Retains every material primitive in a locally imported character. */
export function mergeLocalBodyPrimitives(body: AvatarBody, scene: Group): BodyModel {
          const parts: BufferGeometry[] = [], materials: Material[] = [];
          const groups: Array<{ start: number; count: number; material: number }> = [];
          let start = 0;
          scene.traverse(object => {
            const part = object as SkinnedMesh;
            if (!part.isSkinnedMesh) return;
            let geometry = bindModelGeometry(body, part.geometry, part.skeleton.bones.map(bone => bone.name), part.bindMatrix);
            // Exported primitives may share the complete vertex buffer; keep only their referenced vertices.
            if (geometry.index) { const indexed = geometry; geometry = indexed.toNonIndexed(); indexed.dispose(); }
            const own = Array.isArray(part.material) ? part.material : [part.material];
            for (const group of geometry.groups.length ? geometry.groups : [{ start: 0, count: geometry.index?.count ?? geometry.getAttribute('position').count, materialIndex: 0 }])
              groups.push({ start: start + group.start, count: group.count, material: materials.length + (group.materialIndex ?? 0) });
            start += geometry.index?.count ?? geometry.getAttribute('position').count;
            materials.push(...own); geometry.clearGroups(); parts.push(geometry);
          });
          const geometry = mergeGeometries(parts, false);
          for (const part of parts) part.dispose();
          if (!geometry) throw new Error('Imported character primitives could not be combined.');
          for (const group of groups) geometry.addGroup(group.start, group.count, group.material);
          return { geometry, material: materials, mouth: null };

}

/** Loads a mesh body's model once (null for block bodies or when it cannot be loaded). */
export function loadBodyModel(body: AvatarBody): Promise<BodyModel | null> {
  if (!body.model) return Promise.resolve(null);
  const ready = bodyModels.get(body.id);
  if (ready) return Promise.resolve(ready);
  let load = bodyLoads.get(body.id);
  if (!load && body.generated === 'human') {
    // Our own generated body (CHAR-02): the baked data is read by our generator; joints are already in body order.
    load = loadHumanData(body.model)
      .then((data) => {
        const model: BodyModel = {
          geometry: humanGeometry(data),
          material: humanMaterial(),
          mouth: null,
          human: { data, variants: new Map() },
        };
        bodyModels.set(body.id, model);
        return model;
      })
      .catch(() => null);
    bodyLoads.set(body.id, load);
  }
  if (!load) {
    load = createGltfLoader()
      .loadAsync(body.model)
      .then((gltf) => {
        let skinned: SkinnedMesh | undefined;
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((object) => {
          if (!skinned && (object as SkinnedMesh).isSkinnedMesh) skinned = object as SkinnedMesh;
        });
        if (!skinned) return null;
        // GLTF splits a multi-material character into separate skinned primitives.
        // Local imports must retain every primitive, including clothes, eyes and hair.
        if (body.id.startsWith('user.')) {
          const model = mergeLocalBodyPrimitives(body, gltf.scene);
          bodyModels.set(body.id, model); return model;
        }
        const model: BodyModel = {
          geometry: bindModelGeometry(
            body,
            skinned.geometry,
            skinned.skeleton.bones.map((bone) => bone.name),
            skinned.bindMatrix,
          ),
          material: skinned.material,
          ...(skinned.morphTargetDictionary ? { morphs: { ...skinned.morphTargetDictionary } } : {}),
          mouth: mouthMorphs(skinned.morphTargetDictionary),
        };
        bodyModels.set(body.id, model);
        return model;
      })
      .catch(() => null);
    bodyLoads.set(body.id, load);
  }
  return load;
}

// Uploaded bodies (2026-10-03): a creator's body item, resolved through the app (its data and model link), then
// worn like any mesh body. Classic stands in until it is known and its model has loaded.

const itemBodies = new Map<string, AvatarBody>();
const itemBodyLoads = new Map<string, Promise<AvatarBody | null>>();
const localItemBodies = new Map<string, { body: AvatarBody; users: number }>();
let itemBodyResolver: ((id: string) => Promise<AvatarBody | null>) | null = null;

/** Register a user-selected local body without replacing the host's item resolver. */
export function registerLocalAvatarBody(body: AvatarBody): () => void {
  if (!isItemBodyId(body.id) || !body.model) throw new Error('A local avatar needs a user body ID and model.');
  const row = localItemBodies.get(body.id) ?? { body, users: 0 };
  row.users++; localItemBodies.set(body.id, row);
  let released = false;
  return () => {
    if (released) return; released = true;
    if (--row.users > 0) return;
    localItemBodies.delete(body.id);
    itemBodyLoads.delete(body.id);
    // Runtime instances using this registration must be disposed before its owner releases it.
    const model = bodyModels.get(body.id);
    if (model) {
      model.geometry.dispose();
      for (const material of Array.isArray(model.material) ? model.material : [model.material]) material.dispose();
      bodyModels.delete(body.id);
    }
    bodyLoads.delete(body.id);
  };
}

/** How the app turns a body item id into a body (the place's body route and `bodyFromItem`); null: unknown. */
export function setItemBodyResolver(resolver: ((id: string) => Promise<AvatarBody | null>) | null): void {
  itemBodyResolver = resolver;
}

/** A body item, asked for once (null when the app cannot resolve it: it stays Classic). */
function loadItemBody(id: string): Promise<AvatarBody | null> {
  const local = localItemBodies.get(id); if (local) return Promise.resolve(local.body);
  const known = itemBodies.get(id);
  if (known) return Promise.resolve(known);
  let load = itemBodyLoads.get(id);
  if (!load) {
    load = (itemBodyResolver ? itemBodyResolver(id) : Promise.resolve(null))
      .then((body) => {
        if (body) itemBodies.set(id, body);
        else itemBodyLoads.delete(id);
        return body;
      })
      .catch(() => {
        itemBodyLoads.delete(id);
        return null;
      });
    itemBodyLoads.set(id, load);
  }
  return load;
}

/** The body a look asks for: one of Genvr's at its size, or a known uploaded body (null while it is not known). */
function lookBody(look: AvatarLook): AvatarBody | null {
  return look.body && isItemBodyId(look.body)
    ? (localItemBodies.get(look.body)?.body ?? itemBodies.get(look.body) ?? null)
    : sizedBody(look.body, look.scale);
}

/** Loads the model of a look's body (if it has one) before an avatar wears it. */
export async function preloadAvatarLook(look: AvatarLook): Promise<void> {
  const body = look.body && isItemBodyId(look.body) ? await loadItemBody(look.body) : findBody(look.body);
  if (body) await loadBodyModel(body);
}

/** Height of the pivot the body tilts around when swimming. */
const CHEST_HEIGHT = 1.2;
/** Forward tilt of the body while swimming (radians). */
export const SWIM_TILT = 1.5;
/**
 * Clips played lying in the water and their tilt: the crawl almost flat on the surface (reference sheet: 2-3
 * degrees off flat), the breaststroke a little more upright for the breath.
 */
export const SWIM_CLIPS: ReadonlyMap<string, number> = new Map([
  ['Swim', 1.518], // 3 degrees off flat
  ['SwimBreast', 1.484], // 5 degrees off flat
]);
/** The body's forward tilt a clip is played with. */
export const clipTilt = (clip: string | null | undefined): number => (clip ? (SWIM_CLIPS.get(clip) ?? 0) : 0);

/** Builds the Genvr avatar with its animation clips. */
export function createGenvrAvatar(
  look: AvatarLook = DEFAULT_LOOK,
  options: {
    cubes?: boolean;
    /** Called when a mesh body's model arrives and replaces the stand-in: rebind the animator. */
    onBodyReady?: () => void;
  } = {},
): GenvrAvatar {
  const smooth = new MeshStandardMaterial({ vertexColors: true, roughness: 0.75, flatShading: true });
  let cubes: Material | null = options.cubes ? cubeMaterial() : null;
  let material: Material = cubes ?? smooth;
  /** Level of detail of a generated body (`setDetail`). */
  let detail: 'full' | 'lite' = 'full';
  /** A skinned mesh with its own skeleton; a new body type gets a new mesh (GPU buffers fit it). */
  const makeMesh = (current: AvatarBody, next: AvatarLook) => {
    // A mesh body draws its shared model with its own texture (never cubes: it is not blocks).
    const model = bodyModels.get(current.id);
    const generated = model && current.generated === 'human' ? humanVariant(model, next) : null;
    const fitted: AvatarBody = generated?.userData.joints
      ? { ...current, joints: generated.userData.joints as AvatarBody['joints'] }
      : current;
    const { root: rootBone, skeleton } = buildSkeleton(fitted);
    // A mesh body's shared material is copied once per avatar, so a hit tints only this avatar.
    // Our generated body gets a fresh material per avatar (its colours are uniforms a clone would share).
    const made = model
      ? new SkinnedMesh(
          generated ? humanDetail(generated, detail) : model.geometry,
          current.generated === 'human'
            ? humanMaterial(
                next.skin,
                next.pants,
                findSkinMaterial(next.skinMaterial),
                generated!.userData.face as Record<string, [number, number, number]> | undefined,
                next.hair,
              )
            : Array.isArray(model.material) ? model.material.map(one => one.clone()) : model.material.clone(),
        )
      : new SkinnedMesh(bodyGeometry(next, current), material);
    // The model's blend shapes by name (the mouth's shapes, lip sync P2-44), all at rest.
    if (model?.morphs) {
      made.morphTargetDictionary = { ...model.morphs };
      made.morphTargetInfluences = new Array<number>(model.geometry.morphAttributes.position?.length ?? 0).fill(0);
    }
    mouthMorphTable = model?.mouth ?? null;
    if (mouthMorphTable && made.morphTargetInfluences)
      applyMouthMorphs(made.morphTargetInfluences, mouthMorphTable, mouthShape);
    made.userData.fittedBody = fitted;
    made.userData.bodyHeight = generated?.userData.height;
    made.userData.sharedGeometry = Boolean(model);
    // Generated shape variants count their meshes, so the cache only drops unused ones.
    if (current.generated === 'human') {
      const full = fullOf(made.geometry);
      full.userData.users = (full.userData.users ?? 0) + 1;
    }
    made.userData.ownMaterial = Boolean(model);
    // Kept apart from `material`: the editor swaps in view materials (clay, wireframe) and back.
    if (current.generated === 'human') made.userData.humanMaterial = made.material;
    made.name = 'avatar-body';
    made.castShadow = true;
    made.frustumCulled = false;
    made.add(rootBone);
    // A model kept in its own pose (the warrior's A-pose) binds with its joints turned into that
    // pose, then the joints go back to the T-pose the clips start from (P2-35).
    const bent = model ? fitted.joints.filter((joint) => joint.bind) : [];
    for (const joint of bent)
      skeleton.getBoneByName(nodeName(current, joint.name))?.quaternion.set(...joint.bind!);
    made.bind(skeleton);
    for (const joint of bent) skeleton.getBoneByName(nodeName(current, joint.name))?.quaternion.identity();
    // Our generated body keeps its volume at the shoulders and hips (CHAR-02), and wears the anime outline: the
    // same skin drawn again from its back faces, pushed out, on the same skeleton.
    if (current.generated === 'human') {
      // The drawn mouth's opening also opens the jaw (the face.mouth-open shape), on the body and the outline.
      const mouthOpen = ((made.material as Material).userData.face as FaceUniforms).mouthOpen;
      useDualQuaternionSkinning(made, undefined, mouthOpen);
      const outline = new SkinnedMesh(made.geometry, humanOutlineMaterial(made.material as Material));
      outline.name = 'avatar-outline';
      outline.frustumCulled = false;
      outline.castShadow = false;
      outline.bind(skeleton, made.bindMatrix);
      useDualQuaternionSkinning(outline, OUTLINE, mouthOpen);
      made.add(outline);
      made.userData.outline = outline;
    }
    // The mouth of a block body: a small surface on the head with the nine shapes (lip sync, P2-44).
    mouthMesh?.dispose();
    mouthMesh = null;
    robotFace?.dispose();
    robotFace = null;
    if (current.id === 'robot') {
      const shell = current.parts.find(part => part.joint === 'Head')!;
      const joint = current.joints.find(joint => joint.name === 'Head')!;
      robotFace = createRobotFace(shell.size[0], shell.size[1]);
      robotFace.root.position.set(shell.center[0] - joint.at[0], shell.center[1] - joint.at[1], shell.center[2] - joint.at[2] + shell.size[2] / 2 + .003);
      robotFace.setExpression(expression); robotFace.setMouth(mouthShape);
      skeleton.getBoneByName(nodeName(current, 'Head'))!.add(robotFace.root);
    }
    const mouthPart =
      model || current.flat || isItemBodyId(current.id)
        ? undefined
        : lookParts({ ...next, body: current.id, ...(current.scale ? { scale: current.scale } : {}) }).find(
            (part) => part.face === 'mouth',
          );
    const head = mouthPart ? skeleton.getBoneByName(nodeName(current, mouthPart.joint)) : undefined;
    const headAt = mouthPart ? current.joints.find((joint) => joint.name === mouthPart.joint)?.at : undefined;
    if (mouthPart && head && headAt) {
      mouthMesh = createMouth(mouthPart.size);
      mouthMesh.mesh.position.set(
        mouthPart.center[0] - headAt[0],
        mouthPart.center[1] - headAt[1],
        mouthPart.center[2] - headAt[2] + mouthPart.size[2] / 2 + MOUTH_GAP,
      );
      mouthMesh.setShape(mouthShape);
      head.add(mouthMesh.mesh);
    }
    // Bodies with toe shells (the robot) keep their toes flat on the ground when the heel lifts.
    toeRoll = !model && current.parts.some(part => part.joint.endsWith('ToeBase'))
      ? createToeRoll(['LeftToeBase', 'RightToeBase'].map(name => skeleton.getBoneByName(nodeName(current, name))).filter((bone): bone is Bone => Boolean(bone)))
      : null;
    made.position.y = -CHEST_HEIGHT;
    springs =
      model && current.springs
        ? new SpringBones(skeleton, current.springs.chains, current.springs.colliders, (joint) =>
            nodeName(current, joint),
          )
        : null;
    return made;
  };
  let springs: SpringBones | null = null;
  let toeRoll: ReturnType<typeof createToeRoll> | null = null;
  let gazeTarget: Vector3 | null = null;
  const gazeLocal = new Vector3();
  let robotFace: ReturnType<typeof createRobotFace> | null = null;
  let mouthMesh: MouthMesh | null = null;
  let mouthMorphTable: MouthMorphs | null = null;
  let mouthShape: MouthShape = 'X';
  let expression: AvatarExpression = 'neutral';
  /**
   * The body for a look: Genvr's at once; an uploaded one once the app resolved it. Until then Classic stands in, and
   * the avatar swaps when it is known (and its model loaded, see `shown`).
   */
  const resolve = (next: AvatarLook): AvatarBody => {
    const known = lookBody(next);
    if (known) return known;
    const id = next.body!;
    void loadItemBody(id).then((itemBody) => {
      if (!itemBody || wantedLook.body !== id) return;
      wanted = itemBody;
      const ready = shown(itemBody);
      if (ready === body) return;
      swap(ready, wantedLook);
      options.onBodyReady?.();
    });
    return sizedBody('classic', next.scale);
  };
  let wanted = resolve(look);
  let wantedLook = look;
  /** The body shown for a wanted one: a mesh body stands in as Classic until its model loads. */
  const shown = (next: AvatarBody): AvatarBody => {
    if (!next.model || bodyModels.has(next.id)) return next;
    void loadBodyModel(next).then((model) => {
      if (!model || wanted !== next || body === next) return;
      swap(next, wantedLook);
      options.onBodyReady?.();
    });
    return sizedBody('classic', wantedLook.scale);
  };
  const swap = (next: AvatarBody, nextLook: AvatarLook) => {
    body = next;
    const old = mesh;
    mesh = makeMesh(body, nextLook);
    mesh.visible = old.visible;
    pose.remove(old);
    pose.add(mesh);
    if (!old.userData.sharedGeometry) old.geometry.dispose();
    else if (fullOf(old.geometry).userData.users) fullOf(old.geometry).userData.users -= 1;
    if (old.userData.ownMaterial) for (const one of Array.isArray(old.material) ? old.material : [old.material]) one.dispose();
    ((old.userData.outline as SkinnedMesh | undefined)?.material as Material | undefined)?.dispose();
    grip = null;
    applyFlash();
    syncHair();
  };
  /** The right hand of the current skeleton, worked out once per body (null: not yet; undefined: none). */
  let grip: HandGrip | null | undefined = null;
  let flash = 0;
  const tints = new WeakMap<Material, HitTint>();
  let down = 0;
  const fades = new WeakMap<Material, FadeLook>();
  const applyFlash = () => {
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      let tint = tints.get(material); if (!tint) tints.set(material, (tint = new HitTint()));
      let fade = fades.get(material); if (!fade) fades.set(material, (fade = new FadeLook()));
      tint.apply(material, flash); fade.apply(material, downLook(down).opacity);
    }
  };
  let body = shown(wanted);
  let mesh = makeMesh(body, look);
  /**
   * Hair, eyebrows and beard of a generated body (HAIR-01): one skinned mesh each on the body's skeleton, fitted to
   * the body as shaped now (a new shape refits them), coloured with the look's hair colour. Loaded on first use.
   */
  const hairParts = new Map<string, SkinnedMesh>();
  let disposed = false;
  const syncHair = () => {
    const ids =
      body.generated === 'human' && body.model
        ? (Object.values(wantedLook.humanHair ?? {}).filter(Boolean) as string[])
        : [];
    const full = fullOf(mesh.geometry);
    for (const [id, part] of hairParts)
      if (!ids.includes(id) || part.userData.fitFor !== full || part.parent !== mesh) {
        part.removeFromParent();
        (part.material as Material).dispose();
        hairParts.delete(id);
      }
    if (!ids.length) return;
    const base = body.model!.replace(/[^/]*$/, '');
    for (const id of ids) {
      const shown = hairParts.get(id);
      if (shown) {
        setHumanHairColor(shown.material as MeshStandardNodeMaterial, wantedLook.hair);
        continue;
      }
      const proxy = humanProxies.get(base + id);
      if (!proxy) {
        void loadHumanProxy(base, id)
          .then((loaded) => {
            humanProxies.set(base + id, loaded);
            if (!disposed) syncHair();
          })
          .catch(() => {});
        continue;
      }
      const part = new SkinnedMesh(fittedProxy(full, proxy), humanHairMaterial(base, proxy, wantedLook.hair));
      part.name = `avatar-${proxy.kind}`;
      part.frustumCulled = false;
      part.castShadow = true;
      part.bind(mesh.skeleton, mesh.bindMatrix);
      useDualQuaternionSkinning(part);
      part.userData.fitFor = full;
      mesh.add(part);
      hairParts.set(id, part);
    }
  };
  syncHair();
  const root = new Group();
  const expressionWeights: Record<string, number> = {};
  root.name = 'avatar';
  // A second group lets swimming tilt the body around the chest without turning the facing.
  const pose = new Group();
  pose.name = 'avatar-pose';
  pose.position.y = CHEST_HEIGHT;
  pose.add(mesh);
  root.add(pose);
  return {
    root,
    pose,
    get mesh() {
      return mesh;
    },
    get skeleton() {
      return mesh.skeleton;
    },
    get headTop() {
      return (mesh.userData.bodyHeight as number | undefined) ?? headTopOf(body);
    },
    get rightHand() {
      if (grip === null) grip = rightHandGrip(mesh.userData.fittedBody as AvatarBody, mesh.skeleton) ?? undefined;
      return grip ?? null;
    },
    setDetail(next) {
      if (next === detail) return;
      detail = next;
      if (body.generated !== 'human') return;
      const geometry = humanDetail(fullOf(mesh.geometry), detail);
      mesh.geometry = geometry;
      const outline = mesh.userData.outline as SkinnedMesh | undefined;
      if (outline) outline.geometry = geometry;
    },
    setFlash(amount) {
      if (amount === flash) return;
      flash = amount;
      applyFlash();
    },
    get down() {
      return down;
    },
    setDown(amount) {
      if (amount === down) return;
      down = amount;
      const look = downLook(amount);
      pose.rotation.x = look.tilt;
      pose.position.y = CHEST_HEIGHT - look.drop;
      mesh.visible = look.opacity > 0;
      applyFlash();
    },
    get clips() {
      return avatarClips(mesh.userData.fittedBody as AvatarBody);
    },
    get body() {
      return body.id;
    },
    setLook(next) {
      wantedLook = next;
      wanted = resolve(next);
      const nextBody = shown(wanted);
      if (nextBody !== body) {
        // Another body type or size: another skeleton, so a new mesh in the same place.
        swap(nextBody, next);
        return true;
      }
      // Our generated body takes the skin and bottom colours (CHAR-02); other mesh bodies keep their texture.
      if (body.generated === 'human') {
        // A fantasy skin is its own material (a pattern compiled into it): a new one means a new mesh.
        const own = mesh.userData.humanMaterial as Material;
        const model = bodyModels.get(body.id);
        if (
          (own.userData.skinMaterial ?? '') !== (findSkinMaterial(next.skinMaterial)?.id ?? '') ||
          (model && humanVariant(model, next) !== fullOf(mesh.geometry))
        ) {
          swap(body, next);
          return true;
        }
        setHumanColors(own, next.skin, next.pants, next.hair);
        syncHair();
        return false;
      }
      // A mesh body keeps its model; colors and block clothing do not apply to it yet.
      if (body.model) return false;
      const old = mesh.geometry;
      mesh.geometry = bodyGeometry(next, body);
      old.dispose();
      return false;
    },
    get expressionSupported() { return Boolean(robotFace || mouthMesh || mesh.userData.humanMaterial || EXPRESSION_KEYS.some(key => mesh.morphTargetDictionary?.[key] !== undefined)); },
    setExpression(value) { expression = value; mouthMesh?.setExpression(value); robotFace?.setExpression(value); },
    setGazeTarget(point) { gazeTarget = point ? (gazeTarget ?? new Vector3()).copy(point) : null; },
    updateExpression(delta) {
      if (robotFace) {
        // The target in the screen's own space: sideways and up offsets over the distance in front.
        if (gazeTarget) {
          const local = robotFace.root.worldToLocal(gazeLocal.copy(gazeTarget)), ahead = Math.max(.3, local.z);
          robotFace.setGaze(local.x / ahead * 2.5, local.y / ahead * 2.5);
        } else robotFace.setGaze(0, 0);
      }
      robotFace?.update(delta);
      if (mouthShape === 'X') mouthMesh?.setExpression(expression);
      for (const key of EXPRESSION_KEYS) { const i = mesh.morphTargetDictionary?.[key]; if (i !== undefined && mesh.morphTargetInfluences) mesh.morphTargetInfluences[i] = 0; }
      if (mouthMorphTable && mesh.morphTargetInfluences) applyMouthMorphs(mesh.morphTargetInfluences, mouthMorphTable, mouthShape);
      applyAvatarExpression(mesh, expression, expressionWeights, delta);
    },
    setMouth(shape) {
      mouthShape = shape;
      // Our generated body draws its mouth in the material.
      if (mesh.userData.humanMaterial) setHumanMouth(mesh.userData.humanMaterial as Material, shape);
      mouthMesh?.setShape(shape);
      robotFace?.setMouth(shape);
      if (mouthMorphTable && mesh.morphTargetInfluences)
        applyMouthMorphs(mesh.morphTargetInfluences, mouthMorphTable, shape);
    },
    get mouth() {
      return robotFace || mouthMesh || mouthMorphTable || mesh.userData.humanMaterial ? mouthShape : 'X';
    },
    updateSprings(delta) {
      toeRoll?.update();
      springs?.update(delta);
    },
    setCubes(on) {
      if (on) cubes ??= cubeMaterial();
      material = on ? cubes! : smooth;
      if (!body.model) mesh.material = material;
      applyFlash();
    },
    dispose() {
      disposed = true;
      robotFace?.dispose();
      for (const part of hairParts.values()) (part.material as Material).dispose();
      mouthMesh?.dispose();
      if (!mesh.userData.sharedGeometry) mesh.geometry.dispose();
      else if (fullOf(mesh.geometry).userData.users) fullOf(mesh.geometry).userData.users -= 1;
      if (mesh.userData.ownMaterial) for (const one of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) one.dispose();
      ((mesh.userData.outline as SkinnedMesh | undefined)?.material as Material | undefined)?.dispose();
      smooth.dispose();
      cubes?.dispose();
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Animation clips: keyframe data from the Core Library (avatar-appearance), turned into clips.
// ---------------------------------------------------------------------------------------------

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const X_AXIS = new Vector3(1, 0, 0);
const Z_AXIS = new Vector3(0, 0, 1);

/** Arm raise (degrees above hanging) where the collarbone starts to lift, its share, and its limit. */
export const SHOULDER_LIFT = { from: 45, share: 0.35, max: 40 };

/** Curl of each finger segment (1, 2, 3) at a full grip, degrees; the thumb curls less. */
export const FINGER_CURL = { finger: [70, 95, 65], thumb: [20, 35, 40] };
const FINGER = /^(Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky)([123])$/;
const PALM = new Vector3(0, -1, 0);

/**
 * Finger tracks of a body with finger bones (owner, CHAR-02: the hands should move their fingers): every segment
 * turns toward the palm by the key's grip (palms face down in the T-pose rest, rest frames are world-aligned, so
 * the axis is the segment direction crossed with the palm normal).
 */
function fingerTracks(animation: AnimationItem, keys: readonly Key[], body: AvatarBody): QuaternionKeyframeTrack[] {
  if (body.flat) return [];
  const at = new Map(body.joints.map((joint) => [joint.name, new Vector3(...joint.at)]));
  const tracks: QuaternionKeyframeTrack[] = [];
  for (const joint of body.joints) {
    const match = FINGER.exec(joint.name);
    if (!match) continue;
    const [, side, finger, segment] = match;
    const child = body.joints.find((one) => one.parent === joint.name);
    const from = child ? at.get(joint.name)! : at.get(joint.parent!)!;
    const to = child ? at.get(child.name)! : at.get(joint.name)!;
    const direction = to.clone().sub(from).normalize();
    // The thumb lies along the front of the hand: it folds in across the palm (toward the back, -z) as well as down.
    const palm = finger === 'Thumb' ? new Vector3(0, -0.6, -1).normalize() : PALM;
    void side;
    const axis = direction.clone().cross(palm).normalize();
    if (axis.lengthSq() < 0.5) continue;
    const full = (finger === 'Thumb' ? FINGER_CURL.thumb : FINGER_CURL.finger)[Number(segment) - 1]!;
    const values: number[] = [];
    const q = new Quaternion();
    for (const [, pose] of keys) {
      const grip = pose.grip ?? animation.grip ?? RELAXED_GRIP;
      q.setFromAxisAngle(axis, toRadians(full * grip));
      values.push(q.x, q.y, q.z, q.w);
    }
    tracks.push(new QuaternionKeyframeTrack(`${nodeName(body, joint.name)}.quaternion`, keys.map(([t]) => t), values));
  }
  return tracks;
}

/** True when a body has a collarbone joint of its own, apart from the upper arm (mesh bodies). */
function hasOwnShoulders(body: AvatarBody): boolean {
  if (body.flat) return false;
  const joints = Object.entries(body.animation);
  const of = (bone: RigBone) => joints.find(([, sources]) => sources.includes(bone))?.[0];
  const shoulder = of('LeftShoulder');
  return shoulder !== undefined && shoulder !== of('LeftArm');
}

/**
 * A key with the collarbones lifted as the arms go up (owner, CHAR-02: shoulders pinched and thinned in Wave and
 * Cheer because no clip turned the Shoulder bone). The upper arm is turned back by the same amount, so the arm
 * still points where the clip says; only the shoulder joint rises with it, as a real shoulder blade does.
 */
function withShoulders([time, pose]: Key): Key {
  const next: Pose = { ...pose };
  const arm = new Quaternion();
  const lift = new Quaternion();
  const e = new Euler();
  const direction = new Vector3();
  for (const [side, sign] of [
    ['Left', 1],
    ['Right', -1],
  ] as const) {
    const angles = pose[`${side}Arm`];
    if (!angles) continue;
    arm.setFromEuler(e.set(toRadians(angles[0]), toRadians(angles[1]), toRadians(angles[2]), 'XYZ'));
    direction.set(sign, 0, 0).applyQuaternion(arm);
    const raised = (Math.acos(Math.min(1, Math.max(-1, -direction.y))) * 180) / Math.PI;
    const degrees = Math.min(SHOULDER_LIFT.max, Math.max(0, (raised - SHOULDER_LIFT.from) * SHOULDER_LIFT.share));
    if (degrees <= 0) continue;
    lift.setFromAxisAngle(Z_AXIS, toRadians(degrees * sign));
    const own = pose[`${side}Shoulder`] ?? [0, 0, 0];
    const shoulder = new Quaternion()
      .setFromEuler(e.set(toRadians(own[0]), toRadians(own[1]), toRadians(own[2]), 'XYZ'))
      .multiply(lift);
    arm.premultiply(lift.invert());
    const toDegrees = (q: Quaternion): V3 => {
      e.setFromQuaternion(q, 'XYZ');
      return [(e.x * 180) / Math.PI, (e.y * 180) / Math.PI, (e.z * 180) / Math.PI];
    };
    next[`${side}Shoulder`] = toDegrees(shoulder);
    next[`${side}Arm`] = toDegrees(arm);
  }
  return [time, next];
}

/**
 * A library animation as a clip of a body type. Each joint takes the rotations of the standard
 * bones mapped to it, combined parent first (all rest frames are aligned, so this is exact);
 * joints without animated bones stay at rest.
 */
export function clipFromAnimation(
  animation: AnimationItem,
  body: AvatarBody = findBody('starter'),
): AnimationClip {
  const keys = hasOwnShoulders(body) ? animation.keys.map(withShoulders) : animation.keys;
  const used = new Set<string>();
  for (const [, pose] of keys) for (const bone of Object.keys(pose)) used.add(bone);
  const tracks: Array<QuaternionKeyframeTrack | VectorKeyframeTrack> = [];
  const q = new Quaternion();
  const part = new Quaternion();
  const e = new Euler();
  for (const [joint, sources] of Object.entries(body.animation)) {
    if (!sources.some((bone) => used.has(bone))) continue;
    const values: number[] = [];
    for (const [, pose] of keys) {
      q.identity();
      if (body.flat) {
        // A flat 2D body turns each joint in its own plane only (decision 93).
        const degrees = sources.reduce((sum, bone) => sum + planarAngle(bone, pose[bone] ?? [0, 0, 0]), 0);
        q.setFromAxisAngle(X_AXIS, toRadians(degrees));
      } else
        for (const bone of sources) {
          // Bones missing from a key keep the rest rotation at that time.
          const [x, y, z] = pose[bone] ?? [0, 0, 0];
          e.set(toRadians(x), toRadians(y), toRadians(z), 'XYZ');
          q.multiply(part.setFromEuler(e));
        }
      values.push(q.x, q.y, q.z, q.w);
    }
    tracks.push(
      new QuaternionKeyframeTrack(
        `${nodeName(body, joint)}.quaternion`,
        keys.map(([t]) => t),
        values,
      ),
    );
  }
  tracks.push(...fingerTracks(animation, keys, body));
  if (keys.some(([, pose]) => pose.hipsY !== undefined)) {
    const rootJoint = body.joints[0]!;
    const [x, y, z] = rootJoint.at;
    tracks.push(
      new VectorKeyframeTrack(
        `${nodeName(body, rootJoint.name)}.position`,
        keys.map(([t]) => t),
        keys.flatMap(([, pose]) => [x, y + (pose.hipsY ?? 0) * (body.scale?.height ?? 1), z]),
      ),
    );
  }
  return new AnimationClip(animation.clip, animation.duration, tracks);
}

const clipCache = new WeakMap<AvatarBody, AnimationClip[]>();

/** Every Core animation (movement clips and player moves) as clips of a body type (shared). */
function avatarClips(body: AvatarBody): AnimationClip[] {
  let clips = clipCache.get(body);
  if (!clips) {
    clips = CORE_ANIMATIONS.map((animation) => fixedClip(animation, body));
    clipCache.set(body, clips);
  }
  return clips;
}

const SOLE_JOINTS = ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'];
/**
 * Board M16 (fix the base): on this body no key may put a sole under the floor. Each key is measured on the body's own
 * skeleton and the hips rise just enough; keys never go lower, so jumps keep their flight. Swim clips are in water.
 */
export function groundClip(clip: AnimationClip, body: AvatarBody): AnimationClip {
  const soles = SOLE_JOINTS.flatMap((name) => body.joints.filter((joint) => joint.name === name));
  if (!soles.length || SWIM_CLIPS.has(clip.name)) return clip;
  const rootJoint = body.joints[0]!, hipsName = `${nodeName(body, rootJoint.name)}.position`;
  const { root } = buildSkeleton(body);
  const bones = soles.map((joint) => root.getObjectByName(nodeName(body, joint.name))!);
  const position = clip.tracks.find((track) => track.name === hipsName);
  // The keys plus a 1/60 s grid, so the blend between two keys cannot dip under the floor either.
  const keys = Array.from(clip.tracks[0]?.times ?? []);
  const times = [...new Set([...keys, ...Array.from({ length: Math.floor(clip.duration * 60) + 1 }, (_, i) => Math.min(clip.duration, i / 60))].map((t) => Math.round(t * 1e4) / 1e4))].sort((a, b) => a - b);
  if (!keys.length) return clip;
  const mixer = new AnimationMixer(root), action = mixer.clipAction(clip);
  action.setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.play();
  const at = new Vector3(), values: number[] = [];
  const lifts = times.map((time) => {
    mixer.setTime(Math.min(time, clip.duration)); root.updateMatrixWorld(true);
    values.push(...root.position.toArray());
    return Math.max(0, ...bones.map((bone, i) => soles[i]!.at[1] - bone.getWorldPosition(at).y));
  });
  mixer.stopAllAction(); mixer.uncacheRoot(root);
  if (Math.max(...lifts) < 0.005) return clip;
  lifts.forEach((lift, i) => { values[i * 3 + 1] = values[i * 3 + 1]! + lift; });
  const tracks = clip.tracks.filter((track) => track !== position);
  tracks.push(new VectorKeyframeTrack(hipsName, times, values));
  return new AnimationClip(clip.name, clip.duration, tracks);
}

/** A sole point touches the floor below this height (m) when it is not moving up or down fast (as the motion check). */
const PLANT_HEIGHT = 0.03, PLANT_VERTICAL_SPEED = 0.2, LOCK_RELEASE_FRAMES = 6;
/** A planted foot's small twists are removed; past this (radians) the move means a pivot on the ball of the foot. */
const LOCK_MAX_TURN = 10 * Math.PI / 180;
/**
 * Board M16 (fix the base, "feet locked while planted"): while a heel or toe touches the floor it stays on one spot of
 * the ground (the ball of the foot when both touch, so turns pivot on it) and does not twist past LOCK_MAX_TURN; the thigh
 * and shin bend to reach it (two-bone IK, the knee keeps its own side) and the foot keeps its own
 * angle. A ground move travels forward at its Lab speed, another looping move at the speed its planted feet imply, a
 * one-off move stays in place. The correction
 * eases out over a few frames after lift-off. Baked on this body's own skeleton at 1/60 s; swims are left alone.
 */
export function lockFeet(clip: AnimationClip, body: AvatarBody, loop: boolean, speed?: number, hipsShift?: readonly Vector3[]): AnimationClip {
  const sides = (['Left', 'Right'] as const).map((side) => ({ side, joints: ['UpLeg', 'Leg', 'Foot', 'ToeBase'].map((part) => body.joints.find((joint) => joint.name === `${side}${part}`)) }));
  if (SWIM_CLIPS.has(clip.name) || sides.some((leg) => leg.joints.some((joint) => !joint)) || !clip.tracks.length) return clip;
  const { root } = buildSkeleton(body);
  const bone = (name: string) => root.getObjectByName(nodeName(body, name)) as Bone;
  const count = Math.max(2, Math.floor(clip.duration * 60) + 1), times = Array.from({ length: count }, (_, i) => Math.min(clip.duration, i / 60));
  const mixer = new AnimationMixer(root), action = mixer.clipAction(clip);
  action.setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.play();
  type Leg = { hip: Vector3; knee: Vector3; ankle: Vector3; heel: Vector3; toe: Vector3; upLeg: Quaternion; leg: Quaternion; foot: Quaternion };
  const frames = times.map((time) => {
    mixer.setTime(time); root.updateMatrixWorld(true);
    return { hips: root.getWorldQuaternion(new Quaternion()), legs: sides.map(({ side, joints }): Leg => {
      const [upLeg, leg, foot, toe] = ['UpLeg', 'Leg', 'Foot', 'ToeBase'].map((part) => bone(`${side}${part}`));
      const ankle = foot!.getWorldPosition(new Vector3()), toeAt = toe!.getWorldPosition(new Vector3());
      return { hip: upLeg!.getWorldPosition(new Vector3()), knee: leg!.getWorldPosition(new Vector3()), ankle,
        heel: ankle.clone().setY(ankle.y - joints[2]!.at[1]), toe: toeAt.setY(toeAt.y - joints[3]!.at[1]),
        upLeg: upLeg!.getWorldQuaternion(new Quaternion()), leg: leg!.getWorldQuaternion(new Quaternion()), foot: foot!.getWorldQuaternion(new Quaternion()) };
    }) };
  });
  mixer.stopAllAction(); mixer.uncacheRoot(root);
  const planted = (leg: number, point: 'heel' | 'toe', i: number) => {
    const p = frames[i]!.legs[leg]![point], before = frames[Math.max(0, i - 1)]!.legs[leg]![point], after = frames[Math.min(count - 1, i + 1)]!.legs[leg]![point];
    return p.y < PLANT_HEIGHT && Math.abs(after.y - before.y) / ((times[Math.min(count - 1, i + 1)]! - times[Math.max(0, i - 1)]!) || 1) < PLANT_VERTICAL_SPEED;
  };
  // The speed a looping move implies: minus the median speed of its planted sole points.
  const vx: number[] = [], vz: number[] = [];
  if (loop) for (let i = 1; i < count; i++) for (const leg of [0, 1]) for (const point of ['heel', 'toe'] as const)
    if (planted(leg, point, i) && planted(leg, point, i - 1)) { const a = frames[i - 1]!.legs[leg]![point], b = frames[i]!.legs[leg]![point]; vx.push((b.x - a.x) * 60); vz.push((b.z - a.z) * 60); }
  const median = (values: number[]) => values.length ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]! : 0;
  let velocity = speed !== undefined ? new Vector3(0, 0, speed) : new Vector3(-median(vx), 0, -median(vz));
  if (velocity.length() < 0.2) velocity = new Vector3();
  // Per frame and foot: the horizontal correction that keeps the planted point on its spot of the ground.
  const unique = loop ? count - 1 : count;
  // Heading of a foot on the floor (heel → toe), so a planted foot cannot twist on the spot either.
  const headingOf = (l: Leg) => Math.atan2(l.toe.x - l.heel.x, l.toe.z - l.heel.z), wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const UP = new Vector3(0, 1, 0);
  const corrections = [0, 1].map((leg) => {
    const out = Array.from({ length: count }, () => ({ move: new Vector3(), turn: 0 }));
    // A loop starts where the foot is in the air, so one contact never splits at the seam.
    const start = loop ? Math.max(0, Array.from({ length: unique }, (_, i) => i).find((i) => !planted(leg, 'heel', i) && !planted(leg, 'toe', i)) ?? 0) : 0;
    // `current` is the correction of the previous frame: a new anchor (touch-down, or heel → toe) carries it on, so nothing pops.
    let anchor = null as { point: 'heel' | 'toe'; at: Vector3; heading: number } | null, left = 0, turn = 0;
    const current = new Vector3();
    for (let k = 0; k < unique; k++) {
      const i = loop ? (start + k) % unique : k, lap = loop && start + k >= unique ? clip.duration : 0;
      const point = planted(leg, 'toe', i) ? 'toe' : planted(leg, 'heel', i) ? 'heel' : null;
      if (!point) {
        anchor = null;
        if (left > 0) { current.multiplyScalar((left - 1) / left); turn *= (left - 1) / left; left--; } else { current.set(0, 0, 0); turn = 0; }
        out[i]!.move.copy(current); out[i]!.turn = turn; continue;
      }
      const l = frames[i]!.legs[leg]!;
      if (!anchor || anchor.point !== point) anchor = { point, at: new Vector3(), heading: headingOf(l) + turn };
      // A deliberate pivot moves the held heading along, so only small twists are removed.
      turn = wrap(anchor.heading - headingOf(l));
      if (Math.abs(turn) > LOCK_MAX_TURN) { turn = Math.sign(turn) * LOCK_MAX_TURN; anchor.heading = headingOf(l) + turn; }
      // The planted point after the heading fix (the foot turns about its ankle), on the ground the body travels over.
      const here = l[point].clone().sub(l.ankle).applyAxisAngle(UP, turn).add(l.ankle).addScaledVector(velocity, times[i]! + lap).setY(0);
      if (anchor.at.lengthSq() === 0) anchor.at.copy(here).add(current);
      current.copy(anchor.at).sub(here); out[i]!.move.copy(current); out[i]!.turn = turn; left = LOCK_RELEASE_FRAMES;
    }
    if (loop) { out[count - 1]!.move.copy(out[0]!.move); out[count - 1]!.turn = out[0]!.turn; }
    return out;
  });
  // Hips moved for balance: the feet stay where they were.
  if (hipsShift) corrections.forEach((rows) => rows.forEach((row, i) => { const shift = hipsShift[i]; if (shift) row.move.sub(shift); }));
  if (corrections.every((rows) => rows.every((row) => row.move.lengthSq() < 1e-6 && Math.abs(row.turn) < 1e-4))) return clip;
  // Two-bone IK per frame; the new joint rotations replace the leg tracks at 1/60 s.
  const values = new Map<string, number[]>();
  const push = (name: string, q: Quaternion) => { const key = `${nodeName(body, name)}.quaternion`; if (!values.has(key)) values.set(key, []); values.get(key)!.push(q.x, q.y, q.z, q.w); };
  frames.forEach((frame, i) => sides.forEach(({ side }, leg) => {
    const l = frame.legs[leg]!, fix = corrections[leg]![i]!, target = l.ankle.clone().add(fix.move);
    const a = l.knee.distanceTo(l.hip), b = l.ankle.distanceTo(l.knee), reach = target.clone().sub(l.hip);
    const d = Math.min(a + b - 1e-4, Math.max(Math.abs(a - b) + 1e-4, reach.length())), dir = reach.normalize();
    // The knee bends forward around the thigh's own hinge axis (+x at rest), so it never flips to the wrong side.
    const pole = new Vector3().crossVectors(dir, new Vector3(1, 0, 0).applyQuaternion(l.upLeg)).normalize();
    const cos = Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d)));
    const knee = l.hip.clone().addScaledVector(dir, a * cos).addScaledVector(pole, a * Math.sqrt(1 - cos * cos));
    const ankle = l.hip.clone().addScaledVector(dir, d);
    const turnThigh = new Quaternion().setFromUnitVectors(l.knee.clone().sub(l.hip).normalize(), knee.clone().sub(l.hip).normalize());
    const upLeg = turnThigh.clone().multiply(l.upLeg);
    const shin = l.ankle.clone().sub(l.knee).normalize().applyQuaternion(turnThigh);
    const legWorld = new Quaternion().setFromUnitVectors(shin, ankle.clone().sub(knee).normalize()).multiply(turnThigh).multiply(l.leg);
    push(`${side}UpLeg`, frame.hips.clone().invert().multiply(upLeg));
    push(`${side}Leg`, upLeg.clone().invert().multiply(legWorld));
    push(`${side}Foot`, legWorld.clone().invert().multiply(new Quaternion().setFromAxisAngle(UP, fix.turn).multiply(l.foot)));
  }));
  const tracks = clip.tracks.filter((track) => !values.has(track.name));
  for (const [name, rows] of values) tracks.push(new QuaternionKeyframeTrack(name, times, rows));
  return new AnimationClip(clip.name, clip.duration, tracks);
}

/** Carried by a seat, a wall or the air: their weight is not over the feet. */
const CARRIED_CLIPS = new Set(['Sit', 'SitGround', 'Climb', 'Jump']);
/** Rough body-segment weights (the motion check uses the same): [joint, second joint for a segment's middle, weight]. */
const MASS_PARTS: ReadonlyArray<readonly [string, string | null, number]> = [['Spine2', null, 0.3], ['Hips', null, 0.15], ['Head', null, 0.08],
  ['LeftUpLeg', 'LeftLeg', 0.1], ['RightUpLeg', 'RightLeg', 0.1], ['LeftLeg', 'LeftFoot', 0.06], ['RightLeg', 'RightFoot', 0.06], ['LeftForeArm', null, 0.05], ['RightForeArm', null, 0.05]];
/** How far inside the feet the weight is brought (m), and how far outside it may be before anything moves. */
const BALANCE_MARGIN = 0.04, BALANCE_SMOOTH_FRAMES = 6;

/** Nearest point of the feet's support area (the planted sole points and the shape between them) to `p` on the floor. */
function nearestSupport(p: Vector3, points: Vector3[]): Vector3 {
  const flat = points.map((q) => new Vector3(q.x, 0, q.z)), at = new Vector3(p.x, 0, p.z);
  if (flat.length >= 3) {
    const c = flat.reduce((sum, q) => sum.add(q), new Vector3()).divideScalar(flat.length);
    const ring = [...flat].sort((a, b) => Math.atan2(a.z - c.z, a.x - c.x) - Math.atan2(b.z - c.z, b.x - c.x));
    if (ring.every((a, i) => { const b = ring[(i + 1) % ring.length]!; return (b.x - a.x) * (at.z - a.z) - (b.z - a.z) * (at.x - a.x) >= 0; })) return at;
  }
  let best = flat[0]!.clone(), distance = Infinity;
  for (const a of flat) for (const b of flat) {
    const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, at.clone().sub(a).dot(ab) / (ab.lengthSq() || 1)));
    const q = a.clone().addScaledVector(ab, t);
    if (q.distanceTo(at) < distance) { distance = q.distanceTo(at); best = q; }
  }
  return best;
}

/**
 * Board M16 (fix the base, "weight over the feet"): while a body stands still on planted feet, its centre of mass may not
 * stay outside them; the hips move along the floor just enough (smoothed) and the foot lock that follows keeps the feet
 * in place (the shifts go to lockFeet, which keeps every foot where it was). Moves that travel, sit, climb, jump or swim
 * are left alone.
 */
export function balanceClip(clip: AnimationClip, body: AvatarBody): { clip: AnimationClip; shifts?: Vector3[] } {
  const names = new Set(body.joints.map((joint) => joint.name));
  if (SWIM_CLIPS.has(clip.name) || CARRIED_CLIPS.has(clip.name) || !clip.tracks.length || MASS_PARTS.some(([a, b]) => !names.has(a) || (b && !names.has(b)))) return { clip };
  const soles = SOLE_JOINTS.flatMap((name) => body.joints.filter((joint) => joint.name === name));
  if (soles.length < 4) return { clip };
  const rootJoint = body.joints[0]!, hipsName = `${nodeName(body, rootJoint.name)}.position`;
  const { root } = buildSkeleton(body);
  const bone = (name: string) => root.getObjectByName(nodeName(body, name))!;
  const count = Math.max(2, Math.floor(clip.duration * 60) + 1), times = Array.from({ length: count }, (_, i) => Math.min(clip.duration, i / 60));
  const mixer = new AnimationMixer(root), action = mixer.clipAction(clip);
  action.setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.play();
  const at = (name: string) => bone(name).getWorldPosition(new Vector3());
  const frames = times.map((time) => {
    mixer.setTime(time); root.updateMatrixWorld(true);
    const mass = MASS_PARTS.reduce((sum, [a, b, w]) => sum.addScaledVector(b ? at(a).add(at(b)).multiplyScalar(0.5) : at(a), w), new Vector3()).divideScalar(MASS_PARTS.reduce((sum, [, , w]) => sum + w, 0));
    return { hips: root.position.clone(), mass, soles: soles.map((joint) => { const p = at(joint.name); return p.setY(p.y - joint.at[1]); }) };
  });
  mixer.stopAllAction(); mixer.uncacheRoot(root);
  // A move whose planted soles travel under it is walking somewhere: leave it.
  const travel: number[] = [];
  for (let i = 1; i < count; i++) frames[i]!.soles.forEach((p, k) => { const q = frames[i - 1]!.soles[k]!; if (p.y < PLANT_HEIGHT && q.y < PLANT_HEIGHT) travel.push(Math.hypot(p.x - q.x, p.z - q.z) * 60); });
  if (travel.length && [...travel].sort((a, b) => a - b)[Math.floor(travel.length / 2)]! > 0.2) return { clip };
  const raw = frames.map((frame, i) => {
    const still = frame.hips.distanceTo(frames[Math.min(count - 1, i + 1)]!.hips) * 60 < 0.2 && frame.hips.distanceTo(frames[Math.max(0, i - 1)]!.hips) * 60 < 0.2;
    const support = frame.soles.filter((p) => p.y < PLANT_HEIGHT);
    if (!still || !support.length) return new Vector3();
    const near = nearestSupport(frame.mass, support), gap = new Vector3(near.x - frame.mass.x, 0, near.z - frame.mass.z);
    // Outside by more than the margin: bring the weight to the margin inside the edge.
    return gap.length() > BALANCE_MARGIN ? gap.clone().setLength(gap.length() + BALANCE_MARGIN) : new Vector3();
  });
  if (raw.every((shift) => shift.lengthSq() < 2.5e-5)) return { clip };
  const shifts = raw.map((_, i) => { const sum = new Vector3(); let n = 0; for (let k = -BALANCE_SMOOTH_FRAMES; k <= BALANCE_SMOOTH_FRAMES; k++) { const j = i + k; if (j >= 0 && j < count) { sum.add(raw[j]!); n++; } } return sum.divideScalar(n); });
  const values = frames.flatMap((frame, i) => [frame.hips.x + shifts[i]!.x, frame.hips.y, frame.hips.z + shifts[i]!.z]);
  const tracks = clip.tracks.filter((track) => track.name !== hipsName);
  tracks.push(new VectorKeyframeTrack(hipsName, times, values));
  return { clip: new AnimationClip(clip.name, clip.duration, tracks), shifts };
}

/** A Core move on this body with its base fixed (board M16): feet on the floor, weight over them, locked while planted. */
export function fixedClip(animation: (typeof CORE_ANIMATIONS)[number], body: AvatarBody): AnimationClip {
  const balanced = balanceClip(groundClip(clipFromAnimation(animation, body), body), body);
  const speed = Object.values(LAB_GROUND_MOVES).find((move) => move.clip.replace(/ /g, '') === animation.clip)?.speed;
  return groundClip(lockFeet(balanced.clip, body, animation.kind === 'loop', speed, balanced.shifts), body);
}

/** Every Core animation as clips of a body type (Classic when not given). */
export const createAvatarClips = (body?: AvatarBodyType): AnimationClip[] => avatarClips(findBody(body));

/** Rest position of a joint (world, T-pose), e.g. for tests and attachment points. */
export function restPosition(joint: string, body?: AvatarBodyType): Vector3 {
  const found = findBody(body ?? 'starter').joints.find((entry) => entry.name === joint);
  return found ? new Vector3(...found.at) : new Vector3();
}
