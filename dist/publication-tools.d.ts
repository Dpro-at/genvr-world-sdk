import type { WorldSession } from './session.js';
/** Account-changing tools; `confirm:true` is agent-supplied, so the host must opt in to exposing them. */
export declare const PUBLICATION_MUTATION_TOOLS: ReadonlySet<string>;
export declare const PUBLICATION_TOOLS: {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
    };
}[];
/** Host-configured endpoint and in-memory account credentials; no project/storage/library mutations. */
export declare class GenvrPublicationTools {
    #private;
    readonly options: {
        apiUrl?: string;
        webUrl?: string;
        accessToken?: string;
        allowMutations?: boolean;
        fetcher?: typeof fetch;
        now?: () => number;
    };
    constructor(options?: {
        apiUrl?: string;
        webUrl?: string;
        accessToken?: string;
        allowMutations?: boolean;
        fetcher?: typeof fetch;
        now?: () => number;
    });
    capabilities(): {
        configured: boolean;
        linked: boolean;
        mutations: boolean;
        localFileWorldOnly: boolean;
    };
    /** Tools to list: mutations are hidden unless the host opted in. */
    tools(): {
        name: string;
        description: string;
        inputSchema: {
            type: "object";
        };
    }[];
    handles(name: string): boolean;
    call(name: string, args: unknown, session?: WorldSession): Promise<unknown>;
}
