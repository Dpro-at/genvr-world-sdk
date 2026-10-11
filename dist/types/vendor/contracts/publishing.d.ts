import { z } from 'zod';
/**
 * Mandatory content questionnaire shown on the About page when publishing (docs/CREATOR-FLOW.md).
 * The age rating is computed from the answers, never chosen freely.
 */
export declare const ContentAnswers: z.ZodObject<{
    violence: z.ZodBoolean;
    blood: z.ZodBoolean;
    horror: z.ZodBoolean;
    romance: z.ZodBoolean;
    userChat: z.ZodBoolean;
    paidItems: z.ZodBoolean;
}, z.core.$strip>;
export type ContentAnswers = z.infer<typeof ContentAnswers>;
export declare const AgeRating: z.ZodEnum<{
    all: "all";
    "9+": "9+";
    "13+": "13+";
}>;
export type AgeRating = z.infer<typeof AgeRating>;
export declare function computeAgeRating(answers: ContentAnswers): AgeRating;
