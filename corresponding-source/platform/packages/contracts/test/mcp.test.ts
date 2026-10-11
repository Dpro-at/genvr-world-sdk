import { describe, expect, it } from 'vitest';
import {
  MCP_TOKEN_DAYS,
  McpScope,
  McpTokenCreate,
  McpTokenCreated,
  McpTokenInfo,
  PlaceId,
} from '../src/index.js';

describe('MCP contracts', () => {
  it('names places and the catalog only in its scopes', () => {
    expect(McpScope.options).toEqual(['places:read', 'places:write', 'catalog:read']);
    for (const scope of McpScope.options) expect(scope).toMatch(/^(places|catalog):/);
  });

  it('takes a place id of the experience shape only', () => {
    expect(PlaceId.safeParse('exp-0efb7c747c9a3e22').success).toBe(true);
    for (const bad of ['exp-demo', 'exp-0EFB7C747C9A3E22', 'exp-0efb7c747c9a3e2', 'mct-0efb7c747c9a3e22', ''])
      expect(PlaceId.safeParse(bad).success).toBe(false);
  });

  it('gives a new token 30 days, every scope and every place by default', () => {
    expect(McpTokenCreate.parse({ name: ' Claude Code home ', client: 'Claude Code' })).toEqual({
      name: 'Claude Code home',
      client: 'Claude Code',
      days: 30,
      scopes: ['places:read', 'places:write', 'catalog:read'],
      placeIds: null,
    });
    expect(MCP_TOKEN_DAYS).toEqual({ default: 30, max: 90 });
  });

  it('keeps names, days, scopes and places within their limits', () => {
    const base = { name: 'home', client: 'Claude Code' };
    const refused = [
      { ...base, name: '' },
      { ...base, name: 'x'.repeat(61) },
      { ...base, client: '  ' },
      { ...base, client: 'x'.repeat(61) },
      { ...base, days: 0 },
      { ...base, days: 91 },
      { ...base, days: 1.5 },
      { ...base, scopes: [] },
      { ...base, scopes: ['items:draft'] },
      { ...base, scopes: ['admin'] },
      { ...base, placeIds: ['exp-demo'] },
      { ...base, placeIds: Array.from({ length: 51 }, (_, i) => `exp-${i.toString(16).padStart(16, '0')}`) },
    ];
    for (const body of refused)
      expect(McpTokenCreate.safeParse(body).success, JSON.stringify(body)).toBe(false);
    expect(
      McpTokenCreate.parse({
        ...base,
        days: 90,
        scopes: ['places:read'],
        placeIds: ['exp-0efb7c747c9a3e22'],
      }),
    ).toMatchObject({ days: 90, scopes: ['places:read'], placeIds: ['exp-0efb7c747c9a3e22'] });
  });

  it('describes a token without its secret; the secret is only in the creation answer', () => {
    const info = {
      id: 'mct-0123456789abcdef',
      name: 'home',
      client: 'Claude Code',
      prefix: 'gvr_dev_AbCd',
      scopes: ['places:read'],
      placeIds: null,
      expiresAt: '2026-10-31T00:00:00.000Z',
      revokedAt: null,
      lastUsedAt: null,
      createdAt: '2026-10-01T00:00:00.000Z',
    };
    expect(McpTokenInfo.parse(info)).toEqual(info);
    expect(Object.keys(McpTokenInfo.shape)).not.toContain('token');
    expect(Object.keys(McpTokenInfo.shape)).not.toContain('tokenHash');
    expect(McpTokenCreated.parse({ ...info, token: 'gvr_dev_secret' }).token).toBe('gvr_dev_secret');
  });
});
