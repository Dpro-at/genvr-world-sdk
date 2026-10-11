import { z } from 'zod';
/**
 * Building with the avatar's hands in places made of blocks (decision 109, task P2-28): who may
 * place and dig blocks while playing, what happens to their blocks, and each player's share.
 * Owners and builders may always build.
 */
export declare const PlayerBuildWho: z.ZodEnum<{
    everyone: "everyone";
    nobody: "nobody";
    invited: "invited";
}>;
export type PlayerBuildWho = z.infer<typeof PlayerBuildWho>;
/** `reset`: player blocks go when the room closes; `saved`: they stay in the place. */
export declare const PlayerBuildSaving: z.ZodEnum<{
    reset: "reset";
    saved: "saved";
}>;
export type PlayerBuildSaving = z.infer<typeof PlayerBuildSaving>;
/** Fixed platform limits that protect the servers (decision 109). */
export declare const PLAYER_BLOCKS: {
    /** Blocks one player may have in the place, by default and at most. */
    readonly defaultShare: 2000;
    readonly minShare: 100;
    readonly maxShare: 10000;
    /** Blocks per second per player (the room refuses more). */
    readonly perSecond: 5;
    /** Player blocks one place may hold. */
    readonly perPlace: 200000;
    /** Meters from the player to a block they place or dig (a little more than the 5 m in play). */
    readonly reach: 6;
    /** No player building within this many meters of the spawn point (sideways). */
    readonly spawnRadius: 4;
    /** Blocks in one request. */
    readonly perRequest: 5;
    /** Seconds a room with player blocks that reset stays open after the last player leaves. */
    readonly emptyWaitSeconds: 300;
};
export declare const PlayerBuilding: z.ZodObject<{
    who: z.ZodDefault<z.ZodEnum<{
        everyone: "everyone";
        nobody: "nobody";
        invited: "invited";
    }>>;
    saving: z.ZodDefault<z.ZodEnum<{
        reset: "reset";
        saved: "saved";
    }>>;
    share: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type PlayerBuilding = z.infer<typeof PlayerBuilding>;
/** Stored settings, or the defaults when missing or no longer valid. */
export declare function readPlayerBuilding(value: unknown): PlayerBuilding;
/**
 * A player places or digs blocks in play: `[x, y, z, block]` at whole meters, block 0 (air)
 * digs. The room answers with `player-blocks` to everyone, or `player-blocks-rejected`.
 */
export declare const PlayerBlocksRequest: z.ZodObject<{
    id: z.ZodString;
    blocks: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
}, z.core.$strip>;
export type PlayerBlocksRequest = z.infer<typeof PlayerBlocksRequest>;
