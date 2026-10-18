import type { AvatarPresentationEvent } from './presentation.js';
import { type CommandPayload, type SideMove, type WorldDocument } from '../contracts/index.js';
import type { ScriptRecording } from '../contracts/index.js';
import type { ScriptLogLine } from '../script/index.js';
import { type ScriptEngine } from './scripts.js';
import { type ToolArgs, type ToolName } from './tools.js';
/** One chat message in the Ollama chat format. */
export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_calls?: ToolCall[];
    /** Name of the tool a `tool` message answers. */
    tool_name?: string;
}
export interface ToolCall {
    function: {
        name: string;
        arguments: Record<string, unknown> | string;
    };
}
/** One model reply; `onText` receives the text as it streams in. */
export type ChatModel = (messages: ChatMessage[], onText: (delta: string) => void, signal?: AbortSignal, 
/** Place in the model's waiting line (P4-05): requests ahead, 0 once the model works on it. */
onQueue?: (ahead: number) => void) => Promise<{
    content: string;
    tool_calls: ToolCall[];
}>;
/** What the assistant can see and change: the editor's world (the studio runtime). */
export interface AssistantHost {
    shareStudio?(input: ToolArgs<'share_studio'>): Promise<unknown>;
    presentAvatar?(event: AvatarPresentationEvent): string | null;
    presentationInfo?(): string;
    avatarVoice?(input: ToolArgs<'avatar_voice'>): Promise<unknown>;
    userAvatarLibrary?(input: ToolArgs<'user_avatar_library'>): Promise<unknown>;
    world(): WorldDocument;
    heightAt(x: number, z: number): number;
    /**
     * Where a new item stands at x, z (P2-11): ground, room floor, or on building parts; with
     * `on`, on top of that item. Null when `on` is unknown. Without it, items stand on the ground.
     */
    restingPoint?(x: number, z: number, on?: string): [number, number, number] | null;
    /**
     * The item's own placement rules at a spot (P2-11): null when it may stand there, otherwise
     * why not (a tree on sand, a bench facing a wall). Without it, every spot is allowed.
     */
    canStand?(itemId: string, position: [number, number, number], yaw?: number): string | null;
    /** Applies commands as one undo step; returns an error message, or null when all applied. */
    apply(commands: CommandPayload[]): string | null;
    /** Digs and fills a pond at x, z; returns an error message or null. */
    addWater(x: number, z: number): string | null;
    /** Where the builder stands and the way they face (radians, 0 = +z), for "here" and "in front". */
    focus(): {
        x: number;
        z: number;
        yaw?: number;
    };
    /**
     * Side-view (2D) places (decision 93): the z of the line players move on (they start at the
     * spawn point); null or absent in 3D places. The camera looks at the line from the +z side.
     */
    sideLine?(): number | null;
    /** Extra moves the creator gave the side-view place (decision 95); none when absent. */
    sideMoves?(): readonly SideMove[];
    /**
     * Places made of 1 m blocks (P2-26): the block tools work, and `heightAt` is the top of the
     * blocks (the first free layer). False or absent elsewhere.
     */
    blockGround?(): boolean;
    /**
     * Catalog search by meaning (P4-03): approved items closest to the words, best first. Null or a
     * failure means it is not available; `search_catalog` then matches words only.
     */
    searchCatalog?(query: string, signal?: AbortSignal): Promise<CatalogHit[] | null>;
    /**
     * Whether an item that is not in the Core Library may be placed (an approved uploaded 3D model).
     * Hosts without a memory of earlier searches (MCP calls) answer it; checked before the items
     * `search_catalog` offered.
     */
    isPlaceable?(itemId: string): boolean;
    /**
     * The script engine (P2-10): the compile-only check and the dry run of `@genvr/script`. Without it the script
     * tools still list, write and check scripts statically, and `test_script` says dry runs are not available.
     */
    scripts?: ScriptEngine;
    /** The place's script log from its open room, after `since` (ms of the room clock); empty when none is open. */
    scriptLog?(since?: number): Promise<ScriptLogLine[]>;
    /** The script-visible events of the open room's last match and its seed (for `test_script`); null for none. */
    scriptRecording?(): Promise<ScriptRecording | null>;
}
/** One result of the catalog search by meaning. */
export interface CatalogHit {
    id: string;
    name: string;
    caption?: string | null;
    /** Store category; uploaded `3d-models` items can be placed (their packages load, P2-16). */
    category?: string;
}
export type AssistantEvent = {
    type: 'text';
    delta: string;
} | {
    type: 'tool';
    name: string;
    args: unknown;
    ok: boolean;
    result: string;
} | {
    type: 'ask';
    question: string;
    options: string[];
} | {
    type: 'done';
    text: string;
}
/** Waiting for the model: requests ahead in line (0 when it starts). */
 | {
    type: 'queue';
    ahead: number;
};
export interface RunOptions {
    model: ChatModel;
    host: AssistantHost;
    /** Earlier messages of this conversation (without the system message). */
    history: ChatMessage[];
    prompt: string;
    onEvent: (event: AssistantEvent) => void;
    /** Model calls per request (each may call several tools). */
    maxSteps?: number;
    signal?: AbortSignal;
    random?: () => number;
}
/**
 * How far players jump with the place's moves (decision 95). A second jump at the top of the
 * first reaches about 2.2 m and stays up about twice as long; a dash in the air adds about 2.5 m
 * across (14 m/s for 0.18 s). The numbers keep some room, like the plain jump's.
 */
export declare function jumpReach(moves: readonly SideMove[]): {
    up: number;
    across: number;
    acrossUp: number;
};
/**
 * The place-specific lines of the system prompt: the side-view line and jump reach, and the block
 * rules. Empty for a plain 3D place. Other doors to the tools (MCP) send the same notes.
 */
export declare function placeNotes(host: AssistantHost): string[];
export declare function systemPrompt(host: AssistantHost): string;
/** What one tool call did: its answer for the model, and a question for the builder (ask_user). */
export interface Outcome {
    ok: boolean;
    result: string;
    ask?: {
        question: string;
        options: string[];
    };
}
/** Runs one tool call against the host. */
export declare function executeTool(name: ToolName, args: unknown, host: AssistantHost, random?: () => number): Outcome;
export interface RunToolOptions {
    signal?: AbortSignal | undefined;
    random?: (() => number) | undefined;
}
/**
 * The one entry point for a tool call, whoever makes it (the built-in loop, MCP): parses the
 * arguments (an object or a JSON string) with the tool's schema, runs `search_catalog` with the
 * host's search by meaning, and every other tool with `executeTool`.
 */
export declare function runTool(name: string, rawArgs: unknown, host: AssistantHost, options?: RunToolOptions): Promise<Outcome>;
/**
 * The tool loop (task P4-02): sends the conversation to the model, runs every tool call it makes,
 * returns the results, and repeats until the model answers in words, asks the builder, or runs
 * out of steps. An invalid call gets its error back so the model can fix it once more.
 * Returns the conversation to keep for the next request (without the system message).
 */
export declare function runAssistant({ model, host, history, prompt, onEvent, maxSteps, signal, random, }: RunOptions): Promise<ChatMessage[]>;
