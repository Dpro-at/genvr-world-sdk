import { z } from 'zod';
import { ContentAnswers } from '@genvr/contracts';
import { GenvrAccountLink, ACCOUNT_LINK_SCOPES, type AccountLinkRequest } from './account-link.js';
import { GenvrClient, worldShareUrl } from './genvr.js';
import type { WorldSession } from './session.js';
const id = z.string().min(1).max(128);
const access = z.discriminatedUnion('mode', [z.object({ mode: z.enum(['private', 'public', 'invite', 'friends']) }).strict(), z.object({ mode: z.literal('password'), password: z.string().min(4).max(64) }).strict()]);
const schemas = {
  genvr_link_start: z.object({ clientName: z.string().min(1).max(80), scopes: z.array(z.enum(ACCOUNT_LINK_SCOPES)).min(1).max(ACCOUNT_LINK_SCOPES.length).optional() }).strict(),
  genvr_link_poll: z.object({}).strict(), genvr_identity: z.object({}).strict(), genvr_disconnect: z.object({}).strict(),
  genvr_create_draft: z.object({ localId: id, confirm: z.literal(true) }).strict(),
  genvr_upload_world: z.object({ localId: id, id, baseVersion: z.number().int().min(0), confirm: z.literal(true), itemMap: z.record(z.string(), z.string()).optional() }).strict(),
  genvr_read_world: z.object({ id }).strict(), genvr_experience: z.object({ id }).strict(),
  genvr_publish_world: z.object({ id, title: z.string().trim().min(1).max(60), description: z.string().max(1000).optional(), type: z.enum(['game', 'event', 'social']), access: z.discriminatedUnion('mode', [z.object({ mode: z.enum(['public', 'invite', 'friends']) }).strict(), z.object({ mode: z.literal('password'), password: z.string().min(4).max(64) }).strict()]), content: ContentAnswers, confirm: z.literal(true) }).strict(),
  genvr_set_access: z.object({ id, access, confirm: z.literal(true) }).strict(),
  genvr_unpublish_world: z.object({ id, confirm: z.literal(true) }).strict(),
  genvr_create_invite: z.object({ id, role: z.enum(['player', 'builder']).default('player'), expiresInHours: z.number().int().min(1).max(720).default(72), confirm: z.literal(true) }).strict(),
  genvr_revoke_invite: z.object({ id, inviteId: id, confirm: z.literal(true) }).strict(),
  genvr_share_url: z.object({ id, invite: z.string().max(128).optional() }).strict(),
  genvr_join_world: z.object({ id, password: z.string().max(64).optional(), invite: z.string().max(128).optional() }).strict(),
  genvr_join_ticket: z.object({ id }).strict(),
};
const descriptions: Record<keyof typeof schemas, string> = {
  genvr_link_start: 'Start browser account consent. Return the user code/page; never ask for a password. No uploads.',
  genvr_link_poll: 'Poll the pending browser consent after its interval. Tokens stay in process memory and are never returned.',
  genvr_identity: 'Read the actual linked account identity.', genvr_disconnect: 'Revoke this process account link.',
  genvr_create_draft: 'Explicitly create one private server draft for the current local-file world. Confirm owner intent; retain the returned ID. No automatic retry.',
  genvr_upload_world: 'Explicitly upload the selected local-file world to an existing owned private draft with optimistic baseVersion. No private library scan or asset submission.',
  genvr_read_world: 'Read a permitted server world/version without replacing the local project.', genvr_experience: 'Read server world ownership/status/access metadata.',
  genvr_publish_world: 'Publish an owned draft after explicit owner confirmation, access choice and content questionnaire.',
  genvr_set_access: 'Change owned world access after explicit confirmation; private excludes ordinary players.',
  genvr_unpublish_world: 'Return owned world to draft; also set access private before reimporting.',
  genvr_create_invite: 'Create a revocable owner-authorized invite. Builder role grants editing; require deliberate owner choice.',
  genvr_revoke_invite: 'Revoke an invite for new acceptances; existing members retain access.',
  genvr_share_url: 'Build a website share URL. It does not grant access or publish anything.',
  genvr_join_world: 'Ask the server to join as the linked account under existing access rules.',
  genvr_join_ticket: 'Request a short-lived realtime ticket. Server access rules still apply.',
};
export const PUBLICATION_TOOLS = Object.entries(schemas).map(([name, schema]) => ({ name, description: descriptions[name as keyof typeof schemas], inputSchema: z.toJSONSchema(schema, { target: 'draft-7' }) as { type: 'object' } }));
/** Host-configured endpoint and in-memory account credentials; no project/storage/library mutations. */
export class GenvrPublicationTools {
  #client: GenvrClient | undefined; #pending: AccountLinkRequest | undefined; #nextPoll = 0;
  constructor(readonly options: { apiUrl?: string; webUrl?: string; accessToken?: string; fetcher?: typeof fetch; now?: () => number } = {}) {
    if (options.apiUrl && options.accessToken) this.#client = GenvrClient.linked(options.apiUrl, options.accessToken, options.fetcher);
  }
  capabilities() { return { configured: Boolean(this.options.apiUrl), linked: Boolean(this.#client), localFileWorldOnly: true }; }
  handles(name: string) { return Object.hasOwn(schemas, name); }
  async call(name: string, args: unknown, session?: WorldSession): Promise<unknown> {
    if (!this.handles(name)) throw new Error('Unknown publication tool.');
    // Parse once before any side effects, then narrow each command with its own schema.
    schemas[name as keyof typeof schemas].parse(args);
    if (name === 'genvr_share_url') { const v = schemas.genvr_share_url.parse(args); if (!this.options.webUrl) throw new Error('Configure GENVR_WEB_URL.'); return { url: worldShareUrl(this.options.webUrl, v.id, v.invite) }; }
    if (!this.options.apiUrl) throw new Error('Configure GENVR_API_URL for account publication.');
    const link = new GenvrAccountLink(this.options.apiUrl, this.options.fetcher);
    if (name === 'genvr_link_start') {
      const v = schemas.genvr_link_start.parse(args);
      if (this.#client) throw new Error('Already linked; disconnect explicitly before changing accounts.');
      this.#pending = await link.start(v.clientName, v.scopes ?? ['worlds:read', 'worlds:write', 'worlds:publish', 'worlds:join']);
      this.#nextPoll = (this.options.now?.() ?? Date.now()) + this.#pending.interval * 1000;
      const { deviceCode: _secret, ...visible } = this.#pending; return visible;
    }
    if (name === 'genvr_link_poll') {
      if (!this.#pending) throw new Error('Start account linking first.');
      const now = this.options.now?.() ?? Date.now(); if (now < this.#nextPoll) throw new Error('Wait for the account link polling interval.');
      this.#nextPoll = now + this.#pending.interval * 1000;
      const result = await link.poll(this.#pending); if (result.status === 'pending') return result;
      this.#client = GenvrClient.linked(this.options.apiUrl, result.account.accessToken, this.options.fetcher); this.#pending = undefined;
      return { status: 'linked', scopes: result.account.scopes, expiresAt: result.account.expiresAt };
    }
    const client = this.#client; if (!client) throw new Error('Link a Genvr account first.');
    if (name === 'genvr_identity') return client.linkedIdentity();
    if (name === 'genvr_disconnect') { await client.disconnect(); this.#client = undefined; return { disconnected: true }; }
    if (name === 'genvr_create_draft' || name === 'genvr_upload_world') {
      const v = name === 'genvr_create_draft' ? schemas.genvr_create_draft.parse(args) : schemas.genvr_upload_world.parse(args);
      if (!session || session.export().id !== v.localId) throw new Error('Open the exact intended local-file world first; live viewport projects are not implicitly uploaded.');
      if (name === 'genvr_create_draft') return client.createDraft(session);
      const upload = schemas.genvr_upload_world.parse(args); return client.uploadWorld(session, upload, upload.itemMap);
    }
    if (name === 'genvr_read_world') return client.readWorld(schemas.genvr_read_world.parse(args).id);
    if (name === 'genvr_experience') return client.experience(schemas.genvr_experience.parse(args).id);
    if (name === 'genvr_publish_world') { const v = schemas.genvr_publish_world.parse(args); return client.publishWorld(v.id, { title: v.title, type: v.type, content: v.content, access: v.access, ...(v.description !== undefined ? { description: v.description } : {}) }); }
    if (name === 'genvr_set_access') { const v = schemas.genvr_set_access.parse(args); return client.setAccess(v.id, v.access); }
    if (name === 'genvr_unpublish_world') return client.unpublishWorld(schemas.genvr_unpublish_world.parse(args).id);
    if (name === 'genvr_create_invite') { const v = schemas.genvr_create_invite.parse(args); return client.createInvite(v.id, { role: v.role, expiresInHours: v.expiresInHours }); }
    if (name === 'genvr_revoke_invite') { const v = schemas.genvr_revoke_invite.parse(args); await client.revokeInvite(v.id, v.inviteId); return { revoked: true }; }
    if (name === 'genvr_join_world') { const { id, ...v } = schemas.genvr_join_world.parse(args); return client.joinWorld(id, { ...(v.password !== undefined ? { password: v.password } : {}), ...(v.invite !== undefined ? { invite: v.invite } : {}) }); }
    return client.joinTicket(schemas.genvr_join_ticket.parse(args).id);
  }
}
