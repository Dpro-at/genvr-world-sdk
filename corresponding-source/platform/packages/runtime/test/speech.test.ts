import { describe, expect, it } from 'vitest';
import { loudnessShape, SpeechMouth } from '../src/speech.js';

// Lip sync (P2-44, plan Task 3): a line with mouth cues plays them in time with its sound; a line without cues moves
// the mouth from the sound's loudness, holding each shape a little so it does not flutter. The values are examples.

/** A stand-in for an AnalyserNode: the samples it gives are set by the test. */
const analyser = (level: () => number) => ({
  fftSize: 256,
  getFloatTimeDomainData(out: Float32Array) {
    for (let i = 0; i < out.length; i += 1) out[i] = (i % 2 === 0 ? 1 : -1) * level();
  },
});

describe('the mouth from speech', () => {
  it('loudness picks rest, a little open, open, or wide open', () => {
    expect(loudnessShape(0)).toBe('X');
    expect(loudnessShape(0.04)).toBe('B');
    expect(loudnessShape(0.12)).toBe('C');
    expect(loudnessShape(0.4)).toBe('D');
  });

  it('a line with cues follows them from its start, and rests after its end', () => {
    const mouth = new SpeechMouth();
    mouth.speak(
      {
        duration: 1,
        cues: [
          { at: 0, shape: 'B' },
          { at: 0.5, shape: 'E' },
        ],
      },
      10,
    );
    expect(mouth.shapeAt(10.2)).toBe('B');
    expect(mouth.shapeAt(10.6)).toBe('E');
    expect(mouth.shapeAt(11.2)).toBe('X');
    expect(mouth.speaking(11.2)).toBe(false);
  });

  it('a line without cues follows the loudness, holding a shape at least a short while', () => {
    let level = 0.4;
    const mouth = new SpeechMouth();
    mouth.speak(
      { duration: 2, cues: [] },
      0,
      analyser(() => level),
    );
    expect(mouth.shapeAt(0.1)).toBe('D');
    level = 0;
    // Too soon to close: the shape holds.
    expect(mouth.shapeAt(0.12)).toBe('D');
    expect(mouth.shapeAt(0.3)).toBe('X');
    mouth.stop();
    expect(mouth.shapeAt(0.4)).toBe('X');
  });
});
