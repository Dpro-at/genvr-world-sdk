import {
  rideFromParams,
  zoneFromParams,
  type ItemInstance,
  type Ride,
  type Style,
  type WorldDocument,
} from '@genvr/contracts';
import {
  getCoreItem,
  getLibraryItem,
  generatedParamKeys,
  getSurface,
  itemBounds,
  itemGeneratedLook,
  itemModelLook,
  itemParts,
  zoneShapeOfItem,
  type CoreItem,
  type ItemBounds,
  type ItemPart,
} from '@genvr/core-library';
import { rest, type RestShape, type SurfaceIndex } from '@genvr/validator';
import type { TerrainData } from '@genvr/world';
import {
  AnimationMixer,
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  Euler,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Ray,
  SphereGeometry,
  Vector3,
  type AnimationClip,
  type Material,
  type Object3D,
} from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type RAPIER from '@dimforge/rapier3d-compat';
import {
  mergedPackageGeometry,
  type ItemPackages,
  type LoadedPackage,
  type PackageMesh,
} from './item-packages.js';
import type { PhysicsWorld } from './physics.js';
import { buildGenerated, generatedParams } from './generators.js';

/**
 * Where an item is drawn while it moves away from where it was placed (movement modes): ridden, or
 * left somewhere by a rider. Pitch and roll are the lean worked out on this device (never sent).
 */
export interface LivePose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch?: number;
  roll?: number;
}

/** What the runtime needs to draw and collide one item type. */
export interface ItemModel {
  id: string;
  name: string;
  parts: readonly ItemPart[];
  bounds: ItemBounds;
  /** What a player bumps into, where that is much smaller than `bounds` (a tree's trunk). */
  blocks?: ItemBounds;
  collider: 'none' | 'box';
  /** Copies join edge to edge (fences, blocks) instead of leaving a small gap. */
  snug: boolean;
  /** Cell size for block-style items that stack in a grid, or null. */
  grid: number | null;
  /** Basic parts: width, height, and depth change freely. */
  resizable: boolean;
  /** Meshes of a glTF package (P2-16); drawn instead of `parts` when present. */
  meshes?: readonly PackageMesh[];
  /**
   * Simpler versions of `meshes` for far away (decision 94), nearest first. Moving copies use a
   * level only where it shares the mesh's vertices (levels made by Genvr), so bones still fit.
   */
  lods?: readonly (readonly PackageMesh[])[];
  /** Opt-in shader LOD residency, one padded distance interval per mesh level.
   * Overlap keeps both levels available for shader cross-fades. The padding must exceed
   * refreshDistance; shaders still use the actual camera and their unpadded fade ranges.
   * Static instanced models only; ordinary package LOD remains unchanged. */
  lodResidency?: {
    ranges: readonly (readonly [number, number])[];
    refreshDistance: number;
    /** Optional static fallback for transforms a procedural shader cannot represent. Must not mutate matrix. */
    forceNear?: (matrix: Matrix4) => boolean;
  };
  /** Animated or skinned package models: drawn as copies that move (P2-16 slice d). */
  animation?: { scene: Object3D; clips: readonly AnimationClip[] };
  /** Sound name to file link (package `audio`). */
  sounds?: Readonly<Record<string, string>>;
  /** Players climb it (manifest `physics.climbable`, P2-23). */
  climbable?: boolean;
  /** Made to hang in the air (manifest `physics.floats`); copies may say otherwise. */
  floats?: boolean;
}

/** Floating items up to this thick are one-way platforms in side-view places (decision 95). */
export const ONE_WAY_THICKNESS = 1;

/** A ladder the player touches: its top and bottom (feet heights) and which way it faces. */
export interface Climbable {
  instanceId: string;
  top: number;
  bottom: number;
  /** Turn about Y; the ladder's front is +z in its own space. */
  yaw: number;
  /** Middle of its box on the ground plane. */
  x: number;
  z: number;
}

/** How far from a climbable item's box the player still holds on (more than the runtime's hold distance). */
const CLIMB_REACH = 0.5;
/** How high above a ladder's top players climb, to clear the edge of what it leans on. */
export const CLIMB_OVER = 0.15;

/** Most moving package items drawn per place; more copies are drawn still (instanced). */
export const MAX_ANIMATED_ITEMS = 50;

/** The clip an animated item plays: `idle` when there is one, else the first. */
export function idleClip(clips: readonly AnimationClip[]): AnimationClip | undefined {
  return clips.find((clip) => clip.name === 'idle') ?? clips[0];
}

/**
 * The sound an animated item makes each time its animation starts again (decision 79): the
 * sound named like the animation, else the first sound of the package.
 */
export function loopSound(model: ItemModel, clipName: string): string | undefined {
  const sounds = model.sounds ?? {};
  return sounds[clipName] ?? Object.values(sounds)[0];
}

/** One moving copy of an animated package item. */
interface AnimatedItem {
  itemId: string;
  root: Object3D;
  mixer: AnimationMixer;
  signature: string;
  /** Its own copies of the model's materials (the item color tints each copy on its own). */
  materials: Array<{ material: Material & { color?: Color }; base: Color | null }>;
  /** The item color it shows now, null for the model's own colors. */
  tint: string | null;
  /** Its meshes and their geometry per LOD level (the full one first). */
  swaps: Array<{ mesh: Mesh; geometries: BufferGeometry[] }>;
  /** The LOD level it shows now (0 is the full model). */
  level: number;
  /** Time and frames since its animation last moved (far copies move less often). */
  wait: number;
  frames: number;
}

/** Frames between animation updates of a moving copy at each LOD level (far ones move less often). */
export const ANIMATION_EVERY = [1, 2, 4] as const;

/** Heard when an animated item's animation starts again (to play its sound there). */
export interface ItemLoopEvent {
  instanceId: string;
  itemId: string;
  position: Vector3;
  /** Link of the sound to play, if the item has one. */
  sound: string | undefined;
}

/** Placeholder for items that are not available (e.g. a store item not installed yet). */
const MISSING: Omit<ItemModel, 'id'> = {
  name: 'Missing item',
  parts: [{ shape: 'box', size: [1, 1, 1], position: [0, 0.5, 0], color: '#b8b8c8' }],
  bounds: { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] },
  collider: 'box',
  snug: false,
  grid: null,
  resizable: false,
};

/**
 * Resolves an item id to its model: a Core Library item (in its look for the place's style, P2-26),
 * or a loaded glTF package (P2-16); the placeholder while a package loads or when there is none.
 */
/**
 * The item as the place draws it: a Core item's parts in the place's style, a Core item's real 3D
 * model where its style has one (Realistic, P2-38; its parts stand in while the model loads), or
 * an uploaded package.
 */
export function resolveItem(
  itemId: string,
  packages?: ItemPackages,
  style?: Style,
  coreModels?: ItemPackages,
  /** The placed instance's own parameters: a generated look (decision 130) is built with them. */
  params?: Readonly<Record<string, unknown>>,
): ItemModel {
  const core = getCoreItem(itemId);
  // A look made by a runtime generator (decision 130): built from the item's parameters, shared by every copy
  // with the same ones. Without its generator (not registered here) it draws as missing.
  const generatedLook = core ? itemGeneratedLook(core, style) : null;
  if (core && generatedLook) {
    const built = buildGenerated(generatedLook.generated.generator, generatedParams(generatedLook, params));
    if (built) {
      const collider = core.manifest.physics?.collider === 'none' ? 'none' : 'box';
      return {
        id: itemId,
        name: core.manifest.name,
        parts: [],
        bounds: built.bounds,
        ...(built.blocks ? { blocks: built.blocks } : {}),
        collider,
        snug: false,
        grid: null,
        resizable: false,
        meshes: built.meshes,
        ...(built.lods.length > 0 ? { lods: built.lods } : {}),
      };
    }
    if (core.parts.length === 0) return { id: itemId, ...MISSING };
  }
  const modelLook = core && coreModels ? itemModelLook(core, style) : null;
  if (core && modelLook) {
    const loaded = coreModels!.get(itemId);
    if (loaded) {
      const model = packageModel(itemId, loaded);
      return modelLook.model.blocks ? { ...model, blocks: modelLook.model.blocks } : model;
    }
    if (core.parts.length === 0) return { id: itemId, ...MISSING };
  }
  if (!core) {
    const loaded = packages?.get(itemId);
    if (!loaded) return { id: itemId, ...MISSING };
    return packageModel(itemId, loaded);
  }
  return coreModel(itemId, core, style);
}

/** An uploaded package, or a Core item's real model, as the items view draws it. */
function packageModel(itemId: string, loaded: LoadedPackage): ItemModel {
  {
    let skinned = false;
    loaded.scene.traverse((object) => {
      if ((object as { isSkinnedMesh?: boolean }).isSkinnedMesh) skinned = true;
    });
    const moving = loaded.animations.length > 0 || skinned;
    return {
      id: itemId,
      name: loaded.manifest.name,
      parts: [],
      bounds: loaded.bounds,
      collider: loaded.manifest.physics?.collider === 'none' ? 'none' : 'box',
      snug: false,
      grid: null,
      resizable: false,
      meshes: loaded.meshes,
      ...(moving ? { animation: { scene: loaded.scene, clips: loaded.animations } } : {}),
      ...(loaded.lods.length > 0 ? { lods: loaded.lods } : {}),
      sounds: loaded.sounds,
      ...(loaded.manifest.physics?.climbable ? { climbable: true } : {}),
      ...(loaded.manifest.physics?.floats ? { floats: true } : {}),
    };
  }
}

function coreModel(itemId: string, core: CoreItem, style?: Style): ItemModel {
  const collider = core.manifest.physics?.collider === 'none' ? 'none' : 'box';
  const parts = itemParts(core, style);
  return {
    id: itemId,
    name: core.manifest.name,
    parts,
    bounds: itemBounds(parts),
    collider,
    snug: core.group === 'buildings',
    grid: core.grid ?? null,
    resizable: core.resizable ?? false,
    ...(core.manifest.physics?.climbable ? { climbable: true } : {}),
    ...(core.manifest.physics?.floats ? { floats: true } : {}),
  };
}

function partGeometry(part: ItemPart): BufferGeometry {
  const [sx, sy, sz] = part.size;
  switch (part.shape) {
    case 'box':
      return new BoxGeometry(sx, sy, sz);
    case 'cylinder':
      return new CylinderGeometry(sx / 2, sx / 2, sy, 12);
    case 'cone':
      return new ConeGeometry(sx / 2, sy, 12);
    case 'sphere': {
      const sphere = new SphereGeometry(0.5, 12, 8);
      sphere.scale(sx, sy, sz);
      return sphere;
    }
    case 'wedge': {
      // A ramp: full height at the back (-z), down to the ground at the front (+z).
      const [x, y, z] = [sx / 2, sy / 2, sz / 2];
      const corners = [
        [-x, -y, -z],
        [x, -y, -z],
        [x, -y, z],
        [-x, -y, z], // bottom
        [-x, y, -z],
        [x, y, -z], // top back edge
      ];
      const faces = [
        [0, 2, 1],
        [0, 3, 2], // bottom
        [0, 1, 5],
        [0, 5, 4], // back
        [3, 4, 5],
        [3, 5, 2], // slope
        [0, 4, 3], // left
        [1, 2, 5], // right
      ];
      const positions = faces.flatMap((face) => face.flatMap((corner) => corners[corner]!));
      const wedge = new BufferGeometry();
      wedge.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
      wedge.computeVertexNormals();
      return wedge;
    }
    case 'pyramid': {
      // Four-sided cone turned 45 degrees: a square base of side sx.
      const pyramid = new ConeGeometry(sx / Math.SQRT2, sy, 4);
      pyramid.rotateY(Math.PI / 4);
      return pyramid;
    }
  }
}

/** All parts merged into one geometry with vertex colors (one draw call per item type). */
export function itemGeometry(parts: readonly ItemPart[]): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const color = new Color();
  for (const part of parts) {
    const geometry = partGeometry(part);
    if (part.rotationY) geometry.rotateY(part.rotationY);
    geometry.translate(part.position[0], part.position[1], part.position[2]);
    const base = positions.length / 3;
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    color.set(part.color);
    for (let i = 0; i < position.count; i += 1) {
      positions.push(position.getX(i), position.getY(i), position.getZ(i));
      normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      colors.push(color.r, color.g, color.b);
    }
    const index = geometry.getIndex();
    if (index) for (let i = 0; i < index.count; i += 1) indices.push(base + index.getX(i));
    else for (let i = 0; i < position.count; i += 1) indices.push(base + i);
    geometry.dispose();
  }
  const merged = new BufferGeometry();
  merged.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  merged.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  merged.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  merged.setIndex(indices);
  merged.computeBoundingSphere();
  return merged;
}

/** A map marker of the rules (manifest `marker`, P9-12): drawn only while building. */
function isMarker(itemId: string): boolean {
  return getCoreItem(itemId)?.manifest.marker !== undefined;
}

/** A marker hidden while playing: every marker except a zone its designer made visible in play (`zoneVisible`). */
function hiddenInPlay(instance: ItemInstance): boolean {
  if (!isMarker(instance.itemId)) return false;
  return !zoneFromParams(instance.params, zoneShapeOfItem(instance.itemId))?.visibleInPlay;
}

/** Generator parameter names per item id (decision 130), looked up once. */
const paramKeysOf = new Map<string, readonly string[]>();

/**
 * Model key of an item with some instance parameters: its item id, plus the values of its generator parameters
 * when it has a generated look (decision 130), so copies with equal parameters share one model and one batch.
 */
export function modelKey(itemId: string, params?: Readonly<Record<string, unknown>>): string {
  let keys = paramKeysOf.get(itemId);
  if (!keys) {
    keys = generatedParamKeys(itemId);
    paramKeysOf.set(itemId, keys);
  }
  if (keys.length === 0) return itemId;
  return `${itemId}#${keys.map((key) => `${key}=${JSON.stringify(params?.[key] ?? null)}`).join(',')}`;
}

/** Instanced-mesh key of a placed item: its model key, plus its surface when not plastic. */
function typeKey(instance: ItemInstance): string {
  const material = instance.params.material;
  const key = modelKey(instance.itemId, instance.params);
  return typeof material === 'string' && material !== 'plastic' ? `${key}@${material}` : key;
}

/**
 * Render-only shift that puts a far, coarsely-drawn thing on the ground exactly as it is drawn
 * there (P2-43): the document position still rests on the exact terrain (`heightAt`), but a chunk
 * drawn at less than full detail shows a different height at that point, so the item is shifted by
 * the difference for drawing only. Zero at full detail (`step === 1`), where the drawn ground is
 * the exact one.
 */
export function drawOffset(
  x: number,
  z: number,
  exact: number,
  step: number,
  terrain: Pick<TerrainData, 'drawnHeightAt'>,
): number {
  return step === 1 ? 0 : terrain.drawnHeightAt(x, z, step) - exact;
}

/**
 * Ground and rest-law context an `ItemsView` needs for render-only drawing fixes (P2-43 task 11):
 * `stepAt` says which level of detail `TerrainView` is drawing the ground with at a point, and
 * `shapeOf`/`surfaces` are the rest law's own view of the place, used to size a `foundation`
 * item's plinth the same way the rest law itself would.
 */
export interface ItemsDrawContext {
  /** The exact ground (never a coarse level), and the ground exactly as a coarse chunk draws it. */
  terrain: Pick<TerrainData, 'heightAt' | 'drawnHeightAt'>;
  /** The step (1, 2 or 4) `TerrainView` is currently drawing the chunk at x, z with. */
  stepAt: (x: number, z: number) => number;
  /** Increases whenever a chunk `stepAt` would answer changes; cheap to poll. */
  stepVersion: () => number;
  shapeOf: (itemId: string) => RestShape | null;
  surfaces: () => SurfaceIndex;
  /** True in Realistic places: the plinth is drawn in stone instead of the style's dark grey (no
   * wall-color palette is readily available to the runtime here, P2-43 task 11). */
  realistic: () => boolean;
}

/** Plinth box colours (P2-43 task 11): a stone-like grey for Realistic, a neutral dark grey else. */
const PLINTH_COLOR_REALISTIC = 0x8a8175;
const PLINTH_COLOR_OTHER = 0x3a3a3a;

/** Smallest plinth worth drawing (matches the rest law's own tolerance, P2-43 task 5/11). */
const PLINTH_MIN = 0.01;

/** Rotation about the vertical axis of a quaternion (items are only turned about Y). */
export const yawOf = (q: readonly number[]) => 2 * Math.atan2(q[1] ?? 0, q[3] ?? 1);
export const yawQuaternion = (yaw: number): [number, number, number, number] => [
  0,
  Math.sin(yaw / 2),
  0,
  Math.cos(yaw / 2),
];

/** Collider box of one placed item, in world space. */
export function itemColliderBox(model: ItemModel, instance: Pick<ItemInstance, 'transform'>) {
  const { position, rotation, scale } = instance.transform;
  // A tree collides at its trunk, not its crown: with the crown's box every tree stood in an
  // invisible wall as wide as its branches (2026-09-29).
  const { min, max } = model.blocks ?? model.bounds;
  const yaw = yawOf(rotation);
  const lx = ((min[0] + max[0]) / 2) * scale[0];
  const lz = ((min[2] + max[2]) / 2) * scale[2];
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return {
    center: [
      position[0] + lx * cos + lz * sin,
      position[1] + ((min[1] + max[1]) / 2) * scale[1],
      position[2] - lx * sin + lz * cos,
    ],
    half: [
      ((max[0] - min[0]) / 2) * scale[0],
      ((max[1] - min[1]) / 2) * scale[1],
      ((max[2] - min[2]) / 2) * scale[2],
    ],
    yaw,
  };
}

/**
 * World-space matrix of a `foundation` item's plinth box (P2-43 task 11): as wide and deep as the
 * item's own rest base (`rest()`'s `restFeet` base, same as the collider box's own convention
 * above), reaching `plinth` meters up to the item's base (its lowest point). `offsetY` is the same
 * render-only coarse-ground shift (`drawOffset`) applied to the item itself, so a plinth moves
 * with its item instead of floating above (or sinking below) the drawn ground (P2-43 task 11
 * review round 1).
 */
export function plinthMatrix(instance: ItemInstance, shape: RestShape, plinth: number, offsetY = 0): Matrix4 {
  const { position, rotation, scale } = instance.transform;
  const base = shape.rule.base ?? {
    min: [shape.min[0]!, shape.min[2]!],
    max: [shape.max[0]!, shape.max[2]!],
  };
  const yaw = yawOf(rotation);
  const lx = ((base.min[0] + base.max[0]) / 2) * scale[0];
  const lz = ((base.min[1] + base.max[1]) / 2) * scale[2];
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const bottom = position[1] + shape.min[1]! * scale[1] + offsetY;
  const matrix = new Matrix4();
  return matrix.compose(
    new Vector3(position[0] + lx * cos + lz * sin, bottom - plinth / 2, position[2] - lx * sin + lz * cos),
    new Quaternion(...yawQuaternion(yaw)),
    new Vector3((base.max[0] - base.min[0]) * scale[0], plinth, (base.max[1] - base.min[1]) * scale[2]),
  );
}

interface ItemType {
  lodCamera?: Vector3;
  /** Item id, plus `@material` when placed items use another surface. */
  key: string;
  model: ItemModel;
  /** Merged geometry of Core parts (owned here); null for packages (owned by ItemPackages). */
  geometry: BufferGeometry | null;
  /** One instanced mesh for Core items; one per package mesh for glTF items. */
  meshes: InstancedMesh[];
  /** Model-space matrix per mesh (null = none), applied before each item's transform. */
  locals: (Matrix4 | null)[];
  /** Instance id at each instanced slot. */
  ids: string[];
  signature: string;
  /**
   * Simpler versions for far away (decision 94): their instanced meshes, and each instance's
   * matrix and color, so instances move between levels as the camera moves.
   */
  levels: Array<{ meshes: InstancedMesh[]; locals: (Matrix4 | null)[] }>;
  matrices: Matrix4[];
  colors: Color[];
  /** World-grown kind with nothing standing now: kept hidden for when it comes back. */
  emptied?: boolean;
}

/** LOD distances (m) for a model about 3 m across; bigger models switch farther away. */
export const LOD_DISTANCES = [25, 60] as const;

/**
 * Renders placed items with one InstancedMesh per item type and keeps a box collider per
 * item. Only item types whose instances changed are updated.
 */
export class ItemsView {
  readonly group = new Group();
  readonly material: Material = new MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.8,
  });
  readonly #types = new Map<string, ItemType>();
  /** One material per surface key (P3-25); plastic is `material` above. */
  readonly #surfaces = new Map<string, Material>();
  readonly #color = new Color();
  readonly #colliders = new Map<string, string>();
  readonly #models = new Map<string, ItemModel>();
  readonly #matrix = new Matrix4();
  readonly #partMatrix = new Matrix4();
  readonly #position = new Vector3();
  readonly #quaternion = new Quaternion();
  readonly #scale = new Vector3();
  #instances: readonly ItemInstance[] = [];
  /** `#instances` by id, kept in step with it (P2-43 task 11 review): `#reapplyOffsets` looks up
   * an instance per slot every time `TerrainView`'s step changes, which is too hot a path for a
   * linear `find` over every instance per slot. */
  #instancesById = new Map<string, ItemInstance>();
  /** Instances the world scattered (P2-40), kept apart because they change as the player moves. */
  #scattered: ItemInstance[] = [];
  /** Loose items move with physics while simulating (P3-26); anchored items never move. */
  #simulating = false;
  /** Map markers of the rules (spawn points, P9-12): seen while building, hidden while playing. */
  #markersVisible = true;
  readonly #loose = new Map<string, { body: RAPIER.RigidBody; signature: string }>();
  /** Moving copies of animated package items, by instance id. */
  readonly #animated = new Map<string, AnimatedItem>();
  /** Called each time a moving item's animation starts again (the runtime plays its sound). */
  onItemLoop: ((event: ItemLoopEvent) => void) | null = null;
  /** Where LOD distances are measured from (the camera), once known. */
  readonly #lodFrom = new Vector3();
  #lodKnown = false;
  #proceduralLodFrom: Vector3 | null = null;
  /** Ground and rest-law context for the coarse-ground offset and plinths (P2-43 task 11). */
  #drawContext: ItemsDrawContext | null = null;
  /** `stepVersion` last seen: offsets are only recomputed when it changes. */
  #offsetVersion = -1;
  /** One InstancedMesh for every `foundation` item's plinth (P2-43 task 11). */
  #plinthMesh: InstancedMesh | null = null;
  #plinthMaterial: Material | null = null;
  #plinthRealistic = false;
  #plinthSignature = '';
  /**
   * What the plinths were last worked out from (P2-43 final review): each placed item with its
   * item id and transform arrays, compared by identity. A command replaces the array it changes,
   * so this notices every edit without writing out every transform, and a sync that changed no
   * placed item (a new scatter list, say) costs one pass of identity checks.
   */
  #plinthInputs: unknown[] = [];
  /**
   * Items away from where they were placed (movement modes), by instance id. Each leaves its
   * instanced batch and is drawn as its own (spec R3: a moving instance never flickers), its placed
   * box collider goes, and a `solid` one gets a moving box others bump into.
   */
  readonly #live = new Map<string, { pose: LivePose; solid: boolean; body: RAPIER.RigidBody | null }>();
  readonly #euler = new Euler(0, 0, 0, 'YXZ');
  /** The document of the last `sync`, so a live pose starting or ending can regroup the batches. */
  #doc: WorldDocument | null = null;

  constructor(
    private readonly physics: PhysicsWorld,
    private readonly resolve: (itemId: string, params?: Readonly<Record<string, unknown>>) => ItemModel = (
      itemId,
      params,
    ) => resolveItem(itemId, undefined, undefined, undefined, params),
  ) {
    this.group.name = 'items';
  }

  /**
   * Ground and rest-law context for render-only drawing fixes (P2-43 task 11): far placed things
   * sit on the ground as it is drawn (coarse LOD), and `foundation` items get a plinth down to the
   * ground. Set once, before the first `sync` (null on places with no `TerrainView`, e.g. block
   * ground, where this does not apply).
   */
  setDrawContext(context: ItemsDrawContext | null): void {
    this.#drawContext = context;
    this.#offsetVersion = -1;
  }

  /**
   * Refreshes the coarse-ground offset of placed items after `TerrainView` changes a chunk's step
   * (call a few times a second, not every frame, like `updateLod`): a cheap no-op unless the step
   * of some chunk actually changed since the last call.
   */
  updateDrawOffsets(): void {
    const ctx = this.#drawContext;
    if (!ctx) return;
    const version = ctx.stepVersion();
    if (version === this.#offsetVersion) return;
    this.#offsetVersion = version;
    for (const type of this.#types.values()) this.#reapplyOffsets(type);
    this.#syncPlinths();
  }

  /** Recomposes every instance's matrix in a type with its current coarse-ground offset. */
  #reapplyOffsets(type: ItemType): void {
    let changed = false;
    type.ids.forEach((id, index) => {
      if (id.startsWith('scatter:') || this.#live.has(id)) return;
      const instance = this.#instancesById.get(id);
      if (!instance) return;
      const { position, rotation, scale } = instance.transform;
      this.#position.set(position[0], position[1], position[2]);
      this.#quaternion.set(rotation[0], rotation[1], rotation[2], rotation[3]);
      this.#scale.set(scale[0], scale[1], scale[2]);
      this.#matrix.compose(this.#position, this.#quaternion, this.#scale);
      this.#applyDrawOffset(instance, this.#matrix);
      this.#setMatrices(type, index, this.#matrix);
      changed = true;
    });
    if (!changed) return;
    if (type.levels.length > 0) this.#distribute(type);
    else
      for (const mesh of type.meshes) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
  }

  /** Shifts a composed matrix's y by the coarse-ground offset (P2-43 task 11), in place. */
  #applyDrawOffset(instance: ItemInstance, matrix: Matrix4): void {
    const ctx = this.#drawContext;
    if (!ctx || instance.instanceId.startsWith('scatter:')) return;
    const [x, , z] = instance.transform.position;
    const step = ctx.stepAt(x, z);
    const exact = ctx.terrain.heightAt(x, z);
    matrix.elements[13] += drawOffset(x, z, exact, step, ctx.terrain);
  }

  /**
   * The ground changed (P2-43 final review): a plinth reaches down to the ground, so the next
   * `sync` works the plinths out again even though no placed item moved.
   */
  groundChanged(): void {
    this.#plinthInputs = [];
  }

  /**
   * The model of an item; with an instance's `params`, the model built with them when the item has a generated
   * look (decision 130). Ordinary items ignore `params`.
   */
  model(itemId: string, params?: Readonly<Record<string, unknown>>): ItemModel {
    const key = modelKey(itemId, params);
    let model = this.#models.get(key);
    if (!model) {
      model = this.resolve(itemId, params);
      const policy = model.lodResidency;
      if (policy && (model.animation || !model.lods?.length || policy.ranges.length !== model.lods.length + 1 ||
        !Number.isFinite(policy.refreshDistance) || policy.refreshDistance <= 0 ||
        policy.ranges.some(([min, max]) => !Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min)))
        throw new Error('Invalid procedural item LOD residency');
      this.#models.set(key, model);
    }
    return model;
  }

  /**
   * Draws an item again with a newly resolved model (a glTF package finished loading):
   * forgets the cached model, rebuilds its meshes, and replaces its colliders.
   */
  reload(itemId: string, doc: WorldDocument): void {
    for (const key of [...this.#models.keys()])
      if (key === itemId || key.startsWith(`${itemId}#`)) this.#models.delete(key);
    for (const [key, type] of [...this.#types]) if (type.model.id === itemId) this.#removeType(key);
    for (const [id, entry] of [...this.#animated]) if (entry.itemId === itemId) this.#removeAnimated(id);
    for (const instance of doc.instances)
      if (instance.itemId === itemId) this.#colliders.delete(`item:${instance.instanceId}`);
    for (const [id, entry] of [...this.#loose]) {
      if (doc.instances.find((instance) => instance.instanceId === id)?.itemId !== itemId) continue;
      this.physics.removeBody(entry.body);
      this.#loose.delete(id);
    }
    this.sync(doc);
  }

  /**
   * The collider boxes of scattered things (P2-40 woods: tree trunks) within `radius` of (x, z).
   * They have no physics body, so the camera checks them itself (`rayBoxDistance`).
   */
  scatteredBoxesNear(x: number, z: number, radius: number): ReturnType<typeof itemColliderBox>[] {
    const boxes: ReturnType<typeof itemColliderBox>[] = [];
    for (const instance of this.#scattered) {
      const [px, , pz] = instance.transform.position;
      if (Math.abs(px - x) > radius || Math.abs(pz - z) > radius) continue;
      const model = this.model(instance.itemId, instance.params);
      if (model.collider === 'none') continue;
      boxes.push(itemColliderBox(model, instance));
    }
    return boxes;
  }

  /** Call after every command. */
  /**
   * Things the world scattered rather than the creator placing them (P2-40): the woods and painted
   * cover. They are drawn as ordinary instances so they get the instancing, LOD, materials and
   * colliders that already work here, instead of a second path that would drift from this one.
   * The list changes as the player moves, so it is kept apart from the document's own items.
   */
  setScattered(instances: readonly ItemInstance[], doc: WorldDocument): void {
    // The same objects, not only the same ids (P2-43 final review): ground worked out again after a
    // sculpt keeps a tree's id but gives it a new height, in a new object.
    const same =
      this.#scattered.length === instances.length && this.#scattered.every((old, i) => old === instances[i]);
    if (same) return;
    this.#scattered = [...instances];
    this.sync(doc);
  }

  sync(doc: WorldDocument): void {
    this.#doc = doc;
    const every = this.#scattered.length === 0 ? doc.instances : [...doc.instances, ...this.#scattered];
    const all = this.#markersVisible ? every : every.filter((instance) => !hiddenInPlay(instance));
    this.#instances = all;
    this.#instancesById = new Map(all.map((instance) => [instance.instanceId, instance]));
    // Animated package items move as their own copies (up to a cap); the rest are instanced.
    const moving = new Map<string, ItemInstance>();
    for (const instance of all) {
      if (moving.size >= MAX_ANIMATED_ITEMS) break;
      if (this.model(instance.itemId, instance.params).animation) moving.set(instance.instanceId, instance);
    }
    for (const instance of moving.values()) this.#syncAnimated(instance);
    for (const id of [...this.#animated.keys()]) if (!moving.has(id)) this.#removeAnimated(id);
    // One instanced mesh per item type and surface (color is per instance).
    const byKey = new Map<string, ItemInstance[]>();
    for (const instance of all) {
      if (moving.has(instance.instanceId)) continue;
      // A live item is drawn on its own, out of its batch (spec R3).
      const key = this.#live.has(instance.instanceId) ? `live:${instance.instanceId}` : typeKey(instance);
      const list = byKey.get(key) ?? [];
      list.push(instance);
      byKey.set(key, list);
    }
    for (const [key, instances] of byKey) this.#syncType(key, instances);
    for (const [key, type] of [...this.#types]) {
      if (byKey.has(key)) continue;
      // World-grown kinds come and go as the camera moves; new meshes make the renderer prepare
      // their shaders again (a stutter on a flying camera, SCROLL-01), so they are only emptied.
      if (type.ids.some((id) => id.startsWith('scatter:'))) this.#emptyType(type);
      else if (!type.emptied) this.#removeType(key);
    }

    // Colliders, one per item that has one; loose items get a moving body while simulating.
    const wanted = new Set<string>();
    const loose = new Set<string>();
    for (const instance of doc.instances) {
      const model = this.model(instance.itemId, instance.params);
      if (model.collider === 'none') continue;
      // A live item's box moves with it (or is the rider's own); the placed one goes.
      if (this.#live.has(instance.instanceId)) continue;
      if (this.#simulating && instance.anchored === false) {
        loose.add(instance.instanceId);
        this.#syncLoose(instance, model);
        continue;
      }
      const key = `item:${instance.instanceId}`;
      wanted.add(key);
      const signature = JSON.stringify([
        modelKey(instance.itemId, instance.params),
        instance.transform,
        instance.floats,
      ]);
      if (this.#colliders.get(key) === signature) continue;
      // Thin items that hang in the air are platforms players jump up through in the side view.
      const box = itemColliderBox(model, instance);
      const oneWay = (instance.floats ?? model.floats ?? false) && box.half[1]! * 2 <= ONE_WAY_THICKNESS;
      this.physics.setStructure(key, [box], [], oneWay);
      this.#colliders.set(key, signature);
    }
    for (const key of [...this.#colliders.keys()]) {
      if (wanted.has(key)) continue;
      this.physics.removeStructure(key);
      this.#colliders.delete(key);
    }
    for (const [id, entry] of [...this.#loose]) {
      if (loose.has(id)) continue;
      this.physics.removeBody(entry.body);
      this.#loose.delete(id);
    }
    // Live items of removed instances go; the others are drawn where they are now.
    for (const [id, entry] of [...this.#live]) {
      if (this.#instancesById.has(id)) {
        this.#applyLive(id);
        continue;
      }
      if (entry.body) this.physics.removeBody(entry.body);
      this.#live.delete(id);
    }
    this.#syncPlinths();
  }

  /**
   * Draws an item at `pose` instead of where it was placed (movement modes), or back where it was
   * placed with null. `solid` gives it a moving box other players bump into; the item the local
   * player steers is not solid here (its rider's controller has the box). Starting or ending a live
   * pose regroups the batches once; moving it only sets its own matrix (no per-frame allocation).
   */
  setLivePose(instanceId: string, pose: LivePose | null, solid = true): void {
    const existing = this.#live.get(instanceId);
    if (!pose) {
      if (!existing) return;
      if (existing.body) this.physics.removeBody(existing.body);
      this.#live.delete(instanceId);
      if (this.#doc) this.sync(this.#doc);
      return;
    }
    const entry = existing ?? { pose: { x: 0, y: 0, z: 0, yaw: 0 }, solid, body: null };
    entry.pose.x = pose.x;
    entry.pose.y = pose.y;
    entry.pose.z = pose.z;
    entry.pose.yaw = pose.yaw;
    entry.pose.pitch = pose.pitch ?? 0;
    entry.pose.roll = pose.roll ?? 0;
    entry.solid = solid;
    if (!existing) this.#live.set(instanceId, entry);
    const instance = this.#doc?.instances.find((i) => i.instanceId === instanceId);
    if (solid && !entry.body && instance) {
      const model = this.model(instance.itemId, instance.params);
      if (model.collider !== 'none') {
        const { min, max } = model.blocks ?? model.bounds;
        const [sx, sy, sz] = instance.transform.scale;
        entry.body = this.physics.addKinematicBox(
          pose,
          pose.yaw,
          {
            x: ((min[0] + max[0]) / 2) * sx,
            y: ((min[1] + max[1]) / 2) * sy,
            z: ((min[2] + max[2]) / 2) * sz,
          },
          {
            x: Math.max(0.05, ((max[0] - min[0]) / 2) * sx),
            y: Math.max(0.05, ((max[1] - min[1]) / 2) * sy),
            z: Math.max(0.05, ((max[2] - min[2]) / 2) * sz),
          },
        );
      }
    } else if (!solid && entry.body) {
      this.physics.removeBody(entry.body);
      entry.body = null;
    }
    if (!existing && this.#doc) this.sync(this.#doc);
    else this.#applyLive(instanceId);
  }

  /** Where an item is drawn now: its live pose, or where it was placed; null for an unknown item. */
  livePose(instanceId: string): LivePose | null {
    const live = this.#live.get(instanceId);
    if (live) return live.pose;
    const instance = this.#instancesById.get(instanceId);
    if (!instance) return null;
    const [x, y, z] = instance.transform.position;
    return { x, y, z, yaw: yawOf(instance.transform.rotation) };
  }

  /** Ids of the items drawn at a live pose now. */
  liveIds(): string[] {
    return [...this.#live.keys()];
  }

  /** The moving box of a live item another player rides, or null (the camera sweep skips it). */
  liveCollider(instanceId: string): { collider: RAPIER.Collider } | null {
    const body = this.#live.get(instanceId)?.body;
    return body && body.numColliders() > 0 ? { collider: body.collider(0) } : null;
  }

  /** A placed item's box in its own space, scaled (seats are laid out in it); null for an unknown item. */
  itemBounds(
    instanceId: string,
  ): { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null {
    const instance = this.#instancesById.get(instanceId);
    if (!instance) return null;
    const { min, max } = this.model(instance.itemId, instance.params).bounds;
    const [sx, sy, sz] = instance.transform.scale;
    return {
      min: {
        x: Math.min(min[0] * sx, max[0] * sx),
        y: Math.min(min[1] * sy, max[1] * sy),
        z: Math.min(min[2] * sz, max[2] * sz),
      },
      max: {
        x: Math.max(min[0] * sx, max[0] * sx),
        y: Math.max(min[1] * sy, max[1] * sy),
        z: Math.max(min[2] * sz, max[2] * sz),
      },
    };
  }

  /** The ride of a placed item (its params, then its library item's default), or null. */
  rideOf(instanceId: string): Ride | null {
    const instance = this.#instancesById.get(instanceId);
    return instance ? rideFromParams(instance.params, getLibraryItem(instance.itemId)?.manifest.ride) : null;
  }

  /**
   * The nearest rideable item whose origin (at its live pose) is within its ride's reach of `feet`,
   * or null. The room judges again from the position it trusts.
   */
  rideableNear(feet: { x: number; y: number; z: number }): { instanceId: string; ride: Ride } | null {
    let best: { instanceId: string; ride: Ride; distance: number } | null = null;
    for (const instance of this.#instances) {
      if (instance.instanceId.startsWith('scatter:')) continue;
      const ride = rideFromParams(instance.params, getLibraryItem(instance.itemId)?.manifest.ride);
      if (!ride) continue;
      const live = this.#live.get(instance.instanceId)?.pose;
      const [px, py, pz] = live ? [live.x, live.y, live.z] : instance.transform.position;
      const distance = Math.hypot(feet.x - px, feet.y - py, feet.z - pz);
      if (distance > ride.reach || (best && distance >= best.distance)) continue;
      best = { instanceId: instance.instanceId, ride, distance };
    }
    return best ? { instanceId: best.instanceId, ride: best.ride } : null;
  }

  /** Puts a live item's drawing (and its moving box) at its live pose. */
  #applyLive(instanceId: string): void {
    const entry = this.#live.get(instanceId);
    const instance = this.#instancesById.get(instanceId);
    if (!entry || !instance) return;
    const { pose } = entry;
    this.#position.set(pose.x, pose.y, pose.z);
    this.#euler.set(pose.pitch ?? 0, pose.yaw, pose.roll ?? 0, 'YXZ');
    this.#quaternion.setFromEuler(this.#euler);
    const [sx, sy, sz] = instance.transform.scale;
    this.#scale.set(sx, sy, sz);
    if (entry.body) {
      entry.body.setNextKinematicTranslation(this.#position);
      entry.body.setNextKinematicRotation({
        x: 0,
        y: Math.sin(pose.yaw / 2),
        z: 0,
        w: Math.cos(pose.yaw / 2),
      });
    }
    const animated = this.#animated.get(instanceId);
    if (animated) {
      animated.root.position.copy(this.#position);
      animated.root.quaternion.copy(this.#quaternion);
      return;
    }
    const type = this.#types.get(`live:${instanceId}`);
    if (!type) return;
    this.#matrix.compose(this.#position, this.#quaternion, this.#scale);
    this.#setMatrices(type, 0, this.#matrix);
    if (type.levels.length > 0) this.#distribute(type);
    else
      for (const mesh of type.meshes) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
  }

  /** Starts or stops physics for loose items; stopping puts every item back where it was saved. */
  setSimulating(on: boolean, doc: WorldDocument): void {
    if (on === this.#simulating) return;
    this.#simulating = on;
    for (const type of this.#types.values()) type.signature = '';
    this.sync(doc);
  }

  /**
   * Shows or hides the map markers of the rules (spawn points, zones; P9-12). Hidden, players see
   * only the zones their designer made visible in play.
   */
  setMarkersVisible(on: boolean, doc: WorldDocument): void {
    if (on === this.#markersVisible) return;
    this.#markersVisible = on;
    this.sync(doc);
  }

  /** (Re)creates the moving body of a loose item when it is new or was edited. */
  #syncLoose(instance: ItemInstance, model: ItemModel): void {
    const signature = JSON.stringify([instance.itemId, instance.transform]);
    const existing = this.#loose.get(instance.instanceId);
    if (existing?.signature === signature) return;
    if (existing) this.physics.removeBody(existing.body);
    this.#loose.set(instance.instanceId, { body: this.#movingBody(instance, model), signature });
  }

  /**
   * Lets items fall and come to rest with physics while building (P2-11 settle): the same moving
   * boxes as loose items in play, against the ground, water floors, walls, and every other item.
   * Runs up to `seconds` of simulated time at once, then returns where each item came to rest;
   * nothing is changed (apply the result as commands). Items without a collider stay where they
   * are (the caller leaves out items meant to float).
   */
  settle(
    doc: WorldDocument,
    instanceIds: readonly string[],
    seconds = 8,
  ): Array<{
    instanceId: string;
    position: [number, number, number];
    rotation: [number, number, number, number];
  }> {
    if (this.#simulating) return [];
    const wanted = new Set(instanceIds);
    const falling: Array<{ instance: ItemInstance; body: RAPIER.RigidBody }> = [];
    for (const instance of doc.instances) {
      if (!wanted.has(instance.instanceId)) continue;
      const model = this.model(instance.itemId, instance.params);
      if (model.collider === 'none') continue;
      // Its fixed box goes while it falls (the next sync puts it back where it lands).
      const key = `item:${instance.instanceId}`;
      this.physics.removeStructure(key);
      this.#colliders.delete(key);
      falling.push({ instance, body: this.#movingBody(instance, model) });
    }
    const dt = 1 / 60;
    for (let step = 0; step < seconds / dt; step += 1) {
      this.physics.step(dt);
      if (falling.every(({ body }) => body.isSleeping())) break;
    }
    const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;
    const rest = falling.map(({ instance, body }) => {
      const t = body.translation();
      const r = body.rotation();
      this.physics.removeBody(body);
      return {
        instanceId: instance.instanceId,
        position: [round(t.x, 3), round(t.y, 3), round(t.z, 3)] as [number, number, number],
        rotation: [round(r.x, 4), round(r.y, 4), round(r.z, 4), round(r.w, 4)] as [
          number,
          number,
          number,
          number,
        ],
      };
    });
    this.sync(doc);
    return rest;
  }

  /** A moving physics body for an item, the way loose items move in play. */
  #movingBody(instance: ItemInstance, model: ItemModel): RAPIER.RigidBody {
    const { position, rotation, scale } = instance.transform;
    // The same box an anchored copy collides with (a tree's trunk), so letting go changes nothing.
    const { min, max } = model.blocks ?? model.bounds;
    return this.physics.addLooseBox(
      { x: position[0], y: position[1], z: position[2] },
      { x: rotation[0], y: rotation[1], z: rotation[2], w: rotation[3] },
      {
        x: ((min[0] + max[0]) / 2) * scale[0],
        y: ((min[1] + max[1]) / 2) * scale[1],
        z: ((min[2] + max[2]) / 2) * scale[2],
      },
      {
        x: Math.max(0.05, ((max[0] - min[0]) / 2) * scale[0]),
        y: Math.max(0.05, ((max[1] - min[1]) / 2) * scale[1]),
        z: Math.max(0.05, ((max[2] - min[2]) / 2) * scale[2]),
      },
    );
  }

  /** Draws loose items where physics moved them (call every frame, after the physics step). */
  updateLoose(): void {
    if (this.#loose.size === 0) return;
    for (const [id, item] of this.#animated) {
      const entry = this.#loose.get(id);
      if (!entry) continue;
      const t = entry.body.translation();
      const r = entry.body.rotation();
      item.root.position.set(t.x, t.y, t.z);
      item.root.quaternion.set(r.x, r.y, r.z, r.w);
    }
    for (const type of this.#types.values()) {
      let changed = false;
      type.ids.forEach((id, index) => {
        const entry = this.#loose.get(id);
        // (Sleeping bodies too: an edit to another item of this type redraws the whole type.)
        if (!entry) return;
        const t = entry.body.translation();
        const r = entry.body.rotation();
        const scale = this.#instances.find((instance) => instance.instanceId === id)?.transform.scale;
        this.#position.set(t.x, t.y, t.z);
        this.#quaternion.set(r.x, r.y, r.z, r.w);
        this.#scale.set(scale?.[0] ?? 1, scale?.[1] ?? 1, scale?.[2] ?? 1);
        this.#matrix.compose(this.#position, this.#quaternion, this.#scale);
        this.#setMatrices(type, index, this.#matrix);
        changed = true;
      });
      if (changed && type.levels.length > 0) this.#distribute(type);
      else if (changed) {
        for (const mesh of type.meshes) {
          mesh.instanceMatrix.needsUpdate = true;
          mesh.computeBoundingSphere();
        }
      }
    }
  }

  /**
   * Advances the animations of moving items (call every frame). Far copies move every few frames
   * by the time of all of them, so they keep the same speed with less work.
   */
  update(dt: number): void {
    for (const item of this.#animated.values()) {
      item.wait += dt;
      item.frames += 1;
      if (item.frames < ANIMATION_EVERY[item.level]!) continue;
      item.mixer.update(item.wait);
      item.wait = 0;
      item.frames = 0;
    }
  }

  /**
   * Moves items between their LOD levels by distance from the camera (decision 94); call a few
   * times a second, not every frame.
   */
  updateLod(camera: Vector3): void {
    this.#lodFrom.copy(camera);
    this.#lodKnown = true;
    this.updateProceduralLod(camera);
    for (const type of this.#types.values()) if (type.levels.length > 0 && !type.model.lodResidency) this.#distribute(type);
    for (const item of this.#animated.values()) {
      const model = this.model(item.itemId);
      const level = this.#levelAt(model.bounds, model.lods?.length ?? 0, item.root.position);
      if (level === item.level) continue;
      for (const { mesh, geometries } of item.swaps) mesh.geometry = geometries[level]!;
      item.level = level;
    }
  }

  /** Cheap every-frame camera check for opted-in shader LODs; buffers refill only after
   * the declared movement threshold, or through normal instance-edit synchronization. */
  updateProceduralLod(camera: Vector3): void {
    (this.#proceduralLodFrom ??= new Vector3()).copy(camera);
    for (const type of this.#types.values()) {
      const policy = type.model.lodResidency;
      if (!policy) continue;
      if (!type.lodCamera || type.lodCamera.distanceToSquared(camera) >= policy.refreshDistance ** 2)
        this.#distribute(type, camera);
    }
  }

  /** The LOD level for a copy at `position`: bigger models switch farther away. */
  #levelAt(bounds: ItemBounds, levels: number, position: Vector3): number {
    if (!this.#lodKnown) return 0;
    const { min, max } = bounds;
    const across = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    const factor = Math.max(1, across / 3);
    const distance = position.distanceTo(this.#lodFrom);
    let level = 0;
    while (level < levels && distance > LOD_DISTANCES[level]! * factor) level += 1;
    return level;
  }

  /** Writes each instance into the level for its distance (the full model until the camera is known). */
  #distribute(type: ItemType, camera?: Vector3): void {
    const all = [{ meshes: type.meshes, locals: type.locals }, ...type.levels];
    const policy = type.model.lodResidency;
    if (camera) (type.lodCamera ??= new Vector3()).copy(camera);
    const from = type.lodCamera ?? this.#proceduralLodFrom ?? (this.#lodKnown ? this.#lodFrom : null);
    const counts = all.map(() => 0);
    // Which instance each slot of each level shows (raycast hits map back through it).
    const slots: string[][] = all.map(() => []);
    type.matrices.forEach((matrix, index) => {
      this.#position.setFromMatrixPosition(matrix);
      const distance = from ? this.#position.distanceTo(from) : 0;
      const selected = policy?.forceNear?.(matrix) ? [0] : policy
        ? (from ? policy.ranges.flatMap(([min, max], level) => distance >= min && distance <= max ? [level] : []) : [0])
        : [this.#levelAt(type.model.bounds, type.levels.length, this.#position)];
      for (const level of selected) {
        const target = all[level]!;
        const slot = counts[level]!++;
        slots[level]![slot] = type.ids[index]!;
        target.meshes.forEach((mesh, part) => {
          const local = target.locals[part];
          mesh.setMatrixAt(slot, local ? this.#partMatrix.multiplyMatrices(matrix, local) : matrix);
          mesh.setColorAt(slot, type.colors[index]!);
        });
      }
    });
    all.forEach((level, index) => {
      for (const mesh of level.meshes) {
        mesh.userData.slots = slots[index];
        mesh.count = counts[index]!;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
    });
  }

  /** Number of moving copies drawn now (tests, stats). */
  get animatedCount(): number {
    return this.#animated.size;
  }

  /** Creates the moving copy of an animated item, or moves it when it was edited. */
  #syncAnimated(instance: ItemInstance): void {
    const color = typeof instance.params.color === 'string' ? instance.params.color : null;
    const signature = JSON.stringify([instance.itemId, instance.transform, color]);
    let item = this.#animated.get(instance.instanceId);
    if (item?.signature === signature) return;
    if (!item) {
      const model = this.model(instance.itemId, instance.params);
      const animation = model.animation!;
      // SkeletonUtils keeps skinned meshes bound to their own copied bones.
      const root = cloneSkinned(animation.scene);
      // Names stay (animation tracks find their parts by name); raycasts read the instance id.
      root.userData.itemInstanceId = instance.instanceId;
      // Copied materials: the clone shares them with the loaded model and every other copy.
      const materials: AnimatedItem['materials'] = [];
      const copies = new Map<Material, Material>();
      const own = (material: Material) => {
        let copy = copies.get(material);
        if (!copy) {
          copy = material.clone();
          copies.set(material, copy);
          const base = (copy as Material & { color?: Color }).color;
          materials.push({ material: copy, base: base ? base.clone() : null });
        }
        return copy;
      };
      root.traverse((object) => {
        object.castShadow = true;
        object.receiveShadow = true;
        const mesh = object as Mesh;
        if (mesh.isMesh)
          mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material);
      });
      const mixer = new AnimationMixer(root);
      const clip = idleClip(animation.clips);
      if (clip) {
        mixer.clipAction(clip).play();
        const sound = loopSound(model, clip.name);
        mixer.addEventListener('loop', () =>
          this.onItemLoop?.({
            instanceId: instance.instanceId,
            itemId: instance.itemId,
            position: root.getWorldPosition(new Vector3()),
            sound,
          }),
        );
      }
      // Its triangle lists per LOD level: a level made by Genvr shares the mesh's vertices (and
      // skin data); other levels are not used by moving copies.
      const swaps: AnimatedItem['swaps'] = [];
      root.traverse((object) => {
        const mesh = object as Mesh;
        if (!mesh.isMesh) return;
        const index = model.meshes?.findIndex((part) => part.geometry === mesh.geometry) ?? -1;
        const position = mesh.geometry.getAttribute('position');
        const geometries = [
          mesh.geometry,
          ...(model.lods ?? []).map((level) => {
            const lod = level[index]?.geometry;
            return lod && lod.getAttribute('position') === position ? lod : mesh.geometry;
          }),
        ];
        if (geometries.some((geometry) => geometry !== mesh.geometry)) swaps.push({ mesh, geometries });
      });
      this.group.add(root);
      item = {
        itemId: instance.itemId,
        root,
        mixer,
        signature: '',
        materials,
        tint: null,
        swaps,
        level: 0,
        wait: 0,
        frames: 0,
      };
      this.#animated.set(instance.instanceId, item);
    }
    const { position, rotation, scale } = instance.transform;
    item.root.position.set(position[0], position[1], position[2]);
    item.root.quaternion.set(rotation[0], rotation[1], rotation[2], rotation[3]);
    item.root.scale.set(scale[0], scale[1], scale[2]);
    // Item color (P3-25) tints the copy like the instanced items; white keeps its own colors.
    if (color !== item.tint) {
      this.#color.set(color ?? 0xffffff);
      for (const { material, base } of item.materials)
        if (base && material.color) material.color.copy(base).multiply(this.#color);
      item.tint = color;
    }
    item.signature = signature;
  }

  #removeAnimated(instanceId: string): void {
    const item = this.#animated.get(instanceId);
    if (!item) return;
    item.mixer.stopAllAction();
    item.mixer.uncacheRoot(item.root);
    for (const { material } of item.materials) material.dispose();
    this.group.remove(item.root);
    this.#animated.delete(instanceId);
  }

  #surfaceMaterial(key: string | undefined): Material {
    const surface = getSurface(key);
    if (surface.key === 'plastic') return this.material;
    let material = this.#surfaces.get(surface.key);
    if (!material) {
      const { roughness, metalness, opacity, glow } = surface.look;
      material = new MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
        roughness,
        metalness,
        transparent: opacity < 1,
        opacity,
        emissive: new Color(glow > 0 ? 0x999999 : 0x000000),
        emissiveIntensity: glow,
      });
      this.#surfaces.set(surface.key, material);
    }
    return material;
  }

  #syncType(key: string, instances: ItemInstance[]): void {
    const itemId = instances[0]!.itemId;
    const signature = JSON.stringify(
      instances.map((i) => [i.instanceId, i.transform, i.params.color ?? null]),
    );
    let type = this.#types.get(key);
    if (type?.signature === signature) return;
    if (!type || type.meshes[0]!.instanceMatrix.count < instances.length) {
      const capacity = Math.max(8, instances.length * 2);
      const model = type?.model ?? this.model(itemId, instances[0]!.params);
      for (const mesh of [
        ...(type?.meshes ?? []),
        ...(type?.levels.flatMap((level) => level.meshes) ?? []),
      ]) {
        this.group.remove(mesh);
        mesh.dispose();
      }
      const surfaceKey = instances[0]!.params.material;
      const surface = this.#surfaceMaterial(typeof surfaceKey === 'string' ? surfaceKey : undefined);
      // Core items: one merged geometry; packages: their own geometries and materials.
      const geometry = model.meshes ? null : (type?.geometry ?? itemGeometry(model.parts));
      const parts = model.meshes
        ? model.meshes.map((part) => ({
            geometry: part.geometry,
            material: part.material,
            local: part.matrix,
            setupInstance: part.setupInstance,
          }))
        : [{ geometry: geometry!, material: surface, local: null }];
      const instanced = (part: { geometry: BufferGeometry; material: Material; setupInstance?: PackageMesh['setupInstance'] }) => {
        const mesh = new InstancedMesh(part.geometry, part.material, capacity);
        mesh.name = `items:${key}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const cleanup = part.setupInstance?.(mesh);
        if (cleanup) {
          const disposeBinding = () => {
            mesh.removeEventListener('dispose', disposeBinding);
            cleanup();
          };
          mesh.addEventListener('dispose', disposeBinding);
        }
        this.group.add(mesh);
        return mesh;
      };
      const meshes = parts.map(instanced);
      const levels = (model.lods ?? []).map((lod) => ({
        meshes: lod.map(instanced),
        locals: lod.map((part) => part.matrix),
      }));
      type = {
        ...(type?.lodCamera ? { lodCamera: type.lodCamera.clone() } : {}),
        key,
        model,
        geometry,
        meshes,
        locals: parts.map((part) => part.local),
        ids: [],
        signature: '',
        levels,
        matrices: [],
        colors: [],
      };
      this.#types.set(key, type);
    }
    if (type.emptied) {
      type.emptied = false;
      for (const mesh of [...type.meshes, ...type.levels.flatMap((level) => level.meshes)]) mesh.visible = true;
    }
    type.ids = instances.map((i) => i.instanceId);
    instances.forEach((instance, index) => {
      const { position, rotation, scale } = instance.transform;
      this.#position.set(position[0], position[1], position[2]);
      this.#quaternion.set(rotation[0], rotation[1], rotation[2], rotation[3]);
      this.#scale.set(scale[0], scale[1], scale[2]);
      this.#matrix.compose(this.#position, this.#quaternion, this.#scale);
      this.#applyDrawOffset(instance, this.#matrix);
      this.#setMatrices(type, index, this.#matrix);
      // Item color (P3-25) tints the item; white keeps its own colors.
      const color = instance.params.color;
      this.#color.set(typeof color === 'string' ? color : 0xffffff);
      if (type.levels.length > 0) type.colors[index] = this.#color.clone();
      else for (const mesh of type.meshes) mesh.setColorAt(index, this.#color);
    });
    if (type.levels.length > 0) {
      type.matrices.length = instances.length;
      type.colors.length = instances.length;
      this.#distribute(type);
    } else
      for (const mesh of type.meshes) {
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.count = instances.length;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
    type.signature = signature;
  }

  /**
   * Sets one slot of every mesh of a type from the item's matrix (and each mesh's own place).
   * Types with LOD levels keep the matrix; `#distribute` writes the levels.
   */
  #setMatrices(type: ItemType, index: number, matrix: Matrix4): void {
    if (type.levels.length > 0) {
      (type.matrices[index] ??= new Matrix4()).copy(matrix);
      return;
    }
    type.meshes.forEach((mesh, part) => {
      const local = type.locals[part];
      mesh.setMatrixAt(index, local ? this.#partMatrix.multiplyMatrices(matrix, local) : matrix);
    });
  }

  /** Keeps a type's meshes (and the renderer's work for them) but draws nothing. */
  #emptyType(type: ItemType): void {
    type.ids = [];
    type.matrices.length = 0;
    type.colors.length = 0;
    type.signature = '';
    type.emptied = true;
    for (const mesh of [...type.meshes, ...type.levels.flatMap((level) => level.meshes)]) {
      mesh.count = 0;
      mesh.visible = false;
    }
  }

  #removeType(key: string): void {
    const type = this.#types.get(key);
    if (!type) return;
    for (const mesh of [...type.meshes, ...type.levels.flatMap((level) => level.meshes)]) {
      this.group.remove(mesh);
      mesh.dispose();
    }
    // Other surfaces of the same item may still share the geometry.
    if (
      type.geometry &&
      ![...this.#types.values()].some((other) => other !== type && other.geometry === type.geometry)
    )
      type.geometry.dispose();
    this.#types.delete(key);
  }

  /**
   * Draws every `foundation` item's plinth (P2-43 task 11): a box under its base, as wide as the
   * base and deep enough to reach the lowest ground under it, the way `rest()` itself would size
   * one. One `InstancedMesh` for all of them; only items whose rule is `foundation` and whose
   * plinth is deep enough to matter (matching the rest law's own tolerance) get one.
   */
  #syncPlinths(): void {
    const ctx = this.#drawContext;
    if (!ctx) {
      if (this.#plinthMesh) this.#plinthMesh.count = 0;
      return;
    }
    const realistic = ctx.realistic();
    // The step version is part of the memo (P2-43 task 11 review round 1): a plinth's y follows
    // the same coarse-ground offset as its item, so a pure step change (no instance edited) must
    // still re-sync it. So must an edited placed item (P2-43 final review: compared by identity,
    // see `#plinthInputs`) and changed ground under one (`groundChanged`).
    // A live item's plinth would stay behind where it was placed: none while it moves.
    const placed = this.#instances.filter(
      (instance) => !instance.instanceId.startsWith('scatter:') && !this.#live.has(instance.instanceId),
    );
    const inputs = placed.flatMap((instance) => [
      instance,
      instance.itemId,
      instance.transform.position,
      instance.transform.rotation,
      instance.transform.scale,
    ]);
    const signature = `${realistic}|${ctx.stepVersion()}`;
    const same =
      signature === this.#plinthSignature &&
      inputs.length === this.#plinthInputs.length &&
      inputs.every((input, i) => input === this.#plinthInputs[i]);
    if (same) return;
    this.#plinthSignature = signature;
    this.#plinthInputs = inputs;
    const surfaces = ctx.surfaces();
    const boxes: Matrix4[] = [];
    for (const instance of placed) {
      const shape = ctx.shapeOf(instance.itemId);
      if (!shape || shape.rule.mode !== 'foundation') continue;
      const result = rest(instance, shape, surfaces);
      if (result.plinth <= PLINTH_MIN) continue;
      const [x, , z] = instance.transform.position;
      const step = ctx.stepAt(x, z);
      const offsetY = drawOffset(x, z, ctx.terrain.heightAt(x, z), step, ctx.terrain);
      boxes.push(plinthMatrix(instance, shape, result.plinth, offsetY));
    }
    if (boxes.length === 0) {
      if (this.#plinthMesh) this.#plinthMesh.count = 0;
      return;
    }
    if (
      !this.#plinthMesh ||
      this.#plinthMesh.instanceMatrix.count < boxes.length ||
      this.#plinthRealistic !== realistic
    ) {
      if (this.#plinthMesh) {
        this.group.remove(this.#plinthMesh);
        this.#plinthMesh.geometry.dispose();
        this.#plinthMesh.dispose();
      }
      this.#plinthMaterial?.dispose();
      this.#plinthMaterial = new MeshStandardMaterial({
        color: realistic ? PLINTH_COLOR_REALISTIC : PLINTH_COLOR_OTHER,
        flatShading: true,
        roughness: 0.9,
      });
      this.#plinthRealistic = realistic;
      const capacity = Math.max(8, boxes.length * 2);
      this.#plinthMesh = new InstancedMesh(new BoxGeometry(1, 1, 1), this.#plinthMaterial, capacity);
      this.#plinthMesh.name = 'items:plinths';
      this.#plinthMesh.castShadow = true;
      this.#plinthMesh.receiveShadow = true;
      this.group.add(this.#plinthMesh);
    }
    boxes.forEach((matrix, index) => this.#plinthMesh!.setMatrixAt(index, matrix));
    this.#plinthMesh.count = boxes.length;
    this.#plinthMesh.instanceMatrix.needsUpdate = true;
    this.#plinthMesh.computeBoundingSphere();
  }

  /**
   * Nearest unlocked item whose bounding box the ray passes through. Boxes (not exact triangles) make
   * thin items such as fences and lamps easy to tap on a phone.
   */
  pick(ray: Ray, ignore?: string | null): string | null {
    let best: { id: string; distance: number } | null = null;
    const local = new Ray();
    const box = new Box3();
    const hit = new Vector3();
    const inverse = new Matrix4();
    for (const instance of this.#instances) {
      // Locked items cannot be picked in the 3D view (P3-26); the explorer still selects them.
      if (instance.instanceId === ignore || instance.locked) continue;
      const { position, rotation, scale } = instance.transform;
      const { bounds } = this.model(instance.itemId, instance.params);
      this.#position.set(position[0], position[1], position[2]);
      this.#quaternion.set(rotation[0], rotation[1], rotation[2], rotation[3]);
      this.#scale.set(scale[0], scale[1], scale[2]);
      inverse.compose(this.#position, this.#quaternion, this.#scale).invert();
      local.copy(ray).applyMatrix4(inverse);
      box.min.set(bounds.min[0], bounds.min[1], bounds.min[2]);
      box.max.set(bounds.max[0], bounds.max[1], bounds.max[2]);
      if (!local.intersectBox(box, hit)) continue;
      hit.applyMatrix4(this.#matrix.compose(this.#position, this.#quaternion, this.#scale));
      const distance = hit.distanceTo(ray.origin);
      if (!best || distance < best.distance) best = { id: instance.instanceId, distance };
    }
    return best?.id ?? null;
  }

  /**
   * Instance id of a raycast hit on an item, or null: an instanced mesh (by its name and slot)
   * or a part of a moving copy (by its root). Also accepts a mesh name alone.
   */
  instanceIdAt(hit: string | Object3D, instanceIndex: number | undefined): string | null {
    // Items with LOD levels: each level's slots are listed on its meshes.
    const slots: unknown = typeof hit === 'string' ? undefined : hit.userData.slots;
    if (Array.isArray(slots) && instanceIndex !== undefined) return (slots[instanceIndex] as string) ?? null;
    if (typeof hit !== 'string') {
      for (let object: Object3D | null = hit; object; object = object.parent) {
        const id = object.userData.itemInstanceId;
        if (typeof id === 'string') return id;
      }
    }
    const meshName = typeof hit === 'string' ? hit : hit.name;
    if (!meshName.startsWith('items:') || instanceIndex === undefined) return null;
    return this.#types.get(meshName.slice('items:'.length))?.ids[instanceIndex] ?? null;
  }

  /** A single (non-instanced) mesh of an item, e.g. for the ghost preview. */
  /**
   * The climbable item (ladder) the player touches at `feet`, or null: the feet are inside its
   * collider box grown by `CLIMB_REACH` across, from just below its bottom to a little
   * above its top.
   */
  climbableAt(feet: { x: number; y: number; z: number }): Climbable | null {
    let best: Climbable | null = null;
    for (const instance of this.#instances) {
      const model = this.model(instance.itemId, instance.params);
      if (!model.climbable) continue;
      const box = itemColliderBox(model, instance);
      const [cx, cy, cz] = box.center as [number, number, number];
      const [hx, hy, hz] = box.half as [number, number, number];
      const bottom = cy - hy;
      const top = cy + hy;
      // A little above the top still holds: players climb over the top edge to step off.
      if (feet.y < bottom - 0.3 || feet.y > top + CLIMB_OVER + 0.05) continue;
      // Feet in the ladder's own frame (turned about Y).
      const dx = feet.x - cx;
      const dz = feet.z - cz;
      const cos = Math.cos(box.yaw);
      const sin = Math.sin(box.yaw);
      const u = dx * cos - dz * sin;
      const v = dx * sin + dz * cos;
      if (Math.abs(u) > hx + CLIMB_REACH || Math.abs(v) > hz + CLIMB_REACH) continue;
      if (!best || top > best.top)
        best = { instanceId: instance.instanceId, top, bottom, yaw: box.yaw, x: cx, z: cz };
    }
    return best;
  }

  previewMesh(itemId: string, material: Material): Mesh {
    const model = this.model(itemId);
    if (model.meshes) return new Mesh(mergedPackageGeometry(model.meshes), material);
    const type = [...this.#types.values()].find((entry) => entry.model.id === itemId && entry.geometry);
    const geometry = type?.geometry ? type.geometry.clone() : itemGeometry(model.parts);
    return new Mesh(geometry, material);
  }

  dispose(): void {
    for (const itemId of [...this.#types.keys()]) this.#removeType(itemId);
    for (const id of [...this.#animated.keys()]) this.#removeAnimated(id);
    for (const key of this.#colliders.keys()) this.physics.removeStructure(key);
    this.#colliders.clear();
    for (const entry of this.#loose.values()) this.physics.removeBody(entry.body);
    this.#loose.clear();
    for (const entry of this.#live.values()) if (entry.body) this.physics.removeBody(entry.body);
    this.#live.clear();
    this.material.dispose();
    for (const material of this.#surfaces.values()) material.dispose();
    if (this.#plinthMesh) {
      this.group.remove(this.#plinthMesh);
      this.#plinthMesh.geometry.dispose();
      this.#plinthMesh.dispose();
    }
    this.#plinthMaterial?.dispose();
  }
}
