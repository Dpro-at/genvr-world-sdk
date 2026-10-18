import { avatarMotionEntry } from './avatar-motion-library.js';
import type { AnimationClip } from 'three/webgpu';
import {
  CanvasTexture,
  Group,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  type BoxGeometry,
  type BufferGeometry,
  type Mesh,
  type MeshStandardMaterial,
} from 'three/webgpu';
import { AvatarAnimator } from './animator.js';
import { normalizeAvatarLook, type BlockStyle } from '@genvr/core-library';
import { BLOCKS } from '@genvr/world';
import { BlockFaces, heldBlockMesh, heldItemMesh, holdInRightHand } from './player-hands.js';
import {
  createGenvrAvatar,
  DEFAULT_LOOK,
  DOWN_SECONDS,
  clipTilt,
  type AvatarLook,
  type GenvrAvatar,
} from './avatar.js';

/** What the realtime room tells us about another player. */
export interface RemotePlayerState {
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  clip: string;
  /** The player's look as the room sends it (JSON AvatarLook, P3-23); missing on old servers. */
  look?: string;
  /** The block in the avatar's hand (a block id, decision 109); 0 or missing for none. */
  hand?: number;
  /** The game tool in the avatar's hand (a Core Library item id, P9-12); '' or missing for none. */
  tool?: string;
  /** Knocked out in a game (P9-12): the avatar falls and fades, and stands again when false. */
  down?: boolean;
  /**
   * The item the player rides (movement modes; '' or missing for none). Their pose is the item's;
   * they are drawn at their seat of it.
   */
  ride?: string;
  /** Their seat on it, from 1 (seat 1 steers). */
  seat?: number;
}

/** How the runtime puts riders on items (movement modes). */
export interface RiderHooks {
  /** Seat 1 of `item` is drawn at `pose` (interpolated) now: the item follows. */
  steer(item: string, pose: { x: number; y: number; z: number; yaw: number }, dt: number): void;
  /** Where a rider of `item` in `seat` is drawn (the body's root and facing), written into `out`; false when unknown. */
  seat(item: string, seat: number, out: { x: number; y: number; z: number; yaw: number }): boolean;
  /** Farther than this (m) from a rider's reported pose, they jump there instead of sliding (it grows with the item's top speed). */
  snapDistance(item: string): number;
}

interface Remote {
  /** Where the room's reports put the player, interpolated (the item's pose while riding). */
  follow: { x: number; y: number; z: number; yaw: number };
  avatar: GenvrAvatar;
  animator: AvatarAnimator;
  tag: Sprite;
  target: RemotePlayerState;
  /** The look the avatar was last built with. */
  look: string;
  /** Last clip the room reported; a one-shot plays once per report, not again every frame. */
  shown: string;
  /** Seconds of a strike still playing: the reported clip (Idle or Walk until the next patch) must not cut it short. */
  strikeLeft: number;
  /** Animation time saved up while a far avatar skips frames (LOD). */
  pending: number;
  frame: number;
  /** The block shown in the right hand, if any. */
  held: Mesh<BoxGeometry, MeshStandardMaterial> | null;
  heldBlock: number;
  /** The game tool shown in the right hand, if any (P9-12); it takes the place of a block. */
  tool: Mesh<BufferGeometry, MeshStandardMaterial> | null;
  /** The tool id the room last reported, known or not, so an unknown one is not looked up again. */
  toolId: string;
  /** Seconds of the red hit flash left (P9-12). */
  flash: number;
  /** Seconds since the player was knocked out (0 while up, P9-12). */
  downTime: number;
}

/**
 * Level of detail for other players (P3-12): farther than `slowAnimation` meters their animation
 * updates every few frames, farther than `hideTag` their name tag hides.
 */
/** Level of detail for other players: lighter bodies from `liteBody` m (the same body, fewer triangles). */
const LOD = { slowAnimation: 25, everyFrames: 3, hideTag: 40, liteBody: 10 } as const;

/** How long a hit player shows red, fading back to their own colors (P9-12). */
export const HIT_FLASH_SECONDS = 0.15;
/** Damage numbers start this far above the top of the hit player's head (P9-12). */
export const NUMBER_ABOVE_HEAD = 0.3;
/** Height of the name tag over other players, and the top of its label. */
const NAME_TAG = { y: 2.1, height: 0.32 } as const;
const NAME_TAG_TOP = NAME_TAG.y + NAME_TAG.height / 2;

/** How quickly remote players catch up with their latest reported position (per second). */
const FOLLOW = 12;
/** How long a strike is held when the body has no Strike clip to measure. */
const STRIKE_HOLD_SECONDS = 0.5;

/** Farther than this from the shown position: jump there instead of sliding (teleports). */
const SNAP_DISTANCE = 8;

/** Shirt colors so players look different when the room sends no look (older servers). */
const SHIRTS = ['#6d4aff', '#2ed3a0', '#ff6b6b', '#ffc93c', '#29c7ff', '#ff8fd8', '#8bc34a', '#ff9f43'];

/** The look to build a remote avatar with: the player's own, or a placeholder shirt color. */
export function lookFor(id: string, look?: string): AvatarLook {
  if (look) {
    try {
      return normalizeAvatarLook(JSON.parse(look));
    } catch {
      // Unreadable: fall back to the placeholder below.
    }
  }
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return { ...DEFAULT_LOOK, shirt: SHIRTS[Math.abs(hash) % SHIRTS.length]! };
}

/** Name above the head: a sprite with the text drawn on a rounded label. */
function nameTag(name: string): Sprite {
  const canvas = typeof document === 'undefined' ? undefined : document.createElement('canvas');
  let texture: CanvasTexture;
  let aspect = 4;
  if (canvas) {
    const scale = 2;
    const context = canvas.getContext('2d')!;
    context.font = `bold ${28 * scale}px Nunito, system-ui, sans-serif`;
    const width = Math.ceil(context.measureText(name).width) + 32 * scale;
    const height = 44 * scale;
    canvas.width = width;
    canvas.height = height;
    context.font = `bold ${28 * scale}px Nunito, system-ui, sans-serif`;
    context.fillStyle = 'rgba(28, 27, 46, 0.72)';
    context.beginPath();
    context.roundRect(0, 0, width, height, height / 2);
    context.fill();
    context.fillStyle = '#ffffff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(name, width / 2, height / 2 + scale);
    aspect = width / height;
    texture = new CanvasTexture(canvas);
  } else {
    texture = new CanvasTexture(undefined as never);
  }
  texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map: texture, depthWrite: false }));
  sprite.scale.set(NAME_TAG.height * aspect, NAME_TAG.height, 1);
  sprite.position.y = NAME_TAG.y;
  sprite.name = 'name-tag';
  return sprite;
}

/**
 * Other players in the same room: each gets the Genvr avatar with its own animator and a name
 * tag, and glides toward the latest position the server reported (updates arrive 20 times a
 * second, frames come 60 times). Smarter interpolation and far-away culling follow in P3-12.
 */
export class RemotePlayers {
  /** Names above other players (player setting, P3-21). */
  showNames = true;
  /** Another player started a strike (P9-12): the runtime plays its sound there. */
  onStrike: ((at: { x: number; y: number; z: number }) => void) | null = null;
  readonly group = new Group();
  readonly #players = new Map<string, Remote>();
  /** Puts riders on their items (movement modes); without it riders stand where the item is. */
  riders: RiderHooks | null = null;
  readonly #seatAt = { x: 0, y: 0, z: 0, yaw: 0 };

  /** Other players drawn as small cubes too (Voxel places, P2-26). */
  #cubes = false;
  /** Pictures of the blocks in other players' hands, in the place's block look. */
  #faces: BlockFaces | null = null;

  constructor(options: { cubes?: boolean } = {}) {
    this.group.name = 'remote-players';
    this.#cubes = options.cubes ?? false;
  }

  /** Draws every other player as small cubes (Voxel places) or with smooth blocks. */
  setCubes(cubes: boolean): void {
    this.#cubes = cubes;
    for (const remote of this.#players.values()) remote.avatar.setCubes(cubes);
  }

  /** The block look of the place, for blocks in other players' hands (decision 110). */
  setBlockStyle(style: BlockStyle): void {
    this.#faces?.dispose();
    this.#faces = new BlockFaces(style);
    for (const remote of this.#players.values()) {
      const block = remote.heldBlock;
      remote.heldBlock = 0;
      this.#hold(remote, block);
    }
  }

  /** Shows a block in the avatar's right hand, or none (0); a held tool keeps the hand. */
  #hold(remote: Remote, block: number): void {
    if (block === remote.heldBlock) return;
    remote.heldBlock = block;
    const name = BLOCKS[block];
    if (!block || !name || remote.tool) {
      remote.held?.removeFromParent();
      return;
    }
    remote.held ??= heldBlockMesh();
    remote.held.material.map = this.#faces?.get(name) ?? null;
    remote.held.material.needsUpdate = true;
    holdInRightHand(remote.held, remote.avatar.rightHand, 'block');
  }

  /** Shows a game tool in the avatar's right hand in place of any block, or none ('', P9-12). */
  #holdTool(remote: Remote, itemId: string): void {
    if (remote.toolId === itemId) return;
    remote.toolId = itemId;
    this.#dropTool(remote);
    remote.tool = itemId ? heldItemMesh(itemId) : null;
    if (remote.tool) {
      remote.held?.removeFromParent();
      holdInRightHand(remote.tool, remote.avatar.rightHand, 'item');
    } else {
      // The block comes back into the empty hand.
      const block = remote.heldBlock;
      remote.heldBlock = 0;
      this.#hold(remote, block);
    }
  }

  #dropTool(remote: Remote): void {
    if (!remote.tool) return;
    remote.tool.removeFromParent();
    remote.tool.geometry.dispose();
    remote.tool.material.dispose();
    remote.tool = null;
  }

  get count(): number {
    return this.#players.size;
  }

  ids(): string[] {
    return [...this.#players.keys()];
  }

  upsert(id: string, state: RemotePlayerState): void {
    const existing = this.#players.get(id);
    if (existing) {
      existing.target = { ...state };
      const look = state.look ?? '';
      if (look !== existing.look) {
        existing.look = look;
        if (existing.avatar.setLook(lookFor(id, look)))
          existing.animator.rebind(existing.avatar.mesh, existing.avatar.clips);
      }
      this.#holdTool(existing, state.tool ?? '');
      this.#hold(existing, state.hand ?? 0);
      return;
    }
    // A mesh body shows as Classic until its model arrives, then the animator binds to it.
    const avatar = createGenvrAvatar(lookFor(id, state.look), {
      cubes: this.#cubes,
      onBodyReady: () => animator.rebind(avatar.mesh, avatar.clips),
    });
    const animator = new AvatarAnimator(avatar.mesh, avatar.clips);
    animator.play(state.clip);
    const tag = nameTag(state.name);
    avatar.root.add(tag);
    avatar.root.position.set(state.x, state.y, state.z);
    avatar.root.rotation.y = state.yaw;
    this.group.add(avatar.root);
    this.#players.set(id, {
      follow: { x: state.x, y: state.y, z: state.z, yaw: state.yaw },
      avatar,
      animator,
      tag,
      target: { ...state },
      look: state.look ?? '',
      shown: state.clip,
      strikeLeft: 0,
      pending: 0,
      frame: 0,
      held: null,
      heldBlock: 0,
      tool: null,
      toolId: '',
      flash: 0,
      downTime: 0,
    });
    this.#holdTool(this.#players.get(id)!, state.tool ?? '');
    this.#hold(this.#players.get(id)!, state.hand ?? 0);
  }

  /**
   * Another player struck with their tool (P9-12, the room's `struck`): the Strike clip plays from its
   * start on them, even right after another, and the strike is heard there. False when not shown.
   */
  strike(id: string): boolean {
    const remote = this.#players.get(id);
    if (!remote) return false;
    remote.animator.replay('Strike');
    remote.shown = 'Strike';
    remote.strikeLeft = remote.animator.duration('Strike') || STRIKE_HOLD_SECONDS;
    this.onStrike?.(remote.avatar.root.position);
    return true;
  }

  registerPresentation(id: string, clip: AnimationClip): boolean {
    const player = this.#players.get(id); if (!player) return false; player.animator.register(clip); return true;
  }

  playPresentation(id: string, clip: string): boolean {
    const player = this.#players.get(id);
    if (!player || !player.animator.clipNames.includes(clip) && !avatarMotionEntry(clip)) return false;
    player.target.clip = clip; player.shown = clip; player.animator.play(clip); return true;
  }

  /** The clip currently shown on a player, or null when not shown (tests and tools). */
  shownClip(id: string): string | null {
    return this.#players.get(id)?.shown ?? null;
  }

  /**
   * The player the local player's strike would reach (P9-12): the nearest one standing inside the
   * arc and reach, from their latest reported positions; null for none. The server judges again.
   */
  inReach(from: { x: number; z: number; yaw: number }, reach: number, arcDeg: number): string | null {
    const fx = Math.sin(from.yaw);
    const fz = Math.cos(from.yaw);
    let best: string | null = null;
    let bestDistance = Infinity;
    for (const [id, remote] of this.#players) {
      const { x, z, down } = remote.target;
      if (down) continue;
      const dx = x - from.x;
      const dz = z - from.z;
      const distance = Math.hypot(dx, dz);
      if (distance > reach || distance >= bestDistance) continue;
      const cos = distance < 1e-6 ? 1 : (dx * fx + dz * fz) / distance;
      if (Math.acos(Math.min(1, Math.max(-1, cos))) > (arcDeg * Math.PI) / 360) continue;
      best = id;
      bestDistance = distance;
    }
    return best;
  }

  /** The avatar of a player shown here (their mouth speaks, lip sync P2-44); null for players not shown. */
  avatarOf(id: string): GenvrAvatar | null {
    return this.#players.get(id)?.avatar ?? null;
  }

  /** Flashes a player red for a moment (they were hit, P9-12); false for players not shown. */
  flash(id: string): boolean {
    const remote = this.#players.get(id);
    if (!remote) return false;
    remote.flash = HIT_FLASH_SECONDS;
    remote.avatar.setFlash(1);
    return true;
  }

  /**
   * Where a damage number starts over a player (P9-12): a little above their head, and above their
   * name tag when names show. Null for players not shown.
   */
  numberAnchor(id: string): { x: number; y: number; z: number } | null {
    const remote = this.#players.get(id);
    if (!remote) return null;
    const { position } = remote.avatar.root;
    const above = remote.avatar.headTop + NUMBER_ABOVE_HEAD;
    const y = position.y + (this.showNames ? Math.max(above, NAME_TAG_TOP) : above);
    return { x: position.x, y, z: position.z };
  }

  remove(id: string): void {
    const remote = this.#players.get(id);
    if (!remote) return;
    this.group.remove(remote.avatar.root);
    remote.animator.dispose();
    remote.avatar.dispose();
    remote.tag.material.map?.dispose();
    remote.tag.material.dispose();
    remote.held?.removeFromParent();
    remote.held?.geometry.dispose();
    remote.held?.material.dispose();
    this.#dropTool(remote);
    this.#players.delete(id);
  }

  /** Call every frame with the local player's position (for level of detail). */
  update(dt: number, viewer?: { x: number; z: number }): void {
    const k = 1 - Math.exp(-FOLLOW * dt);
    const riders = this.riders;
    // First everyone's reported pose, eased; seat 1 of an item moves the item there.
    for (const remote of this.#players.values()) {
      const t = remote.target;
      const f = remote.follow;
      const snap = t.ride && riders ? Math.max(SNAP_DISTANCE, riders.snapDistance(t.ride)) : SNAP_DISTANCE;
      if (Math.hypot(t.x - f.x, t.z - f.z) > snap) {
        f.x = t.x;
        f.y = t.y;
        f.z = t.z;
        f.yaw = t.yaw;
      } else {
        f.x += (t.x - f.x) * k;
        f.y += (t.y - f.y) * k;
        f.z += (t.z - f.z) * k;
        // Turn the short way round.
        const turn = Math.atan2(Math.sin(t.yaw - f.yaw), Math.cos(t.yaw - f.yaw));
        f.yaw = Math.atan2(Math.sin(f.yaw + turn * k), Math.cos(f.yaw + turn * k));
      }
      if (t.ride && t.seat === 1) riders?.steer(t.ride, f, dt);
    }
    for (const remote of this.#players.values()) {
      const { root } = remote.avatar;
      const t = remote.target;
      const f = remote.follow;
      // Riders sit at their seat of the item where it is drawn now (spec 7).
      if (t.ride && riders?.seat(t.ride, t.seat ?? 1, this.#seatAt)) {
        root.position.set(this.#seatAt.x, this.#seatAt.y, this.#seatAt.z);
        root.rotation.y = this.#seatAt.yaw;
      } else {
        root.position.set(f.x, f.y, f.z);
        root.rotation.y = f.yaw;
      }
      // Strikes come from the room's `struck` (one per strike), never from the reported clip.
      remote.strikeLeft = Math.max(0, remote.strikeLeft - dt);
      if (remote.strikeLeft === 0 && t.clip !== remote.shown && t.clip !== 'Strike') {
        remote.animator.play(t.clip);
        remote.shown = t.clip;
      }
      if (remote.flash > 0) {
        remote.flash = Math.max(0, remote.flash - dt);
        remote.avatar.setFlash(remote.flash / HIT_FLASH_SECONDS);
      }
      const distance = viewer ? Math.hypot(root.position.x - viewer.x, root.position.z - viewer.z) : 0;
      remote.tag.visible = this.showNames && distance < LOD.hideTag;
      remote.avatar.setDetail(distance > LOD.liteBody ? 'lite' : 'full');
      remote.pending += dt;
      remote.frame += 1;
      if (distance < LOD.slowAnimation || remote.frame % LOD.everyFrames === 0) {
        remote.animator.update(remote.pending);
        remote.avatar.updateSprings(remote.pending);
        remote.pending = 0;
      }
      // A new body type brings a new skeleton: keep the block in the new right hand.
      if (remote.tool) holdInRightHand(remote.tool, remote.avatar.rightHand, 'item');
      else if (remote.held && remote.heldBlock)
        holdInRightHand(remote.held, remote.avatar.rightHand, 'block');
      // Knocked out: fall and fade; back up at once when the game brings them back.
      if (t.down) {
        remote.downTime = Math.min(DOWN_SECONDS, remote.downTime + dt);
        remote.avatar.setDown(remote.downTime / DOWN_SECONDS);
      } else if (remote.downTime > 0) {
        remote.downTime = 0;
        remote.avatar.setDown(0);
      }
      // A rider's tool and block are hidden (spec 7).
      if (remote.tool) remote.tool.visible = !t.down && !t.ride;
      if (remote.held) remote.held.visible = !t.ride;
      const tilt = clipTilt(t.clip);
      if (remote.avatar.down === 0)
        remote.avatar.pose.rotation.x += (tilt - remote.avatar.pose.rotation.x) * k;
    }
  }

  dispose(): void {
    for (const id of [...this.#players.keys()]) this.remove(id);
    this.#faces?.dispose();
  }
}
