// Typed client for the Genvr API. Types are generated from platform/apps/api (run `pnpm api:generate`).
import createClient from 'openapi-fetch';
import type { paths } from './schema.js';

export type { components, paths } from './schema.js';

export interface GenvrClientOptions {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  headers?: Record<string, string>;
  /** Send the session cookie on cross-origin requests from the browser (web :3000 -> api :4000). */
  credentials?: 'include' | 'omit' | 'same-origin';
}

export function createGenvrClient({ baseUrl, fetch, headers, credentials }: GenvrClientOptions) {
  return createClient<paths>({
    baseUrl,
    ...(fetch ? { fetch } : {}),
    ...(headers ? { headers } : {}),
    ...(credentials ? { credentials } : {}),
  });
}

export type GenvrClient = ReturnType<typeof createGenvrClient>;
