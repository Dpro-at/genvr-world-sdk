import { z } from 'zod';
/**
 * The MCP server (decision 121, docs/superpowers/specs/2026-10-01-mcp-world-design.md): a creator's
 * own AI client designs that creator's own places through the assistant's generic tools. Scopes
 * name places and the catalog only; nothing reaches users, players, money, publishing, access or
 * moderation. `items:draft` is reserved for item drafts (P11-04) and not offered yet.
 */
export declare const McpScope: z.ZodEnum<{
    "places:read": "places:read";
    "places:write": "places:write";
    "catalog:read": "catalog:read";
}>;
export type McpScope = z.infer<typeof McpScope>;
/** A place (experience) id as the API makes them: `exp-` and 16 hex digits. */
export declare const PlaceId: z.ZodString;
export type PlaceId = z.infer<typeof PlaceId>;
/** Days a development token lives: 30 unless the creator asks for fewer or more, 90 at most. */
export declare const MCP_TOKEN_DAYS: {
    readonly default: 30;
    readonly max: 90;
};
/** Creating a development token (`POST /v1/me/mcp-tokens`). */
export declare const McpTokenCreate: z.ZodObject<{
    name: z.ZodString;
    client: z.ZodString;
    days: z.ZodDefault<z.ZodNumber>;
    scopes: z.ZodDefault<z.ZodArray<z.ZodEnum<{
        "places:read": "places:read";
        "places:write": "places:write";
        "catalog:read": "catalog:read";
    }>>>;
    placeIds: z.ZodDefault<z.ZodNullable<z.ZodArray<z.ZodString>>>;
}, z.core.$strip>;
export type McpTokenCreate = z.infer<typeof McpTokenCreate>;
/** A development token as lists show it: never the token itself, only its first characters. */
export declare const McpTokenInfo: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    client: z.ZodString;
    prefix: z.ZodString;
    scopes: z.ZodArray<z.ZodEnum<{
        "places:read": "places:read";
        "places:write": "places:write";
        "catalog:read": "catalog:read";
    }>>;
    placeIds: z.ZodNullable<z.ZodArray<z.ZodString>>;
    expiresAt: z.ZodString;
    revokedAt: z.ZodNullable<z.ZodString>;
    lastUsedAt: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
}, z.core.$strip>;
export type McpTokenInfo = z.infer<typeof McpTokenInfo>;
/** The answer to creating a token: the only time the token is shown. */
export declare const McpTokenCreated: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    client: z.ZodString;
    prefix: z.ZodString;
    scopes: z.ZodArray<z.ZodEnum<{
        "places:read": "places:read";
        "places:write": "places:write";
        "catalog:read": "catalog:read";
    }>>;
    placeIds: z.ZodNullable<z.ZodArray<z.ZodString>>;
    expiresAt: z.ZodString;
    revokedAt: z.ZodNullable<z.ZodString>;
    lastUsedAt: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
    token: z.ZodString;
}, z.core.$strip>;
export type McpTokenCreated = z.infer<typeof McpTokenCreated>;
