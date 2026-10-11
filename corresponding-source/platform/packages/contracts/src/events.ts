import { z } from 'zod';

/**
 * Product and learning-loop event catalog shared by web, apps, API, and worker.
 * Adding an event is a contract change; chat and voice content are never tracked.
 */
export const EventName = z.enum([
  'app_opened',
  'signed_up',
  'signed_in',
  'experience_created',
  'experience_published',
  'experience_played',
  'command_applied',
  'ai_generation_requested',
  'ai_generation_completed',
  'ai_output_corrected',
  'store_search',
  'store_search_no_result',
  'item_uploaded',
  'purchase_completed',
  'fps_sample',
  'validator_finding',
  /** A player's time in a place, reported by the realtime room when they leave (P7-01). */
  'play_session',
  /** A realtime room closed: how long it was open and the most players at once (P7-01). */
  'room_closed',
]);
export type EventName = z.infer<typeof EventName>;

/** Property names that may carry free text written by people; never allowed in analytics. */
export const FORBIDDEN_EVENT_PROPERTIES = ['message', 'text', 'chat', 'voice', 'transcript'] as const;

export const EventProperties = z
  .record(z.string(), z.union([z.string().max(200), z.number(), z.boolean(), z.null()]))
  .refine(
    (props) =>
      !Object.keys(props).some((key) => (FORBIDDEN_EVENT_PROPERTIES as readonly string[]).includes(key)),
    'free-text properties are not allowed in analytics events',
  );
export type EventProperties = z.infer<typeof EventProperties>;
