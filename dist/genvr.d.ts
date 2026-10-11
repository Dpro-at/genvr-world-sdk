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
    /** Submit to the existing moderated store; this does not approve or list the item. */
    submitItem(options: SubmitItemOptions): Promise<{
        id: string;
    }>;
}
