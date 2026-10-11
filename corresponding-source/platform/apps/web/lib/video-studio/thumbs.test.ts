import { describe, expect, it } from 'vitest';
import { displayGain, frameIndex, frameStep, peaksOf, sourcePeak, waveformColumns } from './thumbs';

describe('timeline pictures and waveforms', () => {
  it('peaks keep the loudest sample of all channels per slice', () => {
    const left = new Float32Array([0, 0.2, -0.9, 0.1]), right = new Float32Array([0.5, 0, 0, 0.3]);
    expect(Array.from(peaksOf([left, right], 4, 2)).map((v) => +v.toFixed(2))).toEqual([0.5, 0.9]);
    expect(peaksOf([new Float32Array([2])], 1, 1)[0]).toBe(1);
  });
  it('waveform columns use the loudest peak per pixel on a -48..0 dB scale', () => {
    const peaks = new Float32Array([1, 0.5, 0.0039811, 0]);
    expect(Array.from(waveformColumns(peaks, 0, 4, 4, () => 1, true, 1)).map((v) => +v.toFixed(3))).toEqual([1, 0.875, 0, 0]);
    const linear = waveformColumns(peaks, 0, 4, 2, () => 1, false, 1); expect(linear[0]).toBe(1); expect(linear[1]).toBeCloseTo(0.00398, 4);
    expect(waveformColumns(peaks, 0, 4, 4, () => 0, true, 1)[0]).toBe(0);
  });
  it('display gain normalises quiet sound by at most +12 dB', () => {
    expect(displayGain(0.5, 1)).toBe(2);
    expect(displayGain(0.001, 1)).toBeCloseTo(3.981);
    expect(sourcePeak(new Float32Array([0.1, 0.7, 0.2]))).toBeCloseTo(0.7);
  });
  it('strip frames are at most 60 and follow the recording time', () => {
    expect(frameStep(10)).toBe(0.5);
    expect(frameStep(120)).toBe(2);
    expect(frameIndex(1.4, 0.5, 20)).toBe(3);
    expect(frameIndex(99, 0.5, 20)).toBe(19);
  });
});

import { newTrack } from '@genvr/film';
import { rowHeight, rulerSteps, trackOrder, ROWS_DEFAULT } from './timeline-view';

describe('timeline layout', () => {
  it('orders captions, effects, pictures (highest on top) above, sound below', () => {
    const tracks = [newTrack('picture', 1), newTrack('sound', 1), newTrack('picture', 2), newTrack('caption', 1), newTrack('effect', 1), newTrack('sound', 2)];
    const { above, below } = trackOrder(tracks);
    expect(above.map((t) => t.kind + t.name)).toEqual(['caption' + tracks[3]!.name, 'effect' + tracks[4]!.name, 'picture' + tracks[2]!.name, 'picture' + tracks[0]!.name]);
    expect(below.map((t) => t.name)).toEqual([tracks[1]!.name, tracks[5]!.name]);
  });
  it('draws only the shown subtitle language and its voice (FILM-12c)', () => {
    const lang = (t: ReturnType<typeof newTrack>, code: string, hidden: boolean) => ({ ...t, lang: code, hidden, muted: hidden });
    const tracks = [newTrack('picture', 1), newTrack('caption', 1), lang(newTrack('caption', 2), 'en', true), lang(newTrack('caption', 3), 'ar', false),
      lang(newTrack('sound', 2), 'en', true), lang(newTrack('sound', 3), 'ar', false), newTrack('sound', 1)];
    const { above, below } = trackOrder(tracks);
    expect(above.map((t) => t.lang ?? t.kind)).toEqual(['ar', 'caption', 'picture']);
    expect(below.map((t) => t.lang ?? t.kind)).toEqual(['ar', 'sound']);
    const none = trackOrder(tracks.map((t) => t.lang ? { ...t, hidden: true } : t));
    expect(none.above.map((t) => t.lang ?? t.kind)).toEqual(['caption', 'picture']);
  });
  it('ruler steps grow with zoom out', () => {
    expect(rulerSteps(48, 30).label).toBe(5); expect(rulerSteps(48, 30).tick).toBeCloseTo(1 / 3);
    expect(rulerSteps(320, 30).tick).toBeCloseTo(2 / 30);
    expect(rulerSteps(16, 30).label).toBe(10);
  });
  it('row heights are clamped', () => {
    expect(rowHeight('picture', { ...ROWS_DEFAULT, picture: 999 })).toBe(220);
    expect(rowHeight('caption', ROWS_DEFAULT)).toBe(28);
  });
});
