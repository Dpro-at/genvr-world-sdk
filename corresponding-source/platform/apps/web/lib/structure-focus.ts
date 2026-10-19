import { useSyncExternalStore } from 'react';

/** The road or wall last clicked in the Explorer (BUILD-B7): its Properties show in the right dock. */
export type StructureFocus = { kind: 'road' | 'wall'; id: string } | null;

let current: StructureFocus = null;
const listeners = new Set<() => void>();

export function setStructureFocus(next: StructureFocus): void {
  if (next?.kind === current?.kind && next?.id === current?.id) return;
  current = next;
  for (const listener of listeners) listener();
}

export function useStructureFocus(): StructureFocus {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => null,
  );
}
