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
export interface SubmitItemOptions {
  name: string; kind: 'props-and-decor' | 'nature' | 'structures' | 'vehicles' | 'characters' | 'building-blocks';
  styles: Style[]; model: string; walkThrough?: boolean; floats?: boolean;
}
/** Credentials live in the caller's fetch implementation (cookie/Bearer), never in the world file. */
export class GenvrClient {
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
  /** Submit to the existing moderated store; this does not approve or list the item. */
  async submitItem(options: SubmitItemOptions): Promise<{ id: string }> {
    const item = await this.#request('/v1/items/uploads', options); return { id: String(item.id) };
  }
}
