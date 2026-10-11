import { describe, expect, it } from 'vitest';
import { FilmSession, duckGain, emptyFilm, fadeGain, findBeats, fitMusic, fromSeconds, gainFor, loudness, type MediaClip } from '../src/index.js';

const rate = 48000;
const sine = (seconds: number, amplitude: number, freq = 997) => Float32Array.from({ length: seconds * rate }, (_, i) => amplitude * Math.sin((2 * Math.PI * freq * i) / rate));

describe('loudness', () => {
  it('a 997 Hz sine at -20 dBFS peak measures about -23 LUFS (mono), and gain follows dB', () => {
    const l = loudness([sine(3, 0.1)], rate);
    expect(l).toBeGreaterThan(-23.6); expect(l).toBeLessThan(-22.4);
    expect(loudness([sine(3, 0.2)], rate) - l).toBeCloseTo(6.02, 1);
    expect(loudness([new Float32Array(rate * 2)], rate)).toBe(-Infinity);
    expect(gainFor(-26, -20)).toBeCloseTo(2, 2);
  });
  it('quiet passages are gated out', () => {
    const mixed = new Float32Array(rate * 6); mixed.set(sine(3, 0.1)); mixed.set(sine(3, 0.0001), rate * 3);
    expect(loudness([mixed], rate)).toBeCloseTo(loudness([sine(3, 0.1)], rate), 0);
  });
});

describe('beats and fitting music', () => {
  const clicks = (bpm: number, seconds: number) => {
    const out = new Float32Array(rate * seconds), step = (60 / bpm) * rate;
    for (let t = 0.25 * rate; t < out.length; t += step) for (let i = 0; i < 400; i++) out[Math.round(t) + i] = 0.8 * Math.exp(-i / 80);
    return out;
  };
  it('finds the tempo of a click track and its beats', () => {
    const { bpm, beats } = findBeats(clicks(120, 12), rate);
    expect(bpm).toBeGreaterThan(118); expect(bpm).toBeLessThan(122);
    expect(beats[0]).toBeCloseTo(0.25, 1);
  });
  it('cuts music to a target length on beats', () => {
    const beats = Array.from({ length: 60 }, (_, i) => i * 0.5);
    const fit = fitMusic(beats, 0, 30, 12)!;
    const kept = fit.head[1] - fit.head[0] + fit.tail[1] - fit.tail[0];
    expect(Math.abs(kept - 12)).toBeLessThan(0.51);
    expect(beats).toContain(fit.head[1]); expect(beats).toContain(fit.tail[0]);
    expect(fitMusic(beats, 0, 10, 12)).toBeNull();
  });
});

describe('fades and ducking', () => {
  it('fade in and out ramps', () => {
    expect(fadeGain(0, 10, 1, 2)).toBe(0); expect(fadeGain(0.5, 10, 1, 2)).toBe(0.5);
    expect(fadeGain(5, 10, 1, 2)).toBe(1); expect(fadeGain(9, 10, 1, 2)).toBe(0.5);
  });
  it('music goes down under dialogue with ramps', () => {
    const low = 10 ** (-10 / 20);
    expect(duckGain(0, [[2, 4]], 10, 0.3)).toBe(1);
    expect(duckGain(3, [[2, 4]], 10, 0.3)).toBeCloseTo(low, 9);
    expect(duckGain(1.85, [[2, 4]], 10, 0.3)).toBeCloseTo(1 - (1 - low) * 0.5, 9);
  });
  it('commands: fades, sound type and ducking settings', () => {
    let n = 0;
    const f = new FilmSession(emptyFilm(), () => `id${++n}`);
    f.run('media.add', { media: { id: 'm', kind: 'audio', asset: 'x', name: 'Song', duration: fromSeconds(30), camera: null, cues: [] }, place: 'none' });
    f.run('clip.place', { media: 'm', start: 0 });
    const id = f.project.tracks.find((t) => t.kind === 'sound')!.clips[0]!.id;
    expect(f.run('clip.fade', { clip: id, in: 1, out: 2 })).toMatchObject({ ok: true });
    expect(f.run('clip.soundType', { clip: id, type: 'music' })).toMatchObject({ ok: true });
    expect(f.project.tracks.find((t) => t.kind === 'sound')!.clips[0]).toMatchObject({ fade: { in: fromSeconds(1), out: fromSeconds(2) }, soundType: 'music' } as Partial<MediaClip>);
    expect(f.run('clip.fade', { clip: id, in: 20, out: 20 })).toMatchObject({ ok: false, reason: 'The fades are longer than the clip.' });
    expect(f.run('sound.duck', { amount: 14 })).toMatchObject({ ok: true });
    expect(f.project.ducking).toEqual({ on: true, amount: 14, fade: 0.3 });
  });
});
