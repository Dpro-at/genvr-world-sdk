import { describe, expect, it } from 'vitest';
import { ACCOUNT_LINK_SCOPES, GenvrClient, worldShareUrl } from '../src/index.js';
describe('explicit world publication adapters', () => {
  it('uses separate bearer-authenticated operations without changing local storage or submitting items', async () => {
    const calls: Array<{ url: string; method: string; body: unknown; credentials: string | undefined }> = [];
    const client = GenvrClient.linked('http://localhost:4000', 'gvr_link_' + 'a'.repeat(43), async (input, init) => {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer gvr_link_' + 'a'.repeat(43));
      const url = String(input); calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined, credentials: init?.credentials });
      const result = url.endsWith('/invites') ? { id: 'inv-1', token: 'invite-token', role: 'player', expiresAt: '2026-10-19T00:00:00Z' }
        : url.endsWith('/join-ticket') ? { ticket: 'ticket', url: 'ws://localhost:4100', expiresIn: 60 }
        : url.endsWith('/join') ? { allowed: false, reason: 'private' } : { id: 'exp-1', isOwner: true };
      return new Response(JSON.stringify(result));
    });
    await client.experience('exp-1'); await client.setAccess('exp-1', { mode: 'private' });
    await client.createInvite('exp-1'); await client.revokeInvite('exp-1', 'inv-1');
    expect((await client.joinWorld('exp-1')).allowed).toBe(false);
    await client.joinTicket('exp-1'); await client.unpublishWorld('exp-1');
    expect(calls.map(c => c.method)).toEqual(['GET', 'PUT', 'POST', 'DELETE', 'POST', 'POST', 'POST']);
    expect(calls.every(c => c.credentials === 'omit')).toBe(true);
    expect(calls.some(c => /uploads|\/import|\/publish$/.test(c.url))).toBe(false);
    expect(ACCOUNT_LINK_SCOPES).toContain('worlds:join');
  });
  it('builds website links without an API-origin assumption or password/token leakage', () => {
    expect(worldShareUrl('https://genvr.net', 'exp-1')).toBe('https://genvr.net/places/exp-1');
    expect(worldShareUrl('https://host.example/app', 'world/id', 'a&b')).toBe('https://host.example/app/places/world%2Fid?invite=a%26b');
    expect(() => worldShareUrl('http://remote.example', 'id')).toThrow();
    expect(() => worldShareUrl('https://user:pass@host.example', 'id')).toThrow();
  });
});
