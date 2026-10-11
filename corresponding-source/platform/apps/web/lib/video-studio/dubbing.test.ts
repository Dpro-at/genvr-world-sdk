import { describe, expect, it } from 'vitest';
import { layLines, wav } from './dubbing';

describe('dubbing (FILM-12b)', () => {
  it('lays lines at their times and never lets two talk at once', () => {
    const one = new Float32Array(10).fill(0.5), two = new Float32Array(4).fill(-0.5);
    const out = layLines([{ start: 0.2, samples: one }, { start: 0.5, samples: two }], 20); // 0.2 s = 4, 0.5 s = 10 but one ends at 14
    expect(out.length).toBe(18);
    expect([out[3], out[4], out[13], out[14], out[17]]).toEqual([0, 0.5, 0.5, -0.5, -0.5]);
  });
  it('writes a 16-bit mono WAV', async () => {
    const blob = wav(new Float32Array([0, 1, -1]), 22050);
    const bytes = new DataView(await blob.arrayBuffer());
    expect(blob.type).toBe('audio/wav');
    expect(bytes.byteLength).toBe(50);
    expect(bytes.getUint32(24, true)).toBe(22050);
    expect([bytes.getInt16(44, true), bytes.getInt16(46, true), bytes.getInt16(48, true)]).toEqual([0, 32767, -32767]);
  });
});
