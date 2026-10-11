import { z } from 'zod';
/**
 * The engine's mouth shapes (lip sync, P2-44, spec 2026-10-03): the nine shapes animators use, as Rhubarb Lip Sync
 * names them. A: closed for P, B, M; B: slightly open (most consonants); C: open (E as in "men"); D: wide open (A as
 * in "father"); E: rounded (O); F: puckered (OO, W); G: teeth on the lip (F, V); H: tongue up (L); X: at rest (silence).
 * Every body shows them its own way: pictures on block and 2D bodies, blend shapes on mesh bodies.
 */
export declare const MOUTH_SHAPES: readonly ["A", "B", "C", "D", "E", "F", "G", "H", "X"];
export declare const MouthShape: z.ZodEnum<{
    A: "A";
    B: "B";
    C: "C";
    D: "D";
    E: "E";
    F: "F";
    G: "G";
    H: "H";
    X: "X";
}>;
export type MouthShape = z.infer<typeof MouthShape>;
/** From `at` seconds into the line, the mouth shows `shape` (until the next cue). */
export declare const MouthCue: z.ZodObject<{
    at: z.ZodNumber;
    shape: z.ZodEnum<{
        A: "A";
        B: "B";
        C: "C";
        D: "D";
        E: "E";
        F: "F";
        G: "G";
        H: "H";
        X: "X";
    }>;
}, z.core.$strip>;
export type MouthCue = z.infer<typeof MouthCue>;
/** The longest voice line (seconds); longer speech is split into lines. */
export declare const MAX_VOICE_SECONDS = 120;
/**
 * A voice line of an audio item (lip sync): its sound file in the package, its length, and the mouth timings worked
 * out once when it was uploaded (empty until then: the mouth follows the sound's loudness instead).
 */
export declare const VoiceLine: z.ZodObject<{
    sound: z.ZodString;
    duration: z.ZodNumber;
    cues: z.ZodArray<z.ZodObject<{
        at: z.ZodNumber;
        shape: z.ZodEnum<{
            A: "A";
            B: "B";
            C: "C";
            D: "D";
            E: "E";
            F: "F";
            G: "G";
            H: "H";
            X: "X";
        }>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type VoiceLine = z.infer<typeof VoiceLine>;
/** The mouth shape `t` seconds into a line: the last cue at or before `t`; at rest before the first and after the end. */
export declare function mouthAt(line: Pick<VoiceLine, 'cues' | 'duration'>, t: number): MouthShape;
