import { z } from 'zod';

/**
 * The MCP server (decision 121, docs/superpowers/specs/2026-10-01-mcp-world-design.md): a creator's
 * own AI client designs that creator's own places through the assistant's generic tools. Scopes
 * name places and the catalog only; nothing reaches users, players, money, publishing, access or
 * moderation. `items:draft` is reserved for item drafts (P11-04) and not offered yet.
 */
export const McpScope = z.enum(['places:read', 'places:write', 'catalog:read']);
export type McpScope = z.infer<typeof McpScope>;

/** A place (experience) id as the API makes them: `exp-` and 16 hex digits. */
export const PlaceId = z.string().regex(/^exp-[0-9a-f]{16}$/, 'a place id such as exp-0123456789abcdef');
export type PlaceId = z.infer<typeof PlaceId>;

/** Days a development token lives: 30 unless the creator asks for fewer or more, 90 at most. */
export const MCP_TOKEN_DAYS = { default: 30, max: 90 } as const;

/** Creating a development token (`POST /v1/me/mcp-tokens`). */
export const McpTokenCreate = z.object({
  /** The creator's own label, e.g. "Claude Code home". */
  name: z.string().trim().min(1).max(60),
  /** The client name every audit row carries (the client's own report is never trusted). */
  client: z.string().trim().min(1).max(60),
  days: z.number().int().min(1).max(MCP_TOKEN_DAYS.max).default(MCP_TOKEN_DAYS.default),
  scopes: z.array(McpScope).min(1).default(['places:read', 'places:write', 'catalog:read']),
  /** Null: every place the account may build in; otherwise only these. */
  placeIds: z.array(PlaceId).max(50).nullable().default(null),
});
export type McpTokenCreate = z.infer<typeof McpTokenCreate>;

/** A development token as lists show it: never the token itself, only its first characters. */
export const McpTokenInfo = z.object({
  id: z.string(),
  name: z.string(),
  client: z.string(),
  prefix: z.string(),
  scopes: z.array(McpScope),
  placeIds: z.array(z.string()).nullable(),
  expiresAt: z.string(),
  revokedAt: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type McpTokenInfo = z.infer<typeof McpTokenInfo>;

/** The answer to creating a token: the only time the token is shown. */
export const McpTokenCreated = McpTokenInfo.extend({ token: z.string() });
export type McpTokenCreated = z.infer<typeof McpTokenCreated>;
