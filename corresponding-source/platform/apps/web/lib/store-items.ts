import type { GenvrManifest } from '@genvr/contracts';
import type { LibraryEntry } from '@genvr/core-library';
import { api } from './api';

/** An approved creator item in the library (P1-08), shaped like a Core Library entry. */
export interface StoreEntry extends LibraryEntry {
  /** Signed link to its picture from item analysis, or null when none is drawn yet. */
  picture: string | null;
  caption: string | null;
  tags: string[];
}

/** Most creator items the studio library loads at once (paged by the API). */
const MAX_ITEMS = 600;

/**
 * Approved items made by creators (Core items come with the app). The world loads their
 * packages when they are placed (P2-16); failures give an empty list, the library still works.
 */
export async function fetchStoreItems(signal?: AbortSignal): Promise<StoreEntry[]> {
  const items: StoreEntry[] = [];
  let after: string | undefined;
  while (items.length < MAX_ITEMS) {
    const { data } = await api.GET('/v1/catalog/items', {
      params: { query: { source: 'user', limit: 200, ...(after ? { after } : {}) } },
      ...(signal ? { signal } : {}),
    });
    if (!data) break;
    for (const item of data.items.filter((item) => (item.manifest as GenvrManifest).price.type === 'free'))
      items.push({
        manifest: item.manifest as GenvrManifest,
        picture: item.picture,
        caption: item.caption,
        tags: item.tags,
      });
    if (!data.next) break;
    after = data.next;
  }
  const { data: owned } = await api.GET('/v1/me/test-designs', { ...(signal ? { signal } : {}) });
  for (const member of items.flatMap((i) => i.manifest.bundle ?? [])) {
    const { data: part } = await api.GET('/v1/items/{id}/package', {
      params: { path: { id: member.itemId } },
      ...(signal ? { signal } : {}),
    });
    if (part && !items.some((i) => i.manifest.id === part.id))
      items.push({
        manifest: part.manifest as GenvrManifest,
        picture: null,
        caption: 'Included in a free design pack',
        tags: ['pack'],
      });
  }
  for (const item of owned?.items ?? [])
    items.unshift({
      manifest: item.manifest as GenvrManifest,
      picture: null,
      caption: 'Purchased Test design · private worlds only',
      tags: ['purchased', 'stripe-test'],
    });
  return items;
}

export const isStoreEntry = (entry: LibraryEntry): entry is StoreEntry => 'picture' in entry;
