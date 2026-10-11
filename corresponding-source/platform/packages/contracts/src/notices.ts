import { z } from 'zod';

/** Kinds of illegal content in a notice (task P1-14, EU Digital Services Act article 16). */
export const NoticeCategory = z.enum([
  'child-safety',
  'terrorism',
  'hate-or-violence',
  'harassment',
  'privacy',
  'intellectual-property',
  'scam-or-fraud',
  'other-illegal',
]);
export type NoticeCategory = z.infer<typeof NoticeCategory>;

/**
 * A notice of illegal content. Name and email are required, except for child-safety notices,
 * which the law allows without them.
 */
export const ContentNotice = z
  .object({
    category: NoticeCategory,
    location: z.string().trim().min(3).max(500),
    explanation: z.string().trim().min(20).max(4000),
    reporterName: z.string().trim().max(100).optional(),
    reporterEmail: z.email().max(200).optional(),
    /** "I believe in good faith that this information is accurate and complete." */
    goodFaith: z.literal(true),
  })
  .superRefine((notice, ctx) => {
    if (notice.category === 'child-safety') return;
    if (!notice.reporterName)
      ctx.addIssue({ code: 'custom', path: ['reporterName'], message: 'Your name is required.' });
    if (!notice.reporterEmail)
      ctx.addIssue({ code: 'custom', path: ['reporterEmail'], message: 'Your email is required.' });
  });
export type ContentNotice = z.infer<typeof ContentNotice>;
