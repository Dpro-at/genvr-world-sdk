import { z } from 'zod';
/**
 * Platform text chat (task P3-09, docs/PLAYER-UI.md section 6). The realtime room filters every
 * message before anyone sees it; chat text is never stored except as evidence in a report.
 */
export declare const CHAT: {
    /** Characters per message. */
    readonly maxLength: 150;
    /** Messages per player in `windowMs`. */
    readonly burst: 5;
    readonly windowMs: 10000;
    /** Global chat (every room of the place, P3-19) is stricter: messages per `globalWindowMs`. */
    readonly globalBurst: 2;
    readonly globalWindowMs: 15000;
    /** Recent messages a late joiner sees. */
    readonly history: 30;
    /** Messages of the reported player attached to a report. */
    readonly evidence: 10;
};
/** Here: this room. Global: every room of the place (P3-19). */
export declare const ChatChannel: z.ZodEnum<{
    global: "global";
    here: "here";
}>;
export type ChatChannel = z.infer<typeof ChatChannel>;
/** What a client sends. */
export declare const ChatSend: z.ZodObject<{
    text: z.ZodString;
    channel: z.ZodDefault<z.ZodEnum<{
        global: "global";
        here: "here";
    }>>;
}, z.core.$strip>;
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
export declare const ReportReason: z.ZodEnum<{
    bullying: "bullying";
    "bad-words": "bad-words";
    "personal-info": "personal-info";
    "scary-or-adult": "scary-or-adult";
    cheating: "cheating";
    other: "other";
}>;
export type ReportReason = z.infer<typeof ReportReason>;
/**
 * Report from inside a place: a player (with their recent chat as evidence), the place itself, or
 * a build players made with their hands near the reporter (decision 109; the room finds its
 * author and keeps its blocks as evidence).
 */
export declare const InGameReport: z.ZodDiscriminatedUnion<[z.ZodObject<{
    target: z.ZodLiteral<"player">;
    sessionId: z.ZodString;
    reason: z.ZodEnum<{
        bullying: "bullying";
        "bad-words": "bad-words";
        "personal-info": "personal-info";
        "scary-or-adult": "scary-or-adult";
        cheating: "cheating";
        other: "other";
    }>;
}, z.core.$strip>, z.ZodObject<{
    target: z.ZodLiteral<"place">;
    reason: z.ZodEnum<{
        bullying: "bullying";
        "bad-words": "bad-words";
        "personal-info": "personal-info";
        "scary-or-adult": "scary-or-adult";
        cheating: "cheating";
        other: "other";
    }>;
}, z.core.$strip>, z.ZodObject<{
    target: z.ZodLiteral<"build">;
    reason: z.ZodEnum<{
        bullying: "bullying";
        "bad-words": "bad-words";
        "personal-info": "personal-info";
        "scary-or-adult": "scary-or-adult";
        cheating: "cheating";
        other: "other";
    }>;
}, z.core.$strip>], "target">;
export type InGameReport = z.infer<typeof InGameReport>;
/** Block or unblock a player in the room (by session id; the room knows the account). */
export declare const BlockRequest: z.ZodObject<{
    sessionId: z.ZodString;
}, z.core.$strip>;
export type BlockRequest = z.infer<typeof BlockRequest>;
