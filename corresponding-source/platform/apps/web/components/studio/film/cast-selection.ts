import { useSyncExternalStore } from 'react';

/** The character chosen in the Cast tab; the right panel shows its settings (design rule 1: click = edit on the right). */
let chosen: string | null = null;
const listeners = new Set<() => void>();
export const castSelection = {
  get: () => chosen,
  set: (id: string | null) => { if (id === chosen) return; chosen = id; listeners.forEach((l) => l()); },
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
};
export const useCastSelection = () => useSyncExternalStore(castSelection.subscribe, castSelection.get, () => null);
