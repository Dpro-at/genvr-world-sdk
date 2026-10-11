import { type CommandPayload } from '../contracts/index.js';
import type { WorldState, ApplyResult } from './apply.js';
export declare const FIELD_COMMAND_TYPES: readonly ["create_field_set", "set_field_tile", "remove_field_tile", "remove_field_set", "restore_field_tile"];
export type FieldCommand = Extract<CommandPayload, {
    type: (typeof FIELD_COMMAND_TYPES)[number];
}>;
export declare function isFieldCommand(command: CommandPayload): command is FieldCommand;
export declare class TerrainFieldStateError extends Error {
    readonly code: 'invalid' | 'not_found' | 'duplicate';
    constructor(code: 'invalid' | 'not_found' | 'duplicate', message: string);
}
/** Canonical DB storage key without needing a loaded descriptor. Shape is checked by state application. */
export declare function fieldTileStorageKey(setId: string, tx: number, tz: number): string;
export declare function parseFieldTileStorageKey(key: string): {
    setId: string;
    tx: number;
    tz: number;
};
/** Distinct old rows a selective command save must load before applying/producing an inverse. */
export declare function fieldCommandKeys(commands: readonly CommandPayload[]): string[];
export declare function initializeTerrainFieldSets(state: WorldState): void;
/** Descriptor metadata is authoritative; unknown/unreferenced/duplicate persisted rows fail closed. */
export declare function loadTerrainFieldTile(state: WorldState, input: unknown): void;
/** Only loaded referenced rows can be serialized; an omitted old row can never become a deletion. */
export declare function encodeTerrainFieldRow(state: WorldState, key: string): string;
export declare function loadedTerrainFieldKeys(state: WorldState): string[];
export declare function applyFieldCommand(state: WorldState, command: FieldCommand): ApplyResult;
