import { getBlock, getCoreItem, itemParts, type BlockStyle } from '@genvr/core-library';
import { PLAYER_BLOCKS } from '@genvr/contracts';
import {
  Block,
  BLOCKS,
  isSolidBlock,
  VOXEL_LAYERS,
  VOXEL_MIN_Y,
  type BlockName,
  type VoxelData,
} from '@genvr/world';
import {
  BoxGeometry,
  CanvasTexture,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  SRGBColorSpace,
  type BufferGeometry,
  type Object3D,
  type Ray,
} from 'three/webgpu';
import type { HandGrip } from './avatar.js';
import { itemGeometry } from './items.js';

/** Place puts the block in hand on the face pointed at; Dig takes the block pointed at. */
export type HandsMode = 'place' | 'dig';

/** Blocks players build with in play, in picker order (decision 109). */
export const HAND_BLOCKS: readonly BlockName[] = [
  'grass',
  'dirt',
  'sand',
  'stone',
  'snow',
  'gravel',
  'planks',
  'cobble',
  'brick',
  'paving',
  'path',
];

/** How far players reach from their chest to the middle of a block, in play (the room allows 6 m). */
export const HAND_REACH = 5;

type Cell = [number, number, number];

/** The first solid block along a ray, and the empty cell in front of it (where a block goes). */
export interface RayBlock {
  hit: Cell;
  before: Cell | null;
}

/**
 * Walks the block grid along a ray (Amanatides and Woo) up to `max` meters: the first block that
 * is not air or water, and the cell the ray crossed just before it. Exact and independent of the
 * drawn meshes (far chunks are drawn with less detail).
 */
export function rayBlock(voxels: VoxelData, ray: Ray, max: number): RayBlock | null {
  const { origin: o, direction: d } = ray;
  const cell: Cell = [Math.floor(o.x), Math.floor(o.y), Math.floor(o.z)];
  const dir = [d.x, d.y, d.z] as const;
  const pos = [o.x, o.y, o.z] as const;
  const step = dir.map((v) => (v > 0 ? 1 : v < 0 ? -1 : 0));
  const delta = dir.map((v) => (v === 0 ? Infinity : Math.abs(1 / v)));
  const next = [0, 1, 2].map((i) => {
    if (dir[i] === 0) return Infinity;
    const edge = dir[i]! > 0 ? cell[i]! + 1 - pos[i]! : pos[i]! - cell[i]!;
    return edge * delta[i]!;
  });
  let before: Cell | null = null;
  let travelled = 0;
  while (travelled <= max) {
    if (isSolidBlock(voxels.block(cell[0], cell[1], cell[2]))) return { hit: [...cell], before };
    before = [...cell];
    const axis = next[0]! < next[1]! ? (next[0]! < next[2]! ? 0 : 2) : next[1]! < next[2]! ? 1 : 2;
    travelled = next[axis]!;
    next[axis]! += delta[axis]!;
    cell[axis]! += step[axis]!;
    if (cell[1] < VOXEL_MIN_Y - 1 || cell[1] > VOXEL_MIN_Y + VOXEL_LAYERS + 1) return null;
  }
  return null;
}

interface PlayerHandsOptions {
  scene: Object3D;
  voxels: VoxelData;
  /** The view ray through a screen position. */
  ray: (clientX: number, clientY: number) => Ray;
  /** Meters from the camera to the player, so aiming reaches past them. */
  cameraDistance: () => number;
  /** The player's feet. */
  player: () => { x: number; y: number; z: number };
  /** The place's spawn point (nobody builds near it). */
  spawn: readonly [number, number, number];
  /** Sends a place or dig request to the room; false when there is no room to send it to. */
  send: (blocks: Array<[number, number, number, number]>) => boolean;
  /** The block look of the place, for the block in hand. */
  blockStyle: BlockStyle;
}

/**
 * A block's side as a small sharp picture (clean or pixel, as the place looks), made once per
 * block: the block in hand of the player and of everyone else.
 */
export class BlockFaces {
  readonly #faces = new Map<BlockName, CanvasTexture | null>();

  constructor(private readonly style: BlockStyle) {}

  get(block: BlockName): CanvasTexture | null {
    if (this.#faces.has(block)) return this.#faces.get(block)!;
    const texture = this.#make(block);
    this.#faces.set(block, texture);
    return texture;
  }

  #make(block: BlockName): CanvasTexture | null {
    const look = getBlock(block)?.look;
    if (!look || typeof document === 'undefined') return null;
    const pixels = this.style === 'plain' ? look.plain.side : look.side;
    const size = Math.round(Math.sqrt(pixels.length));
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) return null;
    const image = context.createImageData(size, size);
    pixels.forEach((color, i) =>
      image.data.set([(color >> 16) & 255, (color >> 8) & 255, color & 255, 255], i * 4),
    );
    context.putImageData(image, 0, 0);
    const texture = new CanvasTexture(canvas);
    texture.magFilter = texture.minFilter = NearestFilter;
    texture.colorSpace = SRGBColorSpace;
    return texture;
  }

  dispose(): void {
    for (const texture of this.#faces.values()) texture?.dispose();
    this.#faces.clear();
  }
}

/** A block to hold: a small cube, shaded and casting a shadow. */
export function heldBlockMesh(): Mesh<BoxGeometry, MeshStandardMaterial> {
  const mesh = new Mesh(new BoxGeometry(0.22, 0.22, 0.22), new MeshStandardMaterial({ roughness: 0.9 }));
  mesh.name = 'hands-block';
  mesh.castShadow = true;
  return mesh;
}

/**
 * A Core Library item to hold (a game's tool, P9-12): its parts as one mesh, shaded and casting a
 * shadow; null for items that are not in the Core Library.
 */
export function heldItemMesh(itemId: string): Mesh<BufferGeometry, MeshStandardMaterial> | null {
  const core = getCoreItem(itemId);
  if (!core) return null;
  const mesh = new Mesh(
    itemGeometry(itemParts(core)),
    new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6 }),
  );
  mesh.name = 'hands-item';
  mesh.userData.itemId = itemId;
  mesh.castShadow = true;
  return mesh;
}

/** Where the hand holds an item: the grip, 0.1 m above the item's origin (a held tool's end rests at 0). */
const GRIP_HEIGHT = 0.1;
/** A block sits just past the fingers, a little low and in front of the palm. */
const BLOCK_OFFSET = { along: 0.08, y: -0.02, z: 0.1 } as const;

/**
 * Puts what a player holds in their right hand (blocks, decision 109; game tools, P9-12), the one
 * way for the local player and everyone else: the hand's bone carries it at the palm. A block sits
 * just past the fingers; an item's grip is in the fist with its +y (a tool's long head) pointing
 * forward (+z). Without a hand it is taken away.
 */
export function holdInRightHand(object: Object3D, hand: HandGrip | null, kind: 'block' | 'item'): void {
  if (!hand) {
    object.removeFromParent();
    return;
  }
  if (object.parent === hand.bone) return;
  hand.bone.add(object);
  if (kind === 'block') {
    object.rotation.set(0, 0, 0);
    object.position
      .copy(hand.palm)
      .addScaledVector(hand.along, BLOCK_OFFSET.along)
      .add({ x: 0, y: BLOCK_OFFSET.y, z: BLOCK_OFFSET.z });
  } else {
    // A quarter turn about x takes the item's +y to +z; the grip lands in the palm.
    object.rotation.set(Math.PI / 2, 0, 0);
    object.position.copy(hand.palm).add({ x: 0, y: 0, z: -GRIP_HEIGHT });
  }
}

/**
 * The game tool in the local player's right hand (P9-12): made from its Core Library item when
 * it changes, kept in the hand bone as the skeleton changes, and thrown away when put down.
 */
export class HeldTool {
  #mesh: Mesh<BufferGeometry, MeshStandardMaterial> | null = null;

  /** The item in hand; null for none (or an item that is not in the Core Library). */
  get itemId(): string | null {
    return (this.#mesh?.userData.itemId as string | undefined) ?? null;
  }

  get mesh(): Object3D | null {
    return this.#mesh;
  }

  set(itemId: string | null): void {
    if (this.itemId === itemId) return;
    this.dispose();
    this.#mesh = itemId ? heldItemMesh(itemId) : null;
  }

  /** Keeps the tool in the right hand (call every frame: the skeleton changes with the body type). */
  holdIn(hand: HandGrip | null): void {
    if (this.#mesh) holdInRightHand(this.#mesh, hand, 'item');
  }

  /** Hides the tool without dropping it (a knocked-out player, P9-12). */
  setVisible(on: boolean): void {
    if (this.#mesh) this.#mesh.visible = on;
  }

  dispose(): void {
    if (!this.#mesh) return;
    this.#mesh.removeFromParent();
    this.#mesh.geometry.dispose();
    this.#mesh.material.dispose();
    this.#mesh = null;
  }
}

/**
 * The Strike clip as an emote (P9-12), when the avatar has it: played once and not stopped by
 * moving (fights happen on the run). Null without the clip; it is only the look of a strike.
 */
export function strikeEmote(
  clips: readonly string[],
  duration: (clip: string) => number,
): { clip: string; left: number; moving: true } | null {
  return clips.includes('Strike') ? { clip: 'Strike', left: duration('Strike'), moving: true } : null;
}

/** The player's capsule, as a box (from P2-05). */
const BODY = { halfWidth: 0.35, height: 1.8 };

/**
 * Building with the avatar's hands in play (decision 109, P2-28 stage 2): point at a block (the
 * mouse on computers, a tap on phones), dig it or put the block in hand on the face pointed at,
 * within reach. An outline shows the block that will change; the block in hand sits in the
 * avatar's right hand. The room decides (rights, shares, protected blocks) and shares the result;
 * this class only checks what it can see, so players get quick answers.
 */
export class PlayerHands {
  #block: BlockName = 'planks';
  #on = false;
  readonly #outline: LineSegments<EdgesGeometry, LineBasicMaterial>;
  readonly #held: Mesh<BoxGeometry, MeshStandardMaterial>;
  readonly #faces: BlockFaces;

  constructor(private readonly options: PlayerHandsOptions) {
    this.#outline = new LineSegments(
      new EdgesGeometry(new BoxGeometry(1.02, 1.02, 1.02)),
      new LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.85 }),
    );
    this.#outline.name = 'hands-target';
    this.#outline.userData.helper = true;
    this.#outline.renderOrder = 10;
    this.#outline.visible = false;
    options.scene.add(this.#outline);
    this.#held = heldBlockMesh();
    this.#held.visible = false;
    this.#faces = new BlockFaces(options.blockStyle);
  }

  get active(): boolean {
    return this.#on;
  }

  get block(): BlockName {
    return this.#block;
  }

  /** Turns building on or off (the room allows it, the place has blocks, and the player plays). */
  setActive(on: boolean): void {
    this.#on = on;
    this.#held.visible = on;
    if (!on) this.#outline.visible = false;
  }

  /** The block in hand. */
  setBlock(block: BlockName): void {
    this.#block = block;
    this.#held.material.map = this.#faces.get(block);
    this.#held.material.needsUpdate = true;
  }

  /** Keeps the block in the right hand (the skeleton changes with the body type). */
  holdIn(hand: HandGrip | null): void {
    holdInRightHand(this.#held, hand, 'block');
  }

  /** The block a screen position points at within reach, and where a new block would go. */
  #aim(clientX: number, clientY: number): { hit: Cell; before: Cell | null } | null {
    const ray = this.options.ray(clientX, clientY);
    const found = rayBlock(this.options.voxels, ray, this.options.cameraDistance() + HAND_REACH + 1);
    if (!found) return null;
    const feet = this.options.player();
    const far = ([x, y, z]: Cell) =>
      Math.hypot(x + 0.5 - feet.x, y + 0.5 - (feet.y + 1.2), z + 0.5 - feet.z) > HAND_REACH;
    return far(found.hit)
      ? null
      : { hit: found.hit, before: found.before && !far(found.before) ? found.before : null };
  }

  /** Shows the outline around the block the mouse points at (or hides it). */
  hover(clientX: number, clientY: number, mode: HandsMode): void {
    if (!this.#on) return;
    const aim = this.#aim(clientX, clientY);
    const cell = aim ? (mode === 'dig' ? aim.hit : aim.before) : null;
    this.#outline.visible = cell !== null;
    if (cell) this.#outline.position.set(cell[0] + 0.5, cell[1] + 0.5, cell[2] + 0.5);
  }

  hide(): void {
    this.#outline.visible = false;
  }

  /** Digs or places at a screen position; returns why it could not, or null when it was sent. */
  use(clientX: number, clientY: number, mode: HandsMode): string | null {
    if (!this.#on) return 'Building is off here.';
    const aim = this.#aim(clientX, clientY);
    if (!aim) return 'Point at a block closer to you.';
    const cell = mode === 'dig' ? aim.hit : aim.before;
    if (!cell) return 'There is no room for a block there.';
    const [x, y, z] = cell;
    const voxels = this.options.voxels;
    if (!voxels.inside(x, z) || y <= VOXEL_MIN_Y || y >= VOXEL_MIN_Y + VOXEL_LAYERS)
      return 'That is outside the place.';
    const [sx, , sz] = this.options.spawn;
    if (Math.hypot(x + 0.5 - sx, z + 0.5 - sz) < PLAYER_BLOCKS.spawnRadius)
      return 'Nobody builds next to the start point.';
    if (mode === 'place') {
      const feet = this.options.player();
      const inside =
        x + 1 > feet.x - BODY.halfWidth &&
        x < feet.x + BODY.halfWidth &&
        z + 1 > feet.z - BODY.halfWidth &&
        z < feet.z + BODY.halfWidth &&
        y + 1 > feet.y + 0.05 &&
        y < feet.y + BODY.height;
      if (inside) return 'You are standing there.';
    }
    const block = mode === 'dig' ? Block.air : BLOCKS.indexOf(this.#block);
    return this.options.send([[x, y, z, block]]) ? null : 'Building needs the connection to the place.';
  }

  dispose(): void {
    this.#outline.removeFromParent();
    this.#outline.geometry.dispose();
    this.#outline.material.dispose();
    this.#held.removeFromParent();
    this.#held.geometry.dispose();
    this.#held.material.dispose();
    this.#faces.dispose();
  }
}
