import type { LibraryEntry } from '@genvr/core-library';
import { useSyncExternalStore } from 'react';

/** The library item last picked in Items (ITEMS-I7): its details show in the right dock. */
let current: LibraryEntry | null = null;
const listeners = new Set<() => void>();

export function setLibraryDetails(next: LibraryEntry | null): void {
  if (next?.manifest.id === current?.manifest.id && next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

export function useLibraryDetails(): LibraryEntry | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => null,
  );
}

/** World styles in plain words, the same everywhere (ITEMS-I0: the status line and the empty text differed). */
export const STYLE_NAMES: Record<string, string> = { blocky: 'Simple', realistic: 'Realistic', anime: 'Cartoon', voxel: 'Voxel' };

/** Store categories in plain words (ITEMS-I7: the details showed raw slugs). */
export const KIND_NAMES: Record<string, string> = {
  parts: 'Parts', nature: 'Nature', 'props-and-decor': 'Props and decor', structures: 'Buildings', 'building-blocks': 'Blocks',
  gameplay: 'Game', roads: 'Roads', ground: 'Ground', walls: 'Walls', openings: 'Doors and windows', water: 'Water', sky: 'Sky',
  weather: 'Weather', emotes: 'Moves', '3d-models': '3D models', environment: 'Environment', 'avatar-appearance': 'Avatar',
};
export const kindName = (slug: string) => KIND_NAMES[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' ');
