import { CommandPayload, WorldDocument, WorldPackage, type ItemPackage } from './vendor/contracts/index.js';
import { type ChatModel, type AssistantEvent } from './vendor/assistant/index.js';
import { type WorldState } from './vendor/world/index.js';
export declare const SDK_VERSION = "0.1.1";
export declare const PACKAGE_WORK_BUDGET = 5000000;
export type WorldEvent = {
    type: 'changed' | 'saved' | 'opened';
    id: string;
} | {
    type: 'assistant';
    event: AssistantEvent;
};
export interface NewWorldOptions {
    id?: string;
    title?: string;
    base?: WorldPackage['base'];
    onEvent?: (event: WorldEvent) => void;
}
export declare function readWorldPackage(input: unknown): WorldPackage;
/** The sole reconstruction path, also used by the API. Commands retain engine validation. */
export declare function replayWorldPackage(input: unknown): {
    package: WorldPackage;
    state: WorldState;
};
export declare class WorldSession {
    #private;
    constructor(input: unknown, onEvent?: (event: WorldEvent) => void);
    static create(options?: NewWorldOptions): WorldSession;
    get world(): WorldDocument;
    get terrainChunks(): string[];
    get canUndo(): boolean;
    get canRedo(): boolean;
    export(): WorldPackage;
    serialize(): string;
    heightAt(x: number, z: number): number;
    /** Validate/replay off to the side: a refused batch leaves both world and undo unchanged. */
    apply(commands: readonly CommandPayload[]): void;
    undo(): void;
    redo(): void;
    addAsset(asset: WorldPackage['assets'][number]): void;
    tool(name: string, args: unknown): Promise<import("./vendor/assistant/index.js").Outcome>;
    /** The host supplies its model; tools can never publish or spend money. */
    generate(prompt: string, model: ChatModel, options?: {
        signal?: AbortSignal;
        onEvent?: (event: AssistantEvent) => void;
    }): Promise<void>;
    /** File URLs are embedded data URLs, not expiring platform URLs. */
    itemPackage(id: string): Promise<ItemPackage | null>;
}
