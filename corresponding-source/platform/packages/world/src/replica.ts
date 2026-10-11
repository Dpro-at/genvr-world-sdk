import type { CommandPayload } from '@genvr/contracts';
import { applyCommand, CommandError, type WorldState } from './apply.js';

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
export class Replica {
  #pending: PendingCommand[] = [];

  constructor(private readonly state: WorldState) {}

  get pending(): readonly PendingCommand[] {
    return this.#pending;
  }

  /** Records a command that was just applied locally (already in the state). */
  track(id: string, command: CommandPayload, inverse: CommandPayload): void {
    this.#pending.push({ id, command, inverse });
  }

  /** The server accepted one of our commands (it is now part of the confirmed history). */
  confirm(id: string): void {
    this.#pending = this.#pending.filter((pending) => pending.id !== id);
  }

  /** A command from someone else, in server order. */
  applyRemote(command: CommandPayload): RebaseResult {
    return this.#rebase(() => applyCommand(this.state, command).changedChunks);
  }

  /** The server refused one of our commands: take it out of the local world. */
  reject(id: string): RebaseResult {
    return this.#rebase(() => new Set<string>(), id);
  }

  /** Forgets pending commands (e.g. after reloading the world from the server). */
  clear(): void {
    this.#pending = [];
  }

  #rebase(applyConfirmed: () => Set<string>, skipId?: string): RebaseResult {
    const changedChunks = new Set<string>();
    const add = (keys: Iterable<string>) => {
      for (const key of keys) changedChunks.add(key);
    };
    // 1. Roll back our pending commands, newest first.
    for (const pending of [...this.#pending].reverse())
      add(applyCommand(this.state, pending.inverse).changedChunks);
    // 2. Apply what the server decided.
    let resync = false;
    try {
      add(applyConfirmed());
    } catch (error) {
      if (!(error instanceof CommandError)) throw error;
      resync = true;
    }
    // 3. Replay our pending commands on top; those that no longer fit are dropped.
    const kept: PendingCommand[] = [];
    const dropped: string[] = [];
    for (const pending of this.#pending) {
      if (pending.id === skipId) continue;
      try {
        const result = applyCommand(this.state, pending.command);
        add(result.changedChunks);
        kept.push({ ...pending, inverse: result.inverse });
      } catch (error) {
        if (!(error instanceof CommandError)) throw error;
        dropped.push(pending.id);
      }
    }
    this.#pending = kept;
    return { changedChunks, dropped, resync };
  }
}
