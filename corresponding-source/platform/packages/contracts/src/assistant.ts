import { z } from 'zod';
import { CommandPayload } from './commands.js';

/**
 * Correction logging (task P4-08): what a builder did with the assistant's work right after a
 * reply. `moved`, `deleted`, and `changed` carry the builder's command; `undone` means they took
 * the whole reply back; `kept` means they left it as it was.
 */
export const CorrectionKind = z.enum(['moved', 'deleted', 'changed', 'undone', 'kept']);
export type CorrectionKind = z.infer<typeof CorrectionKind>;

export const CorrectionReport = z.object({
  /** What the builder asked for. */
  prompt: z.string().trim().min(1).max(2000),
  /** The commands the assistant applied for it. */
  aiCommands: z.array(CommandPayload).min(1).max(200),
  corrections: z
    .array(
      z.object({
        kind: CorrectionKind,
        command: CommandPayload.nullable(),
        /** Milliseconds after the reply ended. */
        afterMs: z.number().int().min(0).max(3_600_000),
      }),
    )
    .min(1)
    .max(50),
});
export type CorrectionReport = z.infer<typeof CorrectionReport>;
