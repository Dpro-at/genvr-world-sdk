import { type MouthShape, type VoiceLine } from '../contracts/index.js';
/** The part of an AnalyserNode the mouth reads (tests pass a stand-in). */
export interface LevelSource {
    fftSize: number;
    getFloatTimeDomainData(out: Float32Array): void;
}
/** Loudness (RMS of the samples, 0 to 1) to a mouth shape: rest, a little open, open, wide open. */
export declare function loudnessShape(level: number): MouthShape;
/**
 * One speaker's mouth (lip sync, P2-44, plan Task 3): a voice line with mouth cues plays them from the moment its
 * sound started; a line without cues (not worked out yet, or live speech) follows the sound's loudness through an
 * analyser, each shape held a little. At rest when nothing is said.
 */
export declare class SpeechMouth {
    #private;
    /** Starts a line at `startedAt` (seconds, the clock `shapeAt` is given); `source` reads its sound when it has no cues. */
    speak(line: Pick<VoiceLine, 'duration' | 'cues'>, startedAt: number, source?: LevelSource): void;
    stop(): void;
    speaking(now: number): boolean;
    shapeAt(now: number): MouthShape;
}
