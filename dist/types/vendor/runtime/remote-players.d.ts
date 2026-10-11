import { Group } from 'three/webgpu';
import { type BlockStyle } from '../core-library/index.js';
import { type AvatarLook, type GenvrAvatar } from './avatar.js';
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
    steer(item: string, pose: {
        x: number;
        y: number;
        z: number;
        yaw: number;
    }, dt: number): void;
    /** Where a rider of `item` in `seat` is drawn (the body's root and facing), written into `out`; false when unknown. */
    seat(item: string, seat: number, out: {
        x: number;
        y: number;
        z: number;
        yaw: number;
    }): boolean;
    /** Farther than this (m) from a rider's reported pose, they jump there instead of sliding (it grows with the item's top speed). */
    snapDistance(item: string): number;
}
/** How long a hit player shows red, fading back to their own colors (P9-12). */
export declare const HIT_FLASH_SECONDS = 0.15;
/** Damage numbers start this far above the top of the hit player's head (P9-12). */
export declare const NUMBER_ABOVE_HEAD = 0.3;
/** The look to build a remote avatar with: the player's own, or a placeholder shirt color. */
export declare function lookFor(id: string, look?: string): AvatarLook;
/**
 * Other players in the same room: each gets the Genvr avatar with its own animator and a name
 * tag, and glides toward the latest position the server reported (updates arrive 20 times a
 * second, frames come 60 times). Smarter interpolation and far-away culling follow in P3-12.
 */
export declare class RemotePlayers {
    #private;
    /** Names above other players (player setting, P3-21). */
    showNames: boolean;
    /** Another player started a strike (P9-12): the runtime plays its sound there. */
    onStrike: ((at: {
        x: number;
        y: number;
        z: number;
    }) => void) | null;
    readonly group: Group<import("three/webgpu").Object3DEventMap>;
    /** Puts riders on their items (movement modes); without it riders stand where the item is. */
    riders: RiderHooks | null;
    constructor(options?: {
        cubes?: boolean;
    });
    /** Draws every other player as small cubes (Voxel places) or with smooth blocks. */
    setCubes(cubes: boolean): void;
    /** The block look of the place, for blocks in other players' hands (decision 110). */
    setBlockStyle(style: BlockStyle): void;
    get count(): number;
    ids(): string[];
    upsert(id: string, state: RemotePlayerState): void;
    /**
     * Another player struck with their tool (P9-12, the room's `struck`): the Strike clip plays from its
     * start on them, even right after another, and the strike is heard there. False when not shown.
     */
    strike(id: string): boolean;
    /** The clip currently shown on a player, or null when not shown (tests and tools). */
    shownClip(id: string): string | null;
    /**
     * The player the local player's strike would reach (P9-12): the nearest one standing inside the
     * arc and reach, from their latest reported positions; null for none. The server judges again.
     */
    inReach(from: {
        x: number;
        z: number;
        yaw: number;
    }, reach: number, arcDeg: number): string | null;
    /** The avatar of a player shown here (their mouth speaks, lip sync P2-44); null for players not shown. */
    avatarOf(id: string): GenvrAvatar | null;
    /** Flashes a player red for a moment (they were hit, P9-12); false for players not shown. */
    flash(id: string): boolean;
    /**
     * Where a damage number starts over a player (P9-12): a little above their head, and above their
     * name tag when names show. Null for players not shown.
     */
    numberAnchor(id: string): {
        x: number;
        y: number;
        z: number;
    } | null;
    remove(id: string): void;
    /** Call every frame with the local player's position (for level of detail). */
    update(dt: number, viewer?: {
        x: number;
        z: number;
    }): void;
    dispose(): void;
}
