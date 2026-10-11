import { z } from 'zod';
/**
 * Product and learning-loop event catalog shared by web, apps, API, and worker.
 * Adding an event is a contract change; chat and voice content are never tracked.
 */
export declare const EventName: z.ZodEnum<{
    app_opened: "app_opened";
    signed_up: "signed_up";
    signed_in: "signed_in";
    experience_created: "experience_created";
    experience_published: "experience_published";
    experience_played: "experience_played";
    command_applied: "command_applied";
    ai_generation_requested: "ai_generation_requested";
    ai_generation_completed: "ai_generation_completed";
    ai_output_corrected: "ai_output_corrected";
    store_search: "store_search";
    store_search_no_result: "store_search_no_result";
    item_uploaded: "item_uploaded";
    purchase_completed: "purchase_completed";
    fps_sample: "fps_sample";
    validator_finding: "validator_finding";
    play_session: "play_session";
    room_closed: "room_closed";
}>;
export type EventName = z.infer<typeof EventName>;
/** Property names that may carry free text written by people; never allowed in analytics. */
export declare const FORBIDDEN_EVENT_PROPERTIES: readonly ["message", "text", "chat", "voice", "transcript"];
export declare const EventProperties: z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodNull]>>;
export type EventProperties = z.infer<typeof EventProperties>;
