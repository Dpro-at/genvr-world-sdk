import { z } from 'zod';
/** Kinds of illegal content in a notice (task P1-14, EU Digital Services Act article 16). */
export declare const NoticeCategory: z.ZodEnum<{
    "child-safety": "child-safety";
    terrorism: "terrorism";
    "hate-or-violence": "hate-or-violence";
    harassment: "harassment";
    privacy: "privacy";
    "intellectual-property": "intellectual-property";
    "scam-or-fraud": "scam-or-fraud";
    "other-illegal": "other-illegal";
}>;
export type NoticeCategory = z.infer<typeof NoticeCategory>;
/**
 * A notice of illegal content. Name and email are required, except for child-safety notices,
 * which the law allows without them.
 */
export declare const ContentNotice: z.ZodObject<{
    category: z.ZodEnum<{
        "child-safety": "child-safety";
        terrorism: "terrorism";
        "hate-or-violence": "hate-or-violence";
        harassment: "harassment";
        privacy: "privacy";
        "intellectual-property": "intellectual-property";
        "scam-or-fraud": "scam-or-fraud";
        "other-illegal": "other-illegal";
    }>;
    location: z.ZodString;
    explanation: z.ZodString;
    reporterName: z.ZodOptional<z.ZodString>;
    reporterEmail: z.ZodOptional<z.ZodEmail>;
    goodFaith: z.ZodLiteral<true>;
}, z.core.$strip>;
export type ContentNotice = z.infer<typeof ContentNotice>;
