import { z } from 'zod';

/**
 * Building with the avatar's hands in places made of blocks (decision 109, task P2-28): who may
 * place and dig blocks while playing, what happens to their blocks, and each player's share.
 * Owners and builders may always build.
 */
export const PlayerBuildWho = z.enum(['nobody', 'invited', 'everyone']);
export type PlayerBuildWho = z.infer<typeof PlayerBuildWho>;

/** `reset`: player blocks go when the room closes; `saved`: they stay in the place. */
export const PlayerBuildSaving = z.enum(['reset', 'saved']);
export type PlayerBuildSaving = z.infer<typeof PlayerBuildSaving>;

/** Fixed platform limits that protect the servers (decision 109). */
export const PLAYER_BLOCKS = {
  /** Blocks one player may have in the place, by default and at most. */
  defaultShare: 2000,
  minShare: 100,
  maxShare: 10_000,
  /** Blocks per second per player (the room refuses more). */
  perSecond: 5,
  /** Player blocks one place may hold. */
  perPlace: 200_000,
  /** Meters from the player to a block they place or dig (a little more than the 5 m in play). */
  reach: 6,
  /** No player building within this many meters of the spawn point (sideways). */
  spawnRadius: 4,
  /** Blocks in one request. */
  perRequest: 5,
  /** Seconds a room with player blocks that reset stays open after the last player leaves. */
  emptyWaitSeconds: 300,
} as const;

export const PlayerBuilding = z.object({
  who: PlayerBuildWho.default('everyone'),
  saving: PlayerBuildSaving.default('reset'),
  share: z
    .number()
    .int()
    .min(PLAYER_BLOCKS.minShare)
    .max(PLAYER_BLOCKS.maxShare)
    .default(PLAYER_BLOCKS.defaultShare),
});
export type PlayerBuilding = z.infer<typeof PlayerBuilding>;

/** Stored settings, or the defaults when missing or no longer valid. */
export function readPlayerBuilding(value: unknown): PlayerBuilding {
  const parsed = PlayerBuilding.safeParse(value ?? {});
  return parsed.success ? parsed.data : PlayerBuilding.parse({});
}

/**
 * A player places or digs blocks in play: `[x, y, z, block]` at whole meters, block 0 (air)
 * digs. The room answers with `player-blocks` to everyone, or `player-blocks-rejected`.
 */
export const PlayerBlocksRequest = z.object({
  id: z.string().min(1).max(64),
  blocks: z
    .array(z.tuple([z.number().int(), z.number().int(), z.number().int(), z.number().int().min(0).max(255)]))
    .min(1)
    .max(PLAYER_BLOCKS.perRequest),
});
export type PlayerBlocksRequest = z.infer<typeof PlayerBlocksRequest>;
