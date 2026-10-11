import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HUMAN_FACE_LANDMARKS } from '@genvr/core-library';
import { decodeHuman } from '../../../src/character/human/format.js';
import { generateHuman } from '../../../src/character/human/generate.js';

/** The face shapes played on the GPU (CHAR-02): blink moves only the lids, mouth-open only the lower face. */
const bytes = readFileSync(fileURLToPath(new URL('../../../../../apps/web/public/human/human-base.bin', import.meta.url)));
const body = generateHuman(
  decodeHuman(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
  'anime',
  'boy',
  HUMAN_FACE_LANDMARKS,
)!;
const moved = (deltas: Float32Array) => {
  const out: number[] = [];
  for (let v = 0; v < deltas.length / 3; v += 1)
    if (Math.hypot(deltas[v * 3]!, deltas[v * 3 + 1]!, deltas[v * 3 + 2]!) > 1e-4) out.push(v);
  return out;
};

describe('face shapes', () => {
  it('blink moves only vertices around the eyes and closes the upper lid downward', () => {
    const eye = body.face.leftEye!;
    const list = moved(body.blink);
    expect(list.length).toBeGreaterThan(50);
    for (const v of list) {
      const dy = body.positions[v * 3 + 1]! - eye[1];
      expect(Math.abs(dy), `vertex ${v}`).toBeLessThan(0.06);
    }
    const upper = list.filter((v) => body.positions[v * 3 + 1]! > eye[1] + 0.005 && body.region[v] === 3);
    expect(upper.length).toBeGreaterThan(5);
    for (const v of upper) expect(body.blink[v * 3 + 1]!).toBeLessThan(0);
  });

  it('mouth-open moves only the lower face and swings the chin down', () => {
    const jaw = body.face.jaw!;
    const list = moved(body.mouthOpen);
    expect(list.length).toBeGreaterThan(30);
    for (const v of list) expect(body.positions[v * 3 + 1]!, `vertex ${v}`).toBeGreaterThan(jaw[1] - 0.06);
    const chin = list.filter((v) => body.positions[v * 3 + 1]! < jaw[1] + 0.02 && body.positions[v * 3 + 2]! > jaw[2] - 0.005);
    expect(chin.length).toBeGreaterThan(3);
    for (const v of chin) expect(body.mouthOpen[v * 3 + 1]!).toBeLessThan(0);
  });
});
