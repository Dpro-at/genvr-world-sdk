import type { UserAvatarMetadata, UserAvatarStorage } from '../src/user-avatar-library.js';

/** Board A14: what one card's Delete removes, and the owner's confirm that an agent's delete waits for. */
export const FALLBACK_BODY_NAME = 'Standard robot';

export interface DeletePlan { name: string; kind: UserAvatarMetadata['kind']; ids: string[]; motionIds: string[]; }
export interface DeleteRequest extends DeletePlan { usedBy: string[]; by: 'owner' | 'agent'; }
export interface DeleteAnswer { deleted: boolean; alsoMotions: boolean; }

/** Built-in bodies are part of the package and never deletable. */
export const deletable = (id: string) => /^user\.mixamo\.[a-f0-9]{64}\.(character|motion)$/.test(id);

export const displayName = (row: UserAvatarMetadata) => row.kind === 'character' ? row.name.split('__')[0]!.replace(/_/g, ' ') : row.name;

/** A card stands for every copy with the same file and name; motions from the same file stay unless the owner ticks them. */
export function deletePlan(rows: readonly UserAvatarMetadata[], id: string): DeletePlan | null {
  const row = rows.find(row => row.id === id);
  if (!row || !deletable(id)) return null;
  const ids = rows.filter(other => other.kind === row.kind && other.originalFile === row.originalFile && other.name === row.name).map(other => other.id);
  const motionIds = row.kind === 'character' ? rows.filter(other => other.kind === 'motion' && other.originalFile === row.originalFile).map(other => other.id) : [];
  return { name: displayName(row), kind: row.kind, ids, motionIds };
}

/** Removes the assets with their metadata and assignments; returns the targets of this project that used them. */
export async function deleteFromLibrary(storage: UserAvatarStorage, projectId: string, plan: DeletePlan, alsoMotions: boolean): Promise<string[]> {
  const targets = new Set<string>();
  for (const id of plan.ids) for (const row of await storage.usage(id)) if (row.projectId === projectId) targets.add(row.target);
  for (const id of alsoMotions ? [...plan.ids, ...plan.motionIds] : plan.ids) await storage.remove(id);
  return [...targets];
}

/** One confirm at a time. An agent's request resolves only on the owner's Delete or Cancel (or cancels after `timeout`). */
export class DeleteConfirmGate {
  #pending: { request: DeleteRequest; resolve(answer: DeleteAnswer): void; timer: ReturnType<typeof setTimeout> | undefined } | null = null;
  #listeners = new Set<() => void>();
  constructor(private readonly timeout = 50000) {}
  get pending(): DeleteRequest | null { return this.#pending?.request ?? null; }
  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  snapshot = () => this.pending;
  ask(request: DeleteRequest): Promise<DeleteAnswer> {
    if (this.#pending) return Promise.reject(new Error('Another delete is waiting for the owner.'));
    return new Promise(resolve => {
      const timer = request.by === 'agent' ? setTimeout(() => this.answer({ deleted: false, alsoMotions: false }), this.timeout) : undefined;
      this.#pending = { request, resolve, timer }; this.#publish();
    });
  }
  /** Only the Studio's own Delete / Cancel buttons call this. */
  answer(answer: DeleteAnswer) {
    const pending = this.#pending; if (!pending) return;
    clearTimeout(pending.timer); this.#pending = null; this.#publish(); pending.resolve(answer);
  }
  #publish() { for (const listener of this.#listeners) listener(); }
}
