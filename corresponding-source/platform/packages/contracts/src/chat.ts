import { z } from 'zod';

/**
 * Platform text chat (task P3-09, docs/PLAYER-UI.md section 6). The realtime room filters every
 * message before anyone sees it; chat text is never stored except as evidence in a report.
 */
export const CHAT = {
  /** Characters per message. */
  maxLength: 150,
  /** Messages per player in `windowMs`. */
  burst: 5,
  windowMs: 10_000,
  /** Global chat (every room of the place, P3-19) is stricter: messages per `globalWindowMs`. */
  globalBurst: 2,
  globalWindowMs: 15_000,
  /** Recent messages a late joiner sees. */
  history: 30,
  /** Messages of the reported player attached to a report. */
  evidence: 10,
} as const;

/** Here: this room. Global: every room of the place (P3-19). */
export const ChatChannel = z.enum(['here', 'global']);
export type ChatChannel = z.infer<typeof ChatChannel>;

/** What a client sends. */
export const ChatSend = z.object({
  text: z
    .string()
    .min(1)
    .max(CHAT.maxLength * 2),
  channel: ChatChannel.default('here'),
});
export type ChatSend = z.infer<typeof ChatSend>;

/** What everyone in the room receives (already filtered). */
export interface ChatMessage {
  id: string;
  channel: ChatChannel;
  /** Session id of the sender (in this room, or in another room of the place for global). */
  from: string;
  name: string;
  text: string;
  /** Milliseconds since the epoch. */
  at: number;
}

/** Why a player is reported (fixed list, so kids only tap). */
export const ReportReason = z.enum([
  'bullying',
  'bad-words',
  'personal-info',
  'scary-or-adult',
  'cheating',
  'other',
]);
export type ReportReason = z.infer<typeof ReportReason>;

/**
 * Report from inside a place: a player (with their recent chat as evidence), the place itself, or
 * a build players made with their hands near the reporter (decision 109; the room finds its
 * author and keeps its blocks as evidence).
 */
export const InGameReport = z.discriminatedUnion('target', [
  z.object({ target: z.literal('player'), sessionId: z.string().min(1).max(64), reason: ReportReason }),
  z.object({ target: z.literal('place'), reason: ReportReason }),
  z.object({ target: z.literal('build'), reason: ReportReason }),
]);
export type InGameReport = z.infer<typeof InGameReport>;

/** Block or unblock a player in the room (by session id; the room knows the account). */
export const BlockRequest = z.object({ sessionId: z.string().min(1).max(64) });
export type BlockRequest = z.infer<typeof BlockRequest>;
