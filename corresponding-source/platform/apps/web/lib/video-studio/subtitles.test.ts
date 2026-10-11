import { describe, expect, it } from 'vitest';
import { FilmSession, emptyFilm } from '@genvr/film';
import { soundingClips } from './subtitles';

describe('subtitles from the voice (FILM-12)', () => {
  it('listens to original voices only, never to the spoken translations', () => {
    let n = 0;
    const f = new FilmSession(emptyFilm(), () => `id${++n}`);
    const audio = (id: string) => ({ id, kind: 'audio', asset: id, name: id, duration: 2 * 254016000000, camera: null, cues: [] });
    expect(f.run('media.add', { media: audio('voice'), place: 'none' }).ok).toBe(true);
    expect(f.run('clip.place', { media: 'voice' }).ok).toBe(true);
    f.run('media.add', { media: audio('dub'), place: 'none' });
    f.run('subtitles.set', { lang: 'de', name: 'Deutsch', lines: [{ start: 0, end: 1, text: 'Hallo' }] });
    f.run('voice.set', { lang: 'de', name: 'Voice de', media: 'dub' });
    expect(f.project.tracks.find((t) => t.lang === 'de' && t.kind === 'sound')!.muted).toBe(false);
    expect(soundingClips(f.project).map((c) => c.media.id)).toEqual(['voice']);
  });
});
