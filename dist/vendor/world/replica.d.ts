import type { CommandPayload } from '../contracts/index.js';
import { type WorldState } from './apply.js';
/** A local command the server has not confirmed yet. */
export interface PendingCommand {
    id: string;
    command: CommandPayload;
    /** Inverse as of the current position of the command in the local state. */
    inverse: CommandPayload;
}
export interface RebaseResult {
    /** Terrain chunks touched while rebasing (to rebuild meshes and colliders). */
    changedChunks: Set<string>;
    /** Local commands that no longer apply after the rebase (they were dropped). */
    dropped: string[];
    /** True when a server command did not apply here: the local world is out of sync. */
    resync: boolean;
}
/**
 * Client side of co-building (task P3-08). Local commands apply at once (no waiting) and stay
 * pending until the server confirms them. When a command from another builder arrives, the
 * pending commands are rolled back, the server command applies, and the pending commands are
 * replayed on top, so every client ends with the server's order. The same scheme games use
 * for client prediction and reconciliation; commands are deterministic, so it converges.
 */
export declare class Replica {
    #private;
    private readonly state;
    constructor(state: WorldState);
    get pending(): readonly PendingCommand[];
    /** Records a command that was just applied locally (already in the state). */
    track(id: string, command: CommandPayload, inverse: CommandPayload): void;
    /** The server accepted one of our commands (it is now part of the confirmed history). */
    confirm(id: string): void;
    /** A command from someone else, in server order. */
    applyRemote(command: CommandPayload): RebaseResult;
    /** The server refused one of our commands: take it out of the local world. */
    reject(id: string): RebaseResult;
    /** Forgets pending commands (e.g. after reloading the world from the server). */
    clear(): void;
}
