import { describe, expect, it } from 'vitest';
import { FilmSession, LOOKS, blend, brightnessContrast, effectParams, emptyFilm, fromSeconds, grade, luma, tint, vignette, type MediaClip } from '../src/index.js';

const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 6));

describe('effect references', () => {
  it('brightness and contrast pivot on middle grey and clamp', () => {
    close(brightnessContrast([0.5, 0.25, 1], 0, 2), [0.5, 0, 1]);
    close(brightnessContrast([0.2, 0.2, 0.2], 0.1, 1), [0.3, 0.3, 0.3]);
  });
  it('tint moves towards the colour at the pixel brightness', () => {
    close(tint([0.5, 0.5, 0.5], '#ff0000', 1), [0.5, 0, 0]);
    close(tint([0.2, 0.4, 0.6], '#ffffff', 0), [0.2, 0.4, 0.6]);
  });
  it('vignette leaves the centre and darkens the corners', () => {
    close(vignette([1, 1, 1], [0.5, 0.5], 1, 0.5), [1, 1, 1]);
    close(vignette([1, 1, 1], [0, 0], 1, 0.5), [0, 0, 0]);
    close(vignette([1, 1, 1], [0, 0], 0.4, 0.5), [0.6, 0.6, 0.6]);
  });
  it('blend modes with coverage', () => {
    close(blend('normal', [0.2, 0.2, 0.2], [1, 0, 0], 0.5), [0.6, 0.1, 0.1]);
    close(blend('add', [0.2, 0.2, 0.2], [0.5, 0.5, 0.5], 1), [0.7, 0.7, 0.7]);
    close(blend('multiply', [0.5, 0.5, 0.5], [0.5, 1, 0], 1), [0.25, 0.5, 0]);
    close(blend('screen', [0.5, 0.5, 0.5], [0.5, 0, 1], 1), [0.75, 0.5, 1]);
    close(blend('multiply', [0.5, 0.5, 0.5], [0, 0, 0], 0), [0.5, 0.5, 0.5]);
  });
  it('fills defaults and refuses bad settings with reasons', () => {
    expect(effectParams('tint')).toEqual({ color: '#ff9a3c', amount: 0.5 });
    expect(() => effectParams('glow')).toThrow('Unknown effect glow');
    expect(() => effectParams('blur', { radius: 99 })).toThrow('between 0 and 40');
    expect(() => effectParams('tint', { color: 'red' })).toThrow('colour like');
    expect(() => effectParams('blur', { size: 1 })).toThrow('no setting "size"');
  });
});

describe('effect commands', () => {
  const film = () => {
    let n = 0;
    const f = new FilmSession(emptyFilm(), () => `id${++n}`);
    f.run('media.add', { media: { id: 'a', kind: 'video', asset: 'x', name: 'A', duration: fromSeconds(4), camera: null, cues: [] } });
    return f;
  };
  const clip = (f: FilmSession) => f.project.tracks.find((t) => t.id === 'V1')!.clips[0] as MediaClip;
  it('transform, blend and clip effects, each one undo step', () => {
    const f = film();
    expect(f.run('clip.transform', { clip: 'id1', scale: 0.5, x: 0.5 })).toMatchObject({ ok: true });
    expect(clip(f).transform).toEqual({ x: 0.5, y: 0, scale: 0.5, rotation: 0, opacity: 1 });
    expect(f.run('clip.blend', { clip: 'id1', mode: 'screen' })).toMatchObject({ ok: true });
    expect(f.run('effect.add', { clip: 'id1', effect: 'blur', params: { radius: 3 } })).toEqual({ ok: true, result: 'id2' });
    expect(f.history.undoLabel).toBe('Add blur');
    expect(f.run('effect.set', { clip: 'id1', effect: 'id2', params: { radius: 9 }, enabled: false })).toMatchObject({ ok: true });
    expect(clip(f).effects).toEqual([{ id: 'id2', effect: 'blur', params: { radius: 9 }, enabled: false }]);
    expect(f.run('effect.set', { clip: 'id1', effect: 'id2', params: { radius: 90 } })).toMatchObject({ ok: false, reason: expect.stringContaining('between 0 and 40') });
    expect(f.run('effect.remove', { clip: 'id1', effect: 'id2' })).toMatchObject({ ok: true });
    expect(clip(f).effects).toEqual([]);
    expect(f.run('effect.add', { clip: 'id1', effect: 'glow' })).toMatchObject({ ok: false });
  });
  it('adjustment layers sit on an effect track at the top', () => {
    const f = film();
    expect(f.run('adjustment.add', { effect: 'vignette', start: 1, duration: 2 })).toMatchObject({ ok: true });
    expect(f.project.tracks.map((t) => t.name)).toEqual(['E1', 'V1', 'A1', 'T1']);
    const adjustment = f.project.tracks[0]!.clips[0]!;
    expect(adjustment).toMatchObject({ type: 'effect', effect: 'vignette', params: { amount: 0.5, size: 0.6 }, start: fromSeconds(1) });
    expect(f.run('effect.set', { clip: adjustment.id, params: { amount: 0.9 } })).toMatchObject({ ok: true });
    expect(f.project.tracks[0]!.clips[0]).toMatchObject({ params: { amount: 0.9, size: 0.6 } });
    expect(f.run('clip.transform', { clip: adjustment.id, scale: 2 })).toMatchObject({ ok: false, reason: expect.stringContaining('Only recordings') });
  });
  it('split halves do not share effects or transform', () => {
    const f = film();
    f.run('effect.add', { clip: 'id1', effect: 'tint' });
    f.run('clip.transform', { clip: 'id1', scale: 0.5 });
    const right = (f.run('clip.split', { at: 2 }) as { result: string[] }).result[0]!;
    const effectId = clip(f).effects![0]!.id;
    expect(f.run('effect.set', { clip: right, effect: effectId, params: { amount: 0.9 } })).toMatchObject({ ok: true });
    expect(f.run('clip.transform', { clip: right, scale: 2 })).toMatchObject({ ok: true });
    expect(clip(f).effects![0]!.params.amount).toBe(0.5);
    expect(clip(f).transform!.scale).toBe(0.5);
  });
  it('colour grade: neutral settings change nothing; each control moves the picture the right way', () => {
    const c: [number, number, number] = [0.4, 0.3, 0.2];
    close(grade(c, [0.5, 0.5], {}), c);
    expect(luma(grade(c, [0.5, 0.5], { exposure: 1 }))).toBeCloseTo(luma(c) * 2, 6);
    const warm = grade(c, [0.5, 0.5], { temperature: 1 });
    expect(warm[0]).toBeGreaterThan(c[0]); expect(warm[2]).toBeLessThan(c[2]);
    const grey = grade(c, [0.5, 0.5], { saturation: 0 });
    expect(grey[0]).toBeCloseTo(grey[2], 9);
    expect(grade([0.9, 0.9, 0.9], [0.5, 0.5], { highlights: -1 })[0]).toBeLessThan(0.9);
    expect(grade([0.1, 0.1, 0.1], [0.5, 0.5], { shadows: 1 })[0]).toBeGreaterThan(0.1);
    expect(grade([1, 1, 1], [0, 0], { vignette: 1 })[0]).toBeLessThan(0.2);
  });
  it('looks: apply a built-in look, save it under a name, apply the saved one elsewhere', () => {
    const f = film();
    f.run('media.add', { media: { id: 'b', kind: 'video', asset: 'y', name: 'B', duration: fromSeconds(4), camera: null, cues: [] } });
    expect(f.run('look.apply', { clip: 'id1', look: 'cool_night' })).toMatchObject({ ok: true });
    expect(clip(f).effects![0]).toMatchObject({ effect: 'colour', params: { temperature: -0.6, exposure: -0.4, contrast: 1 } });
    expect(f.history.undoLabel).toBe('Look: Cool night');
    f.run('effect.set', { clip: 'id1', effect: clip(f).effects![0]!.id, params: { saturation: 0.5 } });
    expect(f.run('look.save', { clip: 'id1', name: 'Our night' })).toMatchObject({ ok: true });
    expect(f.run('look.apply', { clip: 'id2', look: 'Our night' })).toMatchObject({ ok: true });
    const other = f.project.tracks[0]!.clips[1] as MediaClip;
    expect(other.effects![0]!.params).toMatchObject({ saturation: 0.5, temperature: -0.6 });
    expect(f.run('look.save', { clip: 'id1', name: 'punchy' })).toMatchObject({ ok: false, reason: expect.stringContaining('built-in') });
    expect(f.run('look.apply', { clip: 'id1', look: 'sepia' })).toMatchObject({ ok: false, reason: expect.stringContaining('Unknown look') });
    expect(Object.keys(LOOKS)).toHaveLength(5);
  });
});
