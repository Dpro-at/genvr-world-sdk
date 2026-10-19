import { ContentAnswers, WorldDocument, type Style } from '@genvr/contracts';
import { WorldSession } from './session.js';
export class GenvrError extends Error {
  constructor(message: string, readonly status: number, readonly details: unknown) { super(message); }
}
export interface PublishWorldOptions {
  title: string; description?: string; type: 'game' | 'event' | 'social';
  access: { mode: 'friends' | 'invite' | 'public' } | { mode: 'password'; password: string };
  content: ContentAnswers;
}
export type WorldAccess = { mode: 'private' | 'friends' | 'invite' | 'public' } | { mode: 'password'; password: string };
export interface WorldInvite { id: string; token: string; expiresAt: string; role: 'player' | 'builder'; }
/** A link never grants access by itself. The Genvr server checks the signed-in visitor. */
export function worldShareUrl(webUrl: string, id: string, invite?: string): string {
  const base = new URL(webUrl);
  if ((base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname))) || base.username || base.password || base.search || base.hash) throw new Error('Unsafe Genvr web URL.');
  const url = new URL(`${base.pathname.replace(/\/$/, '')}/places/${encodeURIComponent(id)}`, base.origin);
  if (invite) url.searchParams.set('invite', invite);
  return url.href;
}
export interface SubmitItemOptions {
  name: string; kind: 'props-and-decor' | 'nature' | 'structures' | 'vehicles' | 'characters' | 'building-blocks';
  styles: Style[]; model: string; walkThrough?: boolean; floats?: boolean;
}
/** Credentials live in the caller's fetch implementation (cookie/Bearer), never in the world file. */
export class GenvrClient {
  /** Keep the token in the host's secure credential store, never in portable world files. */
  static linked(baseUrl: string, accessToken: string, fetcher: typeof fetch = globalThis.fetch): GenvrClient {
    if (!/^gvr_link_[A-Za-z0-9_-]{43}$/.test(accessToken)) throw new Error('Invalid linked account token.');
    return new GenvrClient(baseUrl, (input, init) => {
      const headers = new Headers(init?.headers); headers.set('authorization', `Bearer ${accessToken}`);
      return fetcher(input, { ...init, credentials: 'omit', headers });
    });
  }
  constructor(readonly baseUrl: string, readonly fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init)) {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('Genvr endpoint requires HTTPS (or local HTTP).');
    if (url.username || url.password || url.search || url.hash) throw new Error('Endpoint must not contain credentials, query or hash.');
  }
  async #request(path: string, body?: unknown, method = 'POST'): Promise<Record<string, unknown>> {
    const response = await this.fetcher(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
      method, credentials: 'include', ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok) throw new GenvrError(data.message ?? `Genvr returned ${response.status}.`, response.status, data);
    return data;
  }
  async readWorld(id: string): Promise<{ world: WorldDocument; terrain: string[] }> {
    const response = await this.#request(`/v1/experiences/${encodeURIComponent(id)}/world`, undefined, 'GET');
    if (!Array.isArray(response.terrain) || !response.terrain.every(row => typeof row === 'string')) throw new Error('Invalid world terrain response.');
    return { world: WorldDocument.parse(response.world), terrain: response.terrain as string[] };
  }
  /** Browse approved public catalog items. Availability is separate from purchase rights. */
  async catalogItems(options: { after?: string; limit?: number; q?: string } = {}): Promise<{ items: unknown[]; next: string | null }> {
    if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 200)) throw new Error('Invalid catalog limit.');
    if (options.q !== undefined && options.q.length > 100) throw new Error('Catalog query is too long.');
    if (options.after !== undefined && !/^[A-Za-z0-9._-]{1,128}$/.test(options.after)) throw new Error('Invalid catalog cursor.');
    const query = new URLSearchParams({ source: 'user', limit: String(options.limit ?? 200), ...(options.after ? { after: options.after } : {}), ...(options.q ? { q: options.q } : {}) });
    const data = await this.#request('/v1/catalog/items?' + query, undefined, 'GET');
    if (!Array.isArray(data.items) || data.items.length > 200 || !(data.next === null || typeof data.next === 'string')) throw new Error('Invalid catalog response.');
    return { items: data.items, next: data.next };
  }
  /** The server enforces approved/free or authenticated entitlement before issuing asset links. */
  async readItemPackage(id: string): Promise<Record<string, unknown>> {
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(id) || id.includes('..')) throw new Error('Invalid item ID.');
    return this.#request(`/v1/items/${encodeURIComponent(id)}/package`, undefined, 'GET');
  }
  async linkedIdentity(): Promise<{ id: string; name: string }> {
    const user = await this.#request('/v1/account-links/session', undefined, 'GET');
    return { id: String(user.id), name: String(user.name) };
  }
  async disconnect(): Promise<void> { await this.#request('/v1/account-links/disconnect'); }
  /** Create a private draft once, then retain its ID for repeat uploads/recovery. */
  async createDraft(session: WorldSession): Promise<{ id: string }> {
    if (session.export().base.sizeTier !== 'small') throw new Error('Automatic draft creation supports small worlds; select an existing target for other tiers.');
    const created = await this.#request('/v1/experiences', { style: session.export().base.style, empty: true });
    return { id: String(created.id) };
  }
  async uploadWorld(session: WorldSession, target: { id: string; baseVersion: number }, itemMap: Record<string, string> = {}): Promise<{ id: string; version: number }> {
    const saved = await this.#request(`/v1/experiences/${encodeURIComponent(target.id)}/import`, {
      baseVersion: target.baseVersion, package: session.export(), itemMap,
    });
    return { id: target.id, version: Number(saved.version) };
  }
  /** Explicit user action, separate from AI generation and importing a private draft. */
  async publishWorld(id: string, options: PublishWorldOptions): Promise<Record<string, unknown>> {
    ContentAnswers.parse(options.content);
    return this.#request(`/v1/experiences/${encodeURIComponent(id)}/publish`, options);
  }
  /** Server-owned metadata, including isOwner/status/accessMode; no ownership is accepted from the host. */
  async experience(id: string): Promise<Record<string, unknown>> {
    return this.#request(`/v1/experiences/${encodeURIComponent(id)}`, undefined, 'GET');
  }
  async setAccess(id: string, access: WorldAccess): Promise<Record<string, unknown>> {
    return this.#request(`/v1/experiences/${encodeURIComponent(id)}/access`, access, 'PUT');
  }
  /** Return to draft; access mode is retained. Set access to private separately before importing. */
  async unpublishWorld(id: string): Promise<Record<string, unknown>> {
    return this.#request(`/v1/experiences/${encodeURIComponent(id)}/unpublish`);
  }
  async createInvite(id: string, options: { role?: 'player' | 'builder'; expiresInHours?: number } = {}): Promise<WorldInvite> {
    const value = await this.#request(`/v1/experiences/${encodeURIComponent(id)}/invites`, options);
    if (typeof value.id !== 'string' || typeof value.token !== 'string' || typeof value.expiresAt !== 'string' || !['player', 'builder'].includes(String(value.role))) throw new Error('Invalid world invitation response.');
    return value as unknown as WorldInvite;
  }
  /** Revoking an invite stops new acceptance; existing members retain their server-assigned role. */
  async revokeInvite(id: string, inviteId: string): Promise<void> {
    await this.#request(`/v1/experiences/${encodeURIComponent(id)}/invites/${encodeURIComponent(inviteId)}`, undefined, 'DELETE');
  }
  async joinWorld(id: string, options: { password?: string; invite?: string } = {}): Promise<{ allowed: boolean; reason?: string }> {
    const value = await this.#request(`/v1/experiences/${encodeURIComponent(id)}/join`, options);
    if (typeof value.allowed !== 'boolean' || (value.reason !== undefined && typeof value.reason !== 'string')) throw new Error('Invalid join response.');
    return value as { allowed: boolean; reason?: string };
  }
  async joinTicket(id: string): Promise<{ ticket: string; url: string; expiresIn: number }> {
    const value = await this.#request(`/v1/experiences/${encodeURIComponent(id)}/join-ticket`);
    if (typeof value.ticket !== 'string' || typeof value.url !== 'string' || typeof value.expiresIn !== 'number' || value.expiresIn <= 0) throw new Error('Invalid join ticket response.');
    return value as { ticket: string; url: string; expiresIn: number };
  }
  /** Submit to the existing moderated store; this does not approve or list the item. */
  async submitItem(options: SubmitItemOptions): Promise<{ id: string }> {
    const item = await this.#request('/v1/items/uploads', options); return { id: String(item.id) };
  }
}
