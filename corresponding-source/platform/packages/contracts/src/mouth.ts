import { z } from 'zod';

/**
 * The engine's mouth shapes (lip sync, P2-44, spec 2026-10-03): the nine shapes animators use, as Rhubarb Lip Sync
 * names them. A: closed for P, B, M; B: slightly open (most consonants); C: open (E as in "men"); D: wide open (A as
 * in "father"); E: rounded (O); F: puckered (OO, W); G: teeth on the lip (F, V); H: tongue up (L); X: at rest (silence).
 * Every body shows them its own way: pictures on block and 2D bodies, blend shapes on mesh bodies.
 */
export const MOUTH_SHAPES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X'] as const;
export const MouthShape = z.enum(MOUTH_SHAPES);
export type MouthShape = z.infer<typeof MouthShape>;

/** From `at` seconds into the line, the mouth shows `shape` (until the next cue). */
export const MouthCue = z.object({ at: z.number().min(0), shape: MouthShape });
export type MouthCue = z.infer<typeof MouthCue>;

/** The longest voice line (seconds); longer speech is split into lines. */
export const MAX_VOICE_SECONDS = 120;

/**
 * A voice line of an audio item (lip sync): its sound file in the package, its length, and the mouth timings worked
 * out once when it was uploaded (empty until then: the mouth follows the sound's loudness instead).
 */
export const VoiceLine = z
  .object({
    sound: z.string().min(1).max(200),
    duration: z.number().positive().max(MAX_VOICE_SECONDS),
    cues: z.array(MouthCue).max(MAX_VOICE_SECONDS * 30),
  })
  .refine(
    (line) =>
      line.cues.every((cue, i) => cue.at <= line.duration && (i === 0 || line.cues[i - 1]!.at <= cue.at)),
    {
      message: 'mouth cues must be in order and inside the line',
    },
  );
export type VoiceLine = z.infer<typeof VoiceLine>;

/** The mouth shape `t` seconds into a line: the last cue at or before `t`; at rest before the first and after the end. */
export function mouthAt(line: Pick<VoiceLine, 'cues' | 'duration'>, t: number): MouthShape {
  if (t < 0 || t > line.duration) return 'X';
  let shape: MouthShape = 'X';
  // Cues are sorted: a binary search keeps long lines cheap per frame.
  let low = 0;
  let high = line.cues.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (line.cues[mid]!.at <= t) {
      shape = line.cues[mid]!.shape;
      low = mid + 1;
    } else high = mid - 1;
  }
  return shape;
}
