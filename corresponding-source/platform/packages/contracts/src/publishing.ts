import { z } from 'zod';

/**
 * Mandatory content questionnaire shown on the About page when publishing (docs/CREATOR-FLOW.md).
 * The age rating is computed from the answers, never chosen freely.
 */
export const ContentAnswers = z.object({
  /** Fighting, weapons, or defeating characters (stylized, non-graphic). */
  violence: z.boolean(),
  /** Blood or injury shown. */
  blood: z.boolean(),
  /** Scary themes, jump scares, horror atmosphere. */
  horror: z.boolean(),
  /** Romance, dating, or kissing. */
  romance: z.boolean(),
  /** Players can chat with each other. */
  userChat: z.boolean(),
  /** Items or passes sold for coins. */
  paidItems: z.boolean(),
});
export type ContentAnswers = z.infer<typeof ContentAnswers>;

export const AgeRating = z.enum(['all', '9+', '13+']);
export type AgeRating = z.infer<typeof AgeRating>;

export function computeAgeRating(answers: ContentAnswers): AgeRating {
  if (answers.blood || answers.horror || answers.romance) return '13+';
  if (answers.violence) return '9+';
  return 'all';
}
