import { mouthAt, type MouthShape, type VoiceLine } from '@genvr/contracts';

/** The part of an AnalyserNode the mouth reads (tests pass a stand-in). */
export interface LevelSource {
  fftSize: number;
  getFloatTimeDomainData(out: Float32Array): void;
}

/** Loudness (RMS of the samples, 0 to 1) to a mouth shape: rest, a little open, open, wide open. */
export function loudnessShape(level: number): MouthShape {
  if (level < 0.02) return 'X';
  if (level < 0.08) return 'B';
  if (level < 0.2) return 'C';
  return 'D';
}

/** A loudness shape stays at least this long (seconds), so the mouth does not flutter. */
const HOLD_SECONDS = 0.08;

/**
 * One speaker's mouth (lip sync, P2-44, plan Task 3): a voice line with mouth cues plays them from the moment its
 * sound started; a line without cues (not worked out yet, or live speech) follows the sound's loudness through an
 * analyser, each shape held a little. At rest when nothing is said.
 */
export class SpeechMouth {
  #line: Pick<VoiceLine, 'duration' | 'cues'> | null = null;
  #startedAt = 0;
  #source: LevelSource | null = null;
  #samples: Float32Array<ArrayBuffer> | null = null;
  #held: MouthShape = 'X';
  #heldAt = -Infinity;

  /** Starts a line at `startedAt` (seconds, the clock `shapeAt` is given); `source` reads its sound when it has no cues. */
  speak(line: Pick<VoiceLine, 'duration' | 'cues'>, startedAt: number, source?: LevelSource): void {
    this.#line = line;
    this.#startedAt = startedAt;
    this.#source = source ?? null;
    this.#samples = source ? new Float32Array(source.fftSize) : null;
    this.#held = 'X';
    this.#heldAt = -Infinity;
  }

  stop(): void {
    this.#line = null;
    this.#source = null;
  }

  speaking(now: number): boolean {
    return this.#line !== null && now - this.#startedAt <= this.#line.duration;
  }

  shapeAt(now: number): MouthShape {
    const line = this.#line;
    if (!line || !this.speaking(now)) return 'X';
    const t = now - this.#startedAt;
    if (line.cues.length > 0 || !this.#source || !this.#samples) return mouthAt(line, t);
    this.#source.getFloatTimeDomainData(this.#samples);
    let sum = 0;
    for (const sample of this.#samples) sum += sample * sample;
    const shape = loudnessShape(Math.sqrt(sum / this.#samples.length));
    if (shape !== this.#held && t - this.#heldAt >= HOLD_SECONDS) {
      this.#held = shape;
      this.#heldAt = t;
    }
    return this.#held;
  }
}
