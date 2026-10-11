import { describe, expect, it } from 'vitest';
import { FilmSession, emptyFilm, fromSeconds, type Media } from '@genvr/film';
import { captionsAt, layersAt, pictureSegments, playerSlots, soundEvents } from './render';
import { checkTakeLength } from './model';

const media = (id: string, seconds: number): Media => ({ id, kind: 'video', asset: `asset-${id}`, name: id, duration: fromSeconds(seconds), camera: null,
  cues: [{ id: `cue-${id}`, actor: 'self', label: 'Me', action: 'none', start: fromSeconds(1), end: fromSeconds(2), text: `hi ${id}`, volume: 1 }] });

describe('timeline playback plan', () => {
  it('shows the top visible picture track, black in gaps, and dialogue in media time', () => {
    let n = 0;
    const film = new FilmSession(emptyFilm(), () => `c${++n}`);
    film.run('media.add', { media: media('a', 4) });
    film.run('media.add', { media: media('b', 2), place: 'none' });
    film.run('track.add', { kind: 'picture' });
    const top = film.project.tracks[0]!.id;
    expect(film.run('clip.place', { media: 'b', track: top, start: 1, in: 0.5, duration: 1 })).toMatchObject({ ok: true });
    expect(film.run('clip.trim', { clip: 'c1', edge: 'end', by: -1 })).toMatchObject({ ok: true });
    film.run('caption.add', { text: 'Title', start: 0, duration: 1 });
    const segments = pictureSegments(film.project);
    expect(segments.map((s) => [s.start, s.end, s.media?.id ?? 'black'])).toEqual([[0, 1, 'a'], [1, 2, 'b'], [2, 3, 'a']]);
    expect(captionsAt(film.project, segments[0], 0.5)).toEqual(['Title']);
    expect(captionsAt(film.project, segments[1], 1.6)).toEqual(['Me: hi b']); // media time 0.5 + 0.6 = 1.1
    expect(captionsAt(film.project, segments[2], 2.5)).toEqual([]); // media time of a: 2.5, after its cue
    // FILM-12: subtitles replace the typed dialogue; only the shown language is drawn.
    film.run('subtitles.set', { lang: 'en', name: 'English', lines: [{ start: 1, end: 2, text: 'Hi B' }] });
    film.run('subtitles.set', { lang: 'ar', name: 'Arabic', show: false, lines: [{ start: 1, end: 2, text: 'مرحبا' }] });
    expect(captionsAt(film.project, segments[1], 1.6)).toEqual(['Hi B']);
    film.run('subtitles.show', { lang: 'ar' });
    expect(captionsAt(film.project, segments[1], 1.6)).toEqual(['مرحبا']);
    film.run('subtitles.show', { lang: null });
    expect(captionsAt(film.project, segments[1], 1.6)).toEqual([]);
    film.run('track.set', { track: top, hidden: true });
    expect(pictureSegments(film.project).map((s) => s.media?.id)).toEqual(['a']);
    film.run('clip.remove', { clips: ['c1'] });
    expect(pictureSegments(film.project).map((s) => [s.start, s.end, s.media?.id ?? 'black'])).toEqual([[0, 2, 'black']]); // hidden V2 still sets the length
  });
  it('lists layers bottom first with adjustment layers where their track sits', () => {
    let n = 0;
    const film = new FilmSession(emptyFilm(), () => `c${++n}`);
    film.run('media.add', { media: media('a', 4) });
    film.run('media.add', { media: media('b', 2), place: 'none' });
    film.run('track.add', { kind: 'picture' });
    film.run('clip.place', { media: 'b', track: film.project.tracks[0]!.id, start: 1, duration: 1 });
    film.run('adjustment.add', { effect: 'tint', start: 0, duration: 4 });
    expect(film.project.tracks.map((t) => t.name)).toEqual(['E1', 'V2', 'V1', 'A1', 'T1']);
    expect(layersAt(film.project, 1.5).map((l) => [l.kind, l.kind === 'media' ? l.media.id : (l.clip as { effect: string }).effect, l.kind === 'media' ? l.time : undefined])).toEqual([
      ['media', 'a', 1.5], ['media', 'b', 0.5], ['adjust', 'tint', undefined]]);
    expect(layersAt(film.project, 3).map((l) => l.kind)).toEqual(['media', 'adjust']);
    film.run('track.set', { track: film.project.tracks[0]!.id, hidden: true });
    expect(layersAt(film.project, 3).map((l) => l.kind)).toEqual(['media']);
  });
  it('refuses a take far shorter than asked, with the reason', () => {
    expect(() => checkTakeLength(0.23, 3)).toThrow('only 0.2 s of 3.0 s was filmed');
    expect(() => checkTakeLength(2.96, 3)).not.toThrow();
  });
  it('a transition shows both clips around the cut; titles are layers, plain captions stay text', () => {
    let n = 0;
    const film = new FilmSession(emptyFilm(), () => `c${++n}`);
    film.run('media.add', { media: media('a', 6) });
    film.run('media.add', { media: media('b', 6) });
    film.run('clip.trim', { clip: 'c1', edge: 'end', by: -1, ripple: true });
    film.run('clip.trim', { clip: 'c2', edge: 'start', by: 1, ripple: true });
    expect(film.run('transition.add', { clip: 'c2', kind: 'dissolve', duration: 1 })).toMatchObject({ ok: true });
    const mid = layersAt(film.project, 5);
    expect(mid).toHaveLength(1);
    expect(mid[0]).toMatchObject({ kind: 'transition', progress: 0.5, a: { time: 5 }, b: { time: 1 } });
    expect(layersAt(film.project, 4.4)[0]!.kind).toBe('media');
    film.run('title.add', { text: 'Hello', start: 0, duration: 2 });
    film.run('caption.add', { text: 'plain', start: 2, duration: 2 });
    expect(layersAt(film.project, 1).map((l) => l.kind)).toEqual(['media', 'title']);
    expect(captionsAt(film.project, undefined, 1)).toEqual([]);
    expect(captionsAt(film.project, undefined, 2.5)).toEqual(['plain']);
  });
  it('a recording with world sound plays when placed on a sound track', () => {
    let n = 0;
    const film = new FilmSession(emptyFilm(), () => `s${++n}`);
    film.run('media.add', { media: { ...media('w', 3), hasSound: true }, place: 'none' });
    film.run('media.add', { media: media('q', 3), place: 'none' });
    const a1 = film.project.tracks.find((t) => t.kind === 'sound')!.id;
    expect(film.run('clip.place', { media: 'w', track: a1, start: 0 })).toMatchObject({ ok: true });
    expect(film.run('clip.place', { media: 'q', track: a1, start: 3 })).toMatchObject({ ok: true });
    expect(soundEvents(film.project, pictureSegments(film.project)).map((e) => e.asset)).toEqual(['asset-w']);
  });
  it('the parts of a cut-up recording share one player; parts that can show together do not', () => {
    let n = 0;
    const film = new FilmSession(emptyFilm(), () => `p${++n}`);
    film.run('media.add', { media: media('a', 6) });
    for (const at of [1, 2, 3, 4]) expect(film.run('clip.split', { at })).toMatchObject({ ok: true });
    const slots = playerSlots(film.project);
    expect(new Set(slots.values()).size).toBe(1);
    const second = film.run('track.add', { kind: 'picture' });
    expect(second.ok).toBe(true);
    const top = film.project.tracks.find((t) => t.kind === 'picture' && !t.clips.length)!.id;
    expect(film.run('clip.place', { media: 'a', track: top, start: 2, in: 0, duration: 1 })).toMatchObject({ ok: true });
    expect(new Set(playerSlots(film.project).values()).size).toBe(2);
  });
});
