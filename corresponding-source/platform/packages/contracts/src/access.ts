import { z } from 'zod';
import { Id } from './common.js';

/**
 * Who may enter an experience. Always evaluated on the server (API and realtime),
 * never trusted from the client. See docs/PLATFORM.md and docs/CREATOR-FLOW.md.
 */
export const AccessPolicy = z.discriminatedUnion('mode', [
  /** Development mode default: owner plus invited builders only, never listed. */
  z.object({ mode: z.literal('private') }),
  z.object({ mode: z.literal('friends') }),
  z.object({ mode: z.literal('invite') }),
  /** Only the server stores the hash; clients send the plain password over TLS once. */
  z.object({ mode: z.literal('password'), passwordHash: z.string().min(1) }),
  z.object({ mode: z.literal('public') }),
  z.object({ mode: z.literal('subscription'), productId: Id }),
  z.object({ mode: z.literal('class'), classId: Id }),
]);
export type AccessPolicy = z.infer<typeof AccessPolicy>;

export const ACCESS_MODES = [
  'private',
  'friends',
  'invite',
  'password',
  'public',
  'subscription',
  'class',
] as const satisfies readonly AccessPolicy['mode'][];

/** Modes whose experiences may appear in public feeds. */
export function isListed(policy: AccessPolicy): boolean {
  return policy.mode === 'public' || policy.mode === 'subscription';
}
