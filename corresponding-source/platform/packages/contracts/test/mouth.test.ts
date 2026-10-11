import { describe, expect, it } from 'vitest';
import { MOUTH_SHAPES, mouthAt, VoiceLine } from '../src/index.js';

// Lip sync (P2-44, plan Task 1): nine mouth shapes for the whole engine and a voice line's timings. The cues are an
// example written for the test.

const CUES = [
  { at: 0, shape: 'X' },
  { at: 0.12, shape: 'B' },
  { at: 0.3, shape: 'D' },
  { at: 0.55, shape: 'X' },
] as const;

describe('mouth shapes', () => {
  it("are Rhubarb's nine, with X the rest shape", () => {
    expect(MOUTH_SHAPES).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X']);
  });

  it('mouthAt gives the shape of the last cue at or before the time; rest before the first and after the end', () => {
    const line = VoiceLine.parse({ sound: 'audio/hello.ogg', duration: 0.6, cues: CUES });
    expect(mouthAt(line, -1)).toBe('X');
    expect(mouthAt(line, 0.05)).toBe('X');
    expect(mouthAt(line, 0.12)).toBe('B');
    expect(mouthAt(line, 0.29)).toBe('B');
    expect(mouthAt(line, 0.4)).toBe('D');
    expect(mouthAt(line, 0.7)).toBe('X');
  });

  it('a voice line is at most two minutes, with sorted cues inside it', () => {
    expect(VoiceLine.safeParse({ sound: 'audio/a.ogg', duration: 121, cues: [] }).success).toBe(false);
    expect(
      VoiceLine.safeParse({
        sound: 'audio/a.ogg',
        duration: 1,
        cues: [
          { at: 0.5, shape: 'B' },
          { at: 0.2, shape: 'C' },
        ],
      }).success,
    ).toBe(false);
    expect(
      VoiceLine.safeParse({ sound: 'audio/a.ogg', duration: 1, cues: [{ at: 2, shape: 'B' }] }).success,
    ).toBe(false);
    expect(
      VoiceLine.safeParse({ sound: 'audio/a.ogg', duration: 1, cues: [{ at: 0, shape: 'Q' }] }).success,
    ).toBe(false);
  });
});
