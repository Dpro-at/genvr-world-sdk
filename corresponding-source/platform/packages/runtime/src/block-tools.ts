import type { CommandPayload } from '@genvr/contracts';
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
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  Plane,
  Vector3,
  type Intersection,
  type Object3D,
  type Ray,
} from 'three/webgpu';

/** Stack puts a block on the face you point at; Dig takes away the block you point at. */
export type BlockMode = 'stack' | 'dig';

/** Blocks the Blocks tool offers, in picker order (water and air are not stacked by hand). */
export const STACKABLE_BLOCKS: readonly BlockName[] = [
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

export interface BlockToolSettings {
  mode: BlockMode;
  block: BlockName;
}

interface BlockToolsOptions {
  scene: Object3D;
  voxels: VoxelData;
  /** Hits of a screen position on the block ground, nearest first. */
  cast: (clientX: number, clientY: number) => Intersection[];
  /** The view ray through a screen position (a drag follows it across its layer). */
  ray: (clientX: number, clientY: number) => Ray;
  apply: (command: CommandPayload) => boolean;
  /** The player's feet, so nobody gets stuck inside a stacked block. */
  player: () => { x: number; y: number; z: number };
}

/** The player's capsule, as boxes of blocks it touches (half width and height, from P2-05). */
const PLAYER = { halfWidth: 0.35, height: 1.8 };

/** Longest side of a dragged line or rectangle, so one drag stays within 4096 blocks. */
export const MAX_DRAG_SPAN = 64;

/** Screen pixels a press must move before it counts as a drag (shorter moves are taps). */
const DRAG_PIXELS = 8;

type Cell = [number, number, number];

/** A drag in progress: from the first block, in the layer of the face it started on. */
interface Drag {
  pointerId: number;
  x: number;
  y: number;
  start: Cell;
  end: Cell;
  /** The axis the first face looks along (0 x, 1 y, 2 z); the drag keeps this coordinate. */
  axis: 0 | 1 | 2;
}

/**
 * Digging and stacking on block ground (P2-26), like block-building games: point at a block and
 * tap. An outline shows the blocks that will change (green to stack, red to dig). Dragging from a
 * block lays a line or a flat rectangle in the layer of the face it started on (a floor from a
 * top face, a wall from a side face) as one command. Every change is a `set_blocks` command, so
 * undo, saving, and building together work as for every other tool.
 */
export class BlockTools {
  #settings: BlockToolSettings = { mode: 'stack', block: 'grass' };
  #drag: Drag | null = null;
  readonly #outline: LineSegments<EdgesGeometry, LineBasicMaterial>;

  constructor(private readonly options: BlockToolsOptions) {
    this.#outline = new LineSegments(
      new EdgesGeometry(new BoxGeometry(1.02, 1.02, 1.02)),
      new LineBasicMaterial({ color: 0x22c55e, depthTest: false, transparent: true }),
    );
    this.#outline.name = 'block-target';
    this.#outline.userData.helper = true;
    this.#outline.renderOrder = 10;
    this.#outline.visible = false;
    options.scene.add(this.#outline);
  }

  get settings(): BlockToolSettings {
    return { ...this.#settings };
  }

  set(settings: Partial<BlockToolSettings>): void {
    this.#settings = { ...this.#settings, ...settings };
    this.#outline.material.color.set(this.#settings.mode === 'dig' ? 0xef4444 : 0x22c55e);
  }

  /** The block a screen position points at: the one hit (dig), or the free one in front (stack). */
  target(clientX: number, clientY: number): Cell | null {
    return this.#pick(clientX, clientY)?.cell ?? null;
  }

  #pick(clientX: number, clientY: number): { cell: Cell; axis: 0 | 1 | 2 } | null {
    const hit = this.options.cast(clientX, clientY).find((h) => h.object.name.startsWith('voxels:'));
    if (!hit?.face) return null;
    const side = this.#settings.mode === 'dig' ? -0.5 : 0.5;
    const n = hit.face.normal;
    const [ax, ay, az] = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)];
    return {
      cell: [
        Math.floor(hit.point.x + n.x * side),
        Math.floor(hit.point.y + n.y * side),
        Math.floor(hit.point.z + n.z * side),
      ],
      axis: ay >= ax && ay >= az ? 1 : ax >= az ? 0 : 2,
    };
  }

  hover(clientX: number, clientY: number): void {
    if (this.#drag) return;
    const cell = this.target(clientX, clientY);
    this.#showBox(cell, cell);
  }

  hide(): void {
    this.#outline.visible = false;
  }

  /** The outline around the blocks from `a` to `b` (both included), or hidden. */
  #showBox(a: Cell | null, b: Cell | null): void {
    this.#outline.visible = a !== null && b !== null;
    if (!a || !b) return;
    const size = [0, 1, 2].map((i) => Math.abs(a[i]! - b[i]!) + 1);
    const center = [0, 1, 2].map((i) => Math.min(a[i]!, b[i]!) + size[i]! / 2);
    this.#outline.position.set(center[0]!, center[1]!, center[2]!);
    this.#outline.scale.set(size[0]!, size[1]!, size[2]!);
  }

  /** Digs or stacks at a screen position; returns why it could not, or null. */
  tap(clientX: number, clientY: number): string | null {
    const cell = this.target(clientX, clientY);
    if (!cell) return 'Point at a block.';
    const change = this.#change(cell);
    if (typeof change === 'string') return change;
    return this.options.apply({ type: 'set_blocks', params: { blocks: [change] } })
      ? null
      : 'That block cannot change.';
  }

  /** The change of one block with the current settings, or why it cannot change. */
  #change([x, y, z]: Cell): [number, number, number, number] | string {
    const voxels = this.options.voxels;
    if (!voxels.inside(x, z)) return 'That is outside the place.';
    if (y <= VOXEL_MIN_Y || y >= VOXEL_MIN_Y + VOXEL_LAYERS) return 'Blocks cannot go that high or low.';
    const current = voxels.block(x, y, z);
    if (this.#settings.mode === 'dig') {
      if (!isSolidBlock(current)) return 'There is no block to dig there.';
      return [x, y, z, Block.air];
    }
    if (isSolidBlock(current)) return 'That place is taken.';
    const feet = this.options.player();
    const touches =
      x + 1 > feet.x - PLAYER.halfWidth &&
      x < feet.x + PLAYER.halfWidth &&
      z + 1 > feet.z - PLAYER.halfWidth &&
      z < feet.z + PLAYER.halfWidth &&
      y + 1 > feet.y + 0.05 &&
      y < feet.y + PLAYER.height;
    if (touches) return 'You are standing there.';
    return [x, y, z, BLOCKS.indexOf(this.#settings.block)];
  }

  /** Starts a drag on a block; false when the press is not on one (the camera gets it). */
  startDrag(pointerId: number, clientX: number, clientY: number): boolean {
    const pick = this.#pick(clientX, clientY);
    if (!pick) return false;
    this.#drag = { pointerId, x: clientX, y: clientY, start: pick.cell, end: pick.cell, axis: pick.axis };
    this.#showBox(pick.cell, pick.cell);
    return true;
  }

  /** Follows the pointer across the drag's layer; true when this pointer is the drag's. */
  moveDrag(pointerId: number, clientX: number, clientY: number): boolean {
    const drag = this.#drag;
    if (!drag || drag.pointerId !== pointerId) return false;
    const { start, axis } = drag;
    const plane = new Plane(new Vector3().setComponent(axis, 1), -(start[axis] + 0.5));
    const point = this.options.ray(clientX, clientY).intersectPlane(plane, new Vector3());
    if (point) {
      const reach = MAX_DRAG_SPAN - 1;
      drag.end = [0, 1, 2].map((i) =>
        i === axis
          ? start[i]!
          : Math.min(start[i]! + reach, Math.max(start[i]! - reach, Math.floor(point.getComponent(i)))),
      ) as Cell;
    }
    this.#showBox(start, drag.end);
    return true;
  }

  /**
   * Ends a drag: digs or stacks every block of its line or rectangle as one command (one undo
   * step), skipping blocks that cannot change. A press that hardly moved is a tap (see `tap`).
   * Returns why nothing changed, or null.
   */
  endDrag(pointerId: number, clientX?: number, clientY?: number): string | null {
    const drag = this.#drag;
    if (!drag || drag.pointerId !== pointerId) return null;
    this.#drag = null;
    this.#showBox(drag.start, drag.start);
    if (clientX === undefined || clientY === undefined) return null;
    if (Math.hypot(clientX - drag.x, clientY - drag.y) < DRAG_PIXELS) return null;
    const blocks = cellsBetween(drag.start, drag.end)
      .map((cell) => this.#change(cell))
      .filter((change) => typeof change !== 'string');
    if (blocks.length === 0)
      return this.#settings.mode === 'dig' ? 'There are no blocks to dig there.' : 'That place is taken.';
    return this.options.apply({ type: 'set_blocks', params: { blocks } })
      ? null
      : 'Those blocks cannot change.';
  }

  dispose(): void {
    this.options.scene.remove(this.#outline);
    this.#outline.geometry.dispose();
    this.#outline.material.dispose();
  }
}

/** Every block of the box from `a` to `b` (both included). */
export function cellsBetween(a: Cell, b: Cell): Cell[] {
  const cells: Cell[] = [];
  for (let y = Math.min(a[1], b[1]); y <= Math.max(a[1], b[1]); y += 1)
    for (let z = Math.min(a[2], b[2]); z <= Math.max(a[2], b[2]); z += 1)
      for (let x = Math.min(a[0], b[0]); x <= Math.max(a[0], b[0]); x += 1) cells.push([x, y, z]);
  return cells;
}
