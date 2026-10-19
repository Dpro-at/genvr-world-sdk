import { ContentAnswers, WorldDocument, type Style } from '@genvr/contracts';
import { WorldSession } from './session.js';
export declare class GenvrError extends Error {
    readonly status: number;
    readonly details: unknown;
    constructor(message: string, status: number, details: unknown);
}
export interface PublishWorldOptions {
    title: string;
    description?: string;
    type: 'game' | 'event' | 'social';
    access: {
        mode: 'friends' | 'invite' | 'public';
    } | {
        mode: 'password';
        password: string;
    };
    content: ContentAnswers;
}
export type WorldAccess = {
    mode: 'private' | 'friends' | 'invite' | 'public';
} | {
    mode: 'password';
    password: string;
};
export interface WorldInvite {
    id: string;
    token: string;
    expiresAt: string;
    role: 'player' | 'builder';
}
/** A link never grants access by itself. The Genvr server checks the signed-in visitor. */
export declare function worldShareUrl(webUrl: string, id: string, invite?: string): string;
export interface SubmitItemOptions {
    name: string;
    kind: 'props-and-decor' | 'nature' | 'structures' | 'vehicles' | 'characters' | 'building-blocks';
    styles: Style[];
    model: string;
    walkThrough?: boolean;
    floats?: boolean;
}
/** Credentials live in the caller's fetch implementation (cookie/Bearer), never in the world file. */
export declare class GenvrClient {
    #private;
    readonly baseUrl: string;
    readonly fetcher: typeof fetch;
    /** Keep the token in the host's secure credential store, never in portable world files. */
    static linked(baseUrl: string, accessToken: string, fetcher?: typeof fetch): GenvrClient;
    constructor(baseUrl: string, fetcher?: typeof fetch);
    readWorld(id: string): Promise<{
        world: WorldDocument;
        terrain: string[];
    }>;
    /** Browse approved public catalog items. Availability is separate from purchase rights. */
    catalogItems(options?: {
        after?: string;
        limit?: number;
        q?: string;
    }): Promise<{
        items: unknown[];
        next: string | null;
    }>;
    /** The server enforces approved/free or authenticated entitlement before issuing asset links. */
    readItemPackage(id: string): Promise<Record<string, unknown>>;
    linkedIdentity(): Promise<{
        id: string;
        name: string;
    }>;
    disconnect(): Promise<void>;
    /** Create a private draft once, then retain its ID for repeat uploads/recovery. */
    createDraft(session: WorldSession): Promise<{
        id: string;
    }>;
    uploadWorld(session: WorldSession, target: {
        id: string;
        baseVersion: number;
    }, itemMap?: Record<string, string>): Promise<{
        id: string;
        version: number;
    }>;
    /** Explicit user action, separate from AI generation and importing a private draft. */
    publishWorld(id: string, options: PublishWorldOptions): Promise<Record<string, unknown>>;
    /** Server-owned metadata, including isOwner/status/accessMode; no ownership is accepted from the host. */
    experience(id: string): Promise<Record<string, unknown>>;
    setAccess(id: string, access: WorldAccess): Promise<Record<string, unknown>>;
    /** Return to draft; access mode is retained. Set access to private separately before importing. */
    unpublishWorld(id: string): Promise<Record<string, unknown>>;
    createInvite(id: string, options?: {
        role?: 'player' | 'builder';
        expiresInHours?: number;
    }): Promise<WorldInvite>;
    /** Revoking an invite stops new acceptance; existing members retain their server-assigned role. */
    revokeInvite(id: string, inviteId: string): Promise<void>;
    joinWorld(id: string, options?: {
        password?: string;
        invite?: string;
    }): Promise<{
        allowed: boolean;
        reason?: string;
    }>;
    joinTicket(id: string): Promise<{
        ticket: string;
        url: string;
        expiresIn: number;
    }>;
    /** Submit to the existing moderated store; this does not approve or list the item. */
    submitItem(options: SubmitItemOptions): Promise<{
        id: string;
    }>;
}
