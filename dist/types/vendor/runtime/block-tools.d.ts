import type { CommandPayload } from '../contracts/index.js';
import { type BlockName, type VoxelData } from '../world/index.js';
import { type Intersection, type Object3D, type Ray } from 'three/webgpu';
/** Stack puts a block on the face you point at; Dig takes away the block you point at. */
export type BlockMode = 'stack' | 'dig';
/** Blocks the Blocks tool offers, in picker order (water and air are not stacked by hand). */
export declare const STACKABLE_BLOCKS: readonly BlockName[];
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
    player: () => {
        x: number;
        y: number;
        z: number;
    };
}
/** Longest side of a dragged line or rectangle, so one drag stays within 4096 blocks. */
export declare const MAX_DRAG_SPAN = 64;
type Cell = [number, number, number];
/**
 * Digging and stacking on block ground (P2-26), like block-building games: point at a block and
 * tap. An outline shows the blocks that will change (green to stack, red to dig). Dragging from a
 * block lays a line or a flat rectangle in the layer of the face it started on (a floor from a
 * top face, a wall from a side face) as one command. Every change is a `set_blocks` command, so
 * undo, saving, and building together work as for every other tool.
 */
export declare class BlockTools {
    #private;
    private readonly options;
    constructor(options: BlockToolsOptions);
    get settings(): BlockToolSettings;
    set(settings: Partial<BlockToolSettings>): void;
    /** The block a screen position points at: the one hit (dig), or the free one in front (stack). */
    target(clientX: number, clientY: number): Cell | null;
    hover(clientX: number, clientY: number): void;
    hide(): void;
    /** Digs or stacks at a screen position; returns why it could not, or null. */
    tap(clientX: number, clientY: number): string | null;
    /** Starts a drag on a block; false when the press is not on one (the camera gets it). */
    startDrag(pointerId: number, clientX: number, clientY: number): boolean;
    /** Follows the pointer across the drag's layer; true when this pointer is the drag's. */
    moveDrag(pointerId: number, clientX: number, clientY: number): boolean;
    /**
     * Ends a drag: digs or stacks every block of its line or rectangle as one command (one undo
     * step), skipping blocks that cannot change. A press that hardly moved is a tap (see `tap`).
     * Returns why nothing changed, or null.
     */
    endDrag(pointerId: number, clientX?: number, clientY?: number): string | null;
    dispose(): void;
}
/** Every block of the box from `a` to `b` (both included). */
export declare function cellsBetween(a: Cell, b: Cell): Cell[];
export {};
