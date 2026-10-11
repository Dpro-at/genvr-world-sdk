import { describe, expect, it } from 'vitest';
import {
  FilmSession, emptyFilm, evaluatePoint, evaluateScalar, fromSeconds, pathPoints, presetSides, resolveAt, velocity, type Key, type MediaClip,
} from '../src/index.js';

const s = fromSeconds;
const key = (id: string, at: number, value: Key['value'], preset: Parameters<typeof presetSides>[0] = 'linear'): Key =>
  ({ id, at: s(at), value, ...presetSides(preset) });

describe('scalar keys', () => {
  it('linear, hold and outside the keys', () => {
    const keys = [key('a', 0, 0), key('b', 2, 10)];
    expect(evaluateScalar(keys, s(1))).toBeCloseTo(5, 9);
    expect(evaluateScalar(keys, s(-1))).toBe(0);
    expect(evaluateScalar(keys, s(3))).toBe(10);
    const hold = [key('a', 0, 0, 'hold'), key('b', 2, 10)];
    expect(evaluateScalar(hold, s(1.999))).toBe(0);
    expect(evaluateScalar(hold, s(2))).toBe(10);
  });
  it('Easy Ease starts and ends at zero speed, passes the middle at half, and hits the keys exactly', () => {
    const keys = [key('a', 0, 0, 'easy'), key('b', 2, 10, 'easy')];
    expect(evaluateScalar(keys, s(0))).toBe(0);
    expect(evaluateScalar(keys, s(2))).toBe(10);
    expect(evaluateScalar(keys, s(1))).toBeCloseTo(5, 6);
    expect(Math.abs(velocity(keys, s(0.001)))).toBeLessThan(0.2);
    expect(Math.abs(velocity(keys, s(1.999)))).toBeLessThan(0.2);
    expect(velocity(keys, s(1))).toBeGreaterThan(5);
  });
  it('speed + influence: a fast start overshoots the straight line early', () => {
    const keys: Key[] = [{ id: 'a', at: 0, value: 0, in: { interp: 'linear' }, out: { interp: 'bezier', speed: 20, influence: 0.5 } },
      { id: 'b', at: s(2), value: 10, in: { interp: 'bezier', speed: 0, influence: 0.5 }, out: { interp: 'linear' } }];
    expect(evaluateScalar(keys, s(0.5))).toBeGreaterThan(2.5);
    expect(evaluateScalar(keys, s(2))).toBe(10);
  });
});

describe('position keys', () => {
  it('move along a straight path at constant speed when linear', () => {
    const keys = [key('a', 0, [0, 0]), key('b', 2, [1, 0])];
    expect(evaluatePoint(keys, s(0.5))[0]).toBeCloseTo(0.25, 3);
    expect(evaluatePoint(keys, s(1.5))[0]).toBeCloseTo(0.75, 3);
  });
  it('curve through three auto keys and keep an even speed along the curve', () => {
    const keys = [key('a', 0, [0, 0]), key('b', 1, [0.5, 0.5]), key('c', 2, [1, 0])].map((k) => ({ ...k, in: { interp: 'auto' as const }, out: { interp: 'auto' as const } }));
    const path = pathPoints(keys);
    expect(path[0]).toEqual([0, 0]); expect(path.at(-1)).toEqual([1, 0]);
    expect(evaluatePoint(keys, s(1))[0]).toBeCloseTo(0.5, 6);
    const speeds = [0.2, 0.5, 0.8].map((t) => velocity(keys, s(t)));
    expect(Math.max(...speeds) / Math.min(...speeds)).toBeLessThan(1.05);
  });
});

describe('key commands', () => {
  const film = () => {
    let n = 0;
    const f = new FilmSession(emptyFilm(), () => `id${++n}`);
    f.run('media.add', { media: { id: 'a', kind: 'video', asset: 'x', name: 'A', duration: s(6), camera: null, cues: [] } });
    return f;
  };
  const clip = (f: FilmSession) => f.project.tracks.find((t) => t.id === 'V1')!.clips[0] as MediaClip;
  it('stopwatch, keys, eases and stop animating', () => {
    const f = film();
    expect(f.run('key.add', { clip: 'id1', property: 'opacity', at: 0 })).toMatchObject({ ok: true });
    expect(f.run('property.set', { clip: 'id1', property: 'opacity', value: 0, at: 2 })).toMatchObject({ ok: true });
    expect(clip(f).keys!.opacity!.map((k) => [k.at, k.value])).toEqual([[0, 1], [s(2), 0]]);
    expect(resolveAt(clip(f), s(1)).transform!.opacity).toBeCloseTo(0.5, 9);
    expect(f.run('key.ease', { clip: 'id1', property: 'opacity', preset: 'easy' })).toMatchObject({ ok: true });
    expect(f.history.undoLabel).toBe('Easy ease');
    expect(resolveAt(clip(f), s(0.4)).transform!.opacity).toBeGreaterThan(0.85);
    expect(f.run('property.clear', { clip: 'id1', property: 'opacity', at: 2 })).toMatchObject({ ok: true });
    expect(clip(f).keys?.opacity).toBeUndefined();
    expect(clip(f).transform!.opacity).toBe(0);
  });
  it('keys follow the picture: moving a clip moves them, trimming the start keeps them on the picture', () => {
    const f = film();
    f.run('key.add', { clip: 'id1', property: 'scale', at: 3, value: 2 });
    f.run('key.add', { clip: 'id1', property: 'scale', at: 1, value: 1 });
    f.run('clip.move', { clip: 'id1', start: 10 });
    expect(resolveAt(clip(f), s(13)).transform!.scale).toBe(2);
    f.run('clip.trim', { clip: 'id1', edge: 'start', by: 1 });
    expect(resolveAt(clip(f), s(13)).transform!.scale).toBe(2);
  });
  it('refuses bad keys with reasons', () => {
    const f = film();
    expect(f.run('key.add', { clip: 'id1', property: 'colour', at: 1 })).toMatchObject({ ok: false, reason: 'colour cannot be animated on this clip.' });
    expect(f.run('key.add', { clip: 'id1', property: 'opacity', at: 30 })).toMatchObject({ ok: false, reason: 'Put the playhead over the clip to add a key.' });
    expect(f.run('key.add', { clip: 'id1', property: 'opacity', at: 1, value: 5 })).toMatchObject({ ok: false, reason: expect.stringContaining('between 0 and 1') });
    expect(f.run('key.add', { clip: 'id1', property: 'position', at: 1, value: 0.5 })).toMatchObject({ ok: false, reason: expect.stringContaining('[x, y]') });
    expect(f.run('key.add', { clip: 'id1', property: 'position', at: 1, value: [0.5, -0.5] })).toMatchObject({ ok: true });
  });
  it('effect settings and adjustment layers animate too', () => {
    const f = film();
    const effect = (f.run('effect.add', { clip: 'id1', effect: 'blur' }) as { result: string }).result;
    f.run('key.add', { clip: 'id1', property: `effects.${effect}.radius`, at: 0, value: 20 });
    f.run('key.add', { clip: 'id1', property: `effects.${effect}.radius`, at: 2, value: 0 });
    expect(resolveAt(clip(f), s(1)).effects![0]!.params.radius).toBeCloseTo(10, 9);
    const adjustment = (f.run('adjustment.add', { effect: 'vignette', start: 0, duration: 4 }) as { result: string }).result;
    expect(f.run('key.add', { clip: adjustment, property: 'params.amount', at: 1, value: 0 })).toMatchObject({ ok: true });
  });
});
