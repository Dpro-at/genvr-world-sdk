import { type BlockStyle } from '../core-library/index.js';
import { type BlockName, type VoxelData } from '../world/index.js';
import { BoxGeometry, CanvasTexture, Mesh, MeshStandardMaterial, type BufferGeometry, type Object3D, type Ray } from 'three/webgpu';
import type { HandGrip } from './avatar.js';
/** Place puts the block in hand on the face pointed at; Dig takes the block pointed at. */
export type HandsMode = 'place' | 'dig';
/** Blocks players build with in play, in picker order (decision 109). */
export declare const HAND_BLOCKS: readonly BlockName[];
/** How far players reach from their chest to the middle of a block, in play (the room allows 6 m). */
export declare const HAND_REACH = 5;
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
export declare function rayBlock(voxels: VoxelData, ray: Ray, max: number): RayBlock | null;
interface PlayerHandsOptions {
    scene: Object3D;
    voxels: VoxelData;
    /** The view ray through a screen position. */
    ray: (clientX: number, clientY: number) => Ray;
    /** Meters from the camera to the player, so aiming reaches past them. */
    cameraDistance: () => number;
    /** The player's feet. */
    player: () => {
        x: number;
        y: number;
        z: number;
    };
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
export declare class BlockFaces {
    #private;
    private readonly style;
    constructor(style: BlockStyle);
    get(block: BlockName): CanvasTexture | null;
    dispose(): void;
}
/** A block to hold: a small cube, shaded and casting a shadow. */
export declare function heldBlockMesh(): Mesh<BoxGeometry, MeshStandardMaterial>;
/**
 * A Core Library item to hold (a game's tool, P9-12): its parts as one mesh, shaded and casting a
 * shadow; null for items that are not in the Core Library.
 */
export declare function heldItemMesh(itemId: string): Mesh<BufferGeometry, MeshStandardMaterial> | null;
/**
 * Puts what a player holds in their right hand (blocks, decision 109; game tools, P9-12), the one
 * way for the local player and everyone else: the hand's bone carries it at the palm. A block sits
 * just past the fingers; an item's grip is in the fist with its +y (a tool's long head) pointing
 * forward (+z). Without a hand it is taken away.
 */
export declare function holdInRightHand(object: Object3D, hand: HandGrip | null, kind: 'block' | 'item'): void;
/**
 * The game tool in the local player's right hand (P9-12): made from its Core Library item when
 * it changes, kept in the hand bone as the skeleton changes, and thrown away when put down.
 */
export declare class HeldTool {
    #private;
    /** The item in hand; null for none (or an item that is not in the Core Library). */
    get itemId(): string | null;
    get mesh(): Object3D | null;
    set(itemId: string | null): void;
    /** Keeps the tool in the right hand (call every frame: the skeleton changes with the body type). */
    holdIn(hand: HandGrip | null): void;
    /** Hides the tool without dropping it (a knocked-out player, P9-12). */
    setVisible(on: boolean): void;
    dispose(): void;
}
/**
 * The Strike clip as an emote (P9-12), when the avatar has it: played once and not stopped by
 * moving (fights happen on the run). Null without the clip; it is only the look of a strike.
 */
export declare function strikeEmote(clips: readonly string[], duration: (clip: string) => number): {
    clip: string;
    left: number;
    moving: true;
} | null;
/**
 * Building with the avatar's hands in play (decision 109, P2-28 stage 2): point at a block (the
 * mouse on computers, a tap on phones), dig it or put the block in hand on the face pointed at,
 * within reach. An outline shows the block that will change; the block in hand sits in the
 * avatar's right hand. The room decides (rights, shares, protected blocks) and shares the result;
 * this class only checks what it can see, so players get quick answers.
 */
export declare class PlayerHands {
    #private;
    private readonly options;
    constructor(options: PlayerHandsOptions);
    get active(): boolean;
    get block(): BlockName;
    /** Turns building on or off (the room allows it, the place has blocks, and the player plays). */
    setActive(on: boolean): void;
    /** The block in hand. */
    setBlock(block: BlockName): void;
    /** Keeps the block in the right hand (the skeleton changes with the body type). */
    holdIn(hand: HandGrip | null): void;
    /** Shows the outline around the block the mouse points at (or hides it). */
    hover(clientX: number, clientY: number, mode: HandsMode): void;
    hide(): void;
    /** Digs or places at a screen position; returns why it could not, or null when it was sent. */
    use(clientX: number, clientY: number, mode: HandsMode): string | null;
    dispose(): void;
}
export {};
