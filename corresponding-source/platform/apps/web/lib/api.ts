import { createGenvrClient } from '@genvr/api-client';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

let platformEnabled = true;
/** Standalone hosts explicitly disable platform requests; no local session or successful API response is invented. */
export function setPlatformEnabled(enabled: boolean): () => void {
  const previous = platformEnabled;
  platformEnabled = enabled;
  return () => { platformEnabled = previous; };
}
export const api = createGenvrClient({ baseUrl: API_URL, credentials: 'include', fetch: (input, init) =>
  platformEnabled ? globalThis.fetch(input, init) : Promise.resolve(new Response(JSON.stringify({
    message: 'This operation requires a configured Genvr host. Local projects remain available.',
  }), { status: 503, headers: { 'content-type': 'application/json' } })),
});

/** Human-readable message from an API error body. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
}
