import { ContentAnswers, WorldDocument } from '@genvr/contracts';
import { WorldSession } from './session.js';
export class GenvrError extends Error {
    status;
    details;
    constructor(message, status, details) {
        super(message);
        this.status = status;
        this.details = details;
    }
}
/** A link never grants access by itself. The Genvr server checks the signed-in visitor. */
export function worldShareUrl(webUrl, id, invite) {
    const base = new URL(webUrl);
    if ((base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname))) || base.username || base.password || base.search || base.hash)
        throw new Error('Unsafe Genvr web URL.');
    const url = new URL(`${base.pathname.replace(/\/$/, '')}/places/${encodeURIComponent(id)}`, base.origin);
    if (invite)
        url.searchParams.set('invite', invite);
    return url.href;
}
/** Credentials live in the caller's fetch implementation (cookie/Bearer), never in the world file. */
export class GenvrClient {
    baseUrl;
    fetcher;
    /** Keep the token in the host's secure credential store, never in portable world files. */
    static linked(baseUrl, accessToken, fetcher = globalThis.fetch) {
        if (!/^gvr_link_[A-Za-z0-9_-]{43}$/.test(accessToken))
            throw new Error('Invalid linked account token.');
        return new GenvrClient(baseUrl, (input, init) => {
            const headers = new Headers(init?.headers);
            headers.set('authorization', `Bearer ${accessToken}`);
            return fetcher(input, { ...init, credentials: 'omit', headers });
        });
    }
    constructor(baseUrl, fetcher = (input, init) => globalThis.fetch(input, init)) {
        this.baseUrl = baseUrl;
        this.fetcher = fetcher;
        const url = new URL(baseUrl);
        if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
            throw new Error('Genvr endpoint requires HTTPS (or local HTTP).');
        if (url.username || url.password || url.search || url.hash)
            throw new Error('Endpoint must not contain credentials, query or hash.');
    }
    async #request(path, body, method = 'POST') {
        const response = await this.fetcher(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
            method, credentials: 'include', ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
        });
        const data = await response.json();
        if (!response.ok)
            throw new GenvrError(data.message ?? `Genvr returned ${response.status}.`, response.status, data);
        return data;
    }
    async readWorld(id) {
        const response = await this.#request(`/v1/experiences/${encodeURIComponent(id)}/world`, undefined, 'GET');
        if (!Array.isArray(response.terrain) || !response.terrain.every(row => typeof row === 'string'))
            throw new Error('Invalid world terrain response.');
        return { world: WorldDocument.parse(response.world), terrain: response.terrain };
    }
    /** Browse approved public catalog items. Availability is separate from purchase rights. */
    async catalogItems(options = {}) {
        if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 200))
            throw new Error('Invalid catalog limit.');
        if (options.q !== undefined && options.q.length > 100)
            throw new Error('Catalog query is too long.');
        if (options.after !== undefined && !/^[A-Za-z0-9._-]{1,128}$/.test(options.after))
            throw new Error('Invalid catalog cursor.');
        const query = new URLSearchParams({ source: 'user', limit: String(options.limit ?? 200), ...(options.after ? { after: options.after } : {}), ...(options.q ? { q: options.q } : {}) });
        const data = await this.#request('/v1/catalog/items?' + query, undefined, 'GET');
        if (!Array.isArray(data.items) || data.items.length > 200 || !(data.next === null || typeof data.next === 'string'))
            throw new Error('Invalid catalog response.');
        return { items: data.items, next: data.next };
    }
    /** The server enforces approved/free or authenticated entitlement before issuing asset links. */
    async readItemPackage(id) {
        if (!/^[A-Za-z0-9._-]{1,128}$/.test(id) || id.includes('..'))
            throw new Error('Invalid item ID.');
        return this.#request(`/v1/items/${encodeURIComponent(id)}/package`, undefined, 'GET');
    }
    async linkedIdentity() {
        const user = await this.#request('/v1/account-links/session', undefined, 'GET');
        return { id: String(user.id), name: String(user.name) };
    }
    async disconnect() { await this.#request('/v1/account-links/disconnect'); }
    /** Create a private draft once, then retain its ID for repeat uploads/recovery. */
    async createDraft(session) {
        if (session.export().base.sizeTier !== 'small')
            throw new Error('Automatic draft creation supports small worlds; select an existing target for other tiers.');
        const created = await this.#request('/v1/experiences', { style: session.export().base.style, empty: true });
        return { id: String(created.id) };
    }
    async uploadWorld(session, target, itemMap = {}) {
        const saved = await this.#request(`/v1/experiences/${encodeURIComponent(target.id)}/import`, {
            baseVersion: target.baseVersion, package: session.export(), itemMap,
        });
        return { id: target.id, version: Number(saved.version) };
    }
    /** Explicit user action, separate from AI generation and importing a private draft. */
    async publishWorld(id, options) {
        ContentAnswers.parse(options.content);
        return this.#request(`/v1/experiences/${encodeURIComponent(id)}/publish`, options);
    }
    /** Server-owned metadata, including isOwner/status/accessMode; no ownership is accepted from the host. */
    async experience(id) {
        return this.#request(`/v1/experiences/${encodeURIComponent(id)}`, undefined, 'GET');
    }
    async setAccess(id, access) {
        return this.#request(`/v1/experiences/${encodeURIComponent(id)}/access`, access, 'PUT');
    }
    /** Return to draft; access mode is retained. Set access to private separately before importing. */
    async unpublishWorld(id) {
        return this.#request(`/v1/experiences/${encodeURIComponent(id)}/unpublish`);
    }
    async createInvite(id, options = {}) {
        const value = await this.#request(`/v1/experiences/${encodeURIComponent(id)}/invites`, options);
        if (typeof value.id !== 'string' || typeof value.token !== 'string' || typeof value.expiresAt !== 'string' || !['player', 'builder'].includes(String(value.role)))
            throw new Error('Invalid world invitation response.');
        return value;
    }
    /** Revoking an invite stops new acceptance; existing members retain their server-assigned role. */
    async revokeInvite(id, inviteId) {
        await this.#request(`/v1/experiences/${encodeURIComponent(id)}/invites/${encodeURIComponent(inviteId)}`, undefined, 'DELETE');
    }
    async joinWorld(id, options = {}) {
        const value = await this.#request(`/v1/experiences/${encodeURIComponent(id)}/join`, options);
        if (typeof value.allowed !== 'boolean' || (value.reason !== undefined && typeof value.reason !== 'string'))
            throw new Error('Invalid join response.');
        return value;
    }
    async joinTicket(id) {
        const value = await this.#request(`/v1/experiences/${encodeURIComponent(id)}/join-ticket`);
        if (typeof value.ticket !== 'string' || typeof value.url !== 'string' || typeof value.expiresIn !== 'number' || value.expiresIn <= 0)
            throw new Error('Invalid join ticket response.');
        return value;
    }
    /** Submit to the existing moderated store; this does not approve or list the item. */
    async submitItem(options) {
        const item = await this.#request('/v1/items/uploads', options);
        return { id: String(item.id) };
    }
}
//# sourceMappingURL=genvr.js.map