import { type FilmingTool } from './mcp-filming.js';
type StudioSession = {
    id: string;
    projectId: string;
    title: string;
    placeId: string;
    capabilities: Record<string, unknown>;
};
export declare const LIVE_TOOLS: ({
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            session_id?: never;
            include_checks?: never;
        };
        additionalProperties: boolean;
        required?: never;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            session_id: {
                type: string;
                format: string;
            };
            include_checks?: never;
        };
        required: string[];
        additionalProperties: boolean;
    };
} | {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: {
            include_checks: {
                type: string;
            };
            session_id?: never;
        };
        additionalProperties: boolean;
        required?: never;
    };
})[];
export declare class LiveStudioClient {
    #private;
    readonly connection: string;
    readonly output: string;
    selected: string | undefined;
    constructor(connection: string, output: string);
    sessions(): Promise<StudioSession[]>;
    select(input: unknown): Promise<{
        session_id: string;
    }>;
    call(tool: string, args?: unknown, sessionId?: string | undefined): Promise<unknown>;
    filming(name: FilmingTool, input: unknown): Promise<{
        status: string;
        result?: unknown;
        error?: string;
    } | {
        sessions: {
            session_id: string;
            place_id: string;
            project_id: string;
            title: string;
            local: boolean;
        }[];
        job_id?: never;
        local?: never;
    } | {
        job_id: `${string}-${string}-${string}-${string}-${string}`;
        local: boolean;
        sessions?: never;
    }>;
}
export {};
