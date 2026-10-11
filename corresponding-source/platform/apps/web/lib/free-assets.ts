import type { GenvrManifest } from '@genvr/contracts';
import { API_URL } from './api';
import type { StoreEntry } from './store-items';

/**
 * Free outside sources in the studio library (owner, 2026-10-06): search the free models of a source (Poly Haven,
 * Kenney) and add one to the library. Plain requests until the typed API client is generated again with these routes.
 */

/** A free model from an outside source, as the API lists it. */
export type FreeProvider = 'polyhaven' | 'kenney' | 'sketchfab';

export interface FreeAsset {
  provider: FreeProvider;
  assetId: string;
  name: string;
  picture: string | null;
  page: string;
  license: string;
  authors: string[];
  /** The source's groups: Poly Haven categories, Kenney packs. */
  categories: string[];
  /** Where it lands in the library. */
  kind: string;
  styles: string[];
  free: true;
  /** Its library id once added. */
  itemId: string;
}

export class FreeAssetError extends Error {
  /** The API's error code (`sign_in` when Sketchfab needs the creator's own sign-in first). */
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      credentials: 'include',
      ...init,
      headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers },
    });
  } catch {
    throw new FreeAssetError('The server cannot be reached. Please try again.');
  }
  const body = (await response.json().catch(() => null)) as (T & { message?: string; error?: string }) | null;
  if (!response.ok || !body)
    throw new FreeAssetError(body?.message ?? 'Something went wrong. Please try again.', body?.error);
  return body;
}

export const FREE_SORTS = ['popular', 'newest', 'name'] as const;
export type FreeSort = (typeof FREE_SORTS)[number];

/** One page of free models, with the kinds among everything matching the words. */
export interface FreePage {
  source: string;
  /** Every source, for the window's tabs. */
  sources: Array<{ provider: FreeProvider; name: string; signIn: boolean; credit: string | null }>;
  assets: FreeAsset[];
  total: number;
  page: number;
  pages: number;
  categories: Array<{ name: string; count: number }>;
  /** False when the source does not count its matches (Sketchfab): `total` is what is known so far. */
  exact: boolean;
}

/** A page of the free models matching the words, of one kind when given. */
export async function browseFreeAssets(
  options: {
    provider: FreeProvider;
    text: string;
    category: string;
    sort: FreeSort;
    page: number;
    limit: number;
  },
  signal?: AbortSignal,
): Promise<FreePage> {
  const query = new URLSearchParams({
    provider: options.provider,
    q: options.text,
    sort: options.sort,
    page: String(options.page),
    limit: String(options.limit),
    ...(options.category ? { category: options.category } : {}),
  });
  return call<FreePage>(`/v1/free-assets?${query}`, signal ? { signal } : undefined);
}

/** Adds a free model to the library (or finds it when someone already did); its library entry. */
export async function addFreeAsset(asset: FreeAsset): Promise<StoreEntry> {
  const body = await call<{ id: string; manifest: GenvrManifest }>('/v1/free-assets/import', {
    method: 'POST',
    body: JSON.stringify({ provider: asset.provider, assetId: asset.assetId }),
  });
  return { manifest: body.manifest, picture: asset.picture, caption: null, tags: [] };
}

/** Free outside models already in the library (everyone can place them). */
export async function fetchExternalItems(signal?: AbortSignal): Promise<StoreEntry[]> {
  const items: StoreEntry[] = [];
  let after: string | undefined;
  for (let page = 0; page < 20; page++) {
    const query = new URLSearchParams({ source: 'external', limit: '200', ...(after ? { after } : {}) });
    const body = await call<{
      items: Array<{
        manifest: GenvrManifest;
        picture: string | null;
        caption: string | null;
        tags: string[];
      }>;
      next: string | null;
    }>(`/v1/catalog/items?${query}`, signal ? { signal } : undefined);
    for (const item of body.items)
      items.push({ manifest: item.manifest, picture: item.picture, caption: item.caption, tags: item.tags });
    if (!body.next) break;
    after = body.next;
  }
  return items;
}

/** The creator's Sketchfab sign-in (Sketchfab gives its models only to signed-in users). */
export interface SketchfabAccount {
  /** Sketchfab sign-in is set up on this server. */
  available: boolean;
  connected: boolean;
  username: string | null;
}

export async function fetchSketchfabAccount(signal?: AbortSignal): Promise<SketchfabAccount> {
  const body = await call<{ sketchfab: SketchfabAccount }>(
    '/v1/free-assets/accounts',
    signal ? { signal } : undefined,
  );
  return body.sketchfab;
}

/** Where the sign-in window starts; Sketchfab sends it back to `back` (a page of this site). */
export const sketchfabSignInUrl = (back: string) =>
  `${API_URL}/v1/free-assets/sketchfab/connect?${new URLSearchParams({ back })}`;

export async function forgetSketchfab(): Promise<void> {
  await call('/v1/free-assets/sketchfab/account', { method: 'DELETE' });
}

/** The message the sign-in window sends the studio when Sketchfab is done. */
export const SKETCHFAB_SIGNED_IN = 'genvr:sketchfab-sign-in';
