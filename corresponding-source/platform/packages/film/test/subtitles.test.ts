import { describe, expect, it } from 'vitest';
import { FilmSession, emptyFilm, subtitleLines, toSrt, toVtt } from '../src/index.js';

const ok = (r: { ok: boolean; reason?: string }) => expect(r.reason ?? '').toBe('');
const session = () => {
  let n = 0;
  return new FilmSession(emptyFilm(), () => `id${++n}`);
};

describe('subtitles (FILM-12)', () => {
  it('one track per language, lines in order, overlaps cut, shown language only', () => {
    const f = session();
    expect(f.run('subtitles.set', { lang: 'en', name: 'English', lines: [{ start: 2, end: 4, text: 'Two' }, { start: 0, end: 2.5, text: 'One' }] }).ok).toBe(true);
    expect(f.run('subtitles.set', { lang: 'ar', name: 'العربية', lines: [{ start: 0, end: 2, text: 'واحد' }] }).ok).toBe(true);
    const tracks = f.project.tracks.filter((t) => t.lang);
    expect(tracks.map((t) => [t.lang, t.hidden])).toEqual([['en', true], ['ar', false]]);
    expect(subtitleLines(f.project, 'en')).toEqual([{ start: 0, end: 2, text: 'One' }, { start: 2, end: 4, text: 'Two' }]);
    expect(f.run('subtitles.set', { lang: 'en', name: 'English', lines: [{ start: 1, end: 2, text: 'Again' }] }).ok).toBe(true);
    expect(f.project.tracks.filter((t) => t.lang === 'en')).toHaveLength(1);
    expect(subtitleLines(f.project, 'en')).toEqual([{ start: 1, end: 2, text: 'Again' }]);
    expect(f.run('subtitles.show', { lang: null }).ok).toBe(true);
    expect(f.project.tracks.filter((t) => t.lang).every((t) => t.hidden)).toBe(true);
    expect(f.run('subtitles.set', { lang: 'English', name: 'x', lines: [] }).ok).toBe(false);
  });
  it('a spoken voice per language follows the shown language (FILM-12b)', () => {
    const f = session();
    ok(f.run('media.add', { media: { id: 'v-ar', kind: 'audio', asset: 'a1', name: 'ar', duration: 3 * 254016000000 + 12345, camera: null, cues: [] }, place: 'none' }));
    ok(f.run('subtitles.set', { lang: 'en', name: 'English', lines: [{ start: 0, end: 1, text: 'Hi' }] }));
    ok(f.run('subtitles.set', { lang: 'ar', name: 'Arabic', show: false, lines: [{ start: 0, end: 1, text: 'مرحبا' }] }));
    ok(f.run('voice.set', { lang: 'ar', name: 'Voice ar', media: 'v-ar' }));
    const voice = () => f.project.tracks.find((t) => t.kind === 'sound' && t.lang === 'ar')!;
    expect(voice().clips).toMatchObject([{ media: 'v-ar', start: 0, soundType: 'dialogue' }]);
    expect(voice().muted).toBe(true);
    ok(f.run('subtitles.show', { lang: 'ar' }));
    expect(voice().muted).toBe(false);
    ok(f.run('voice.set', { lang: 'ar', name: 'Voice ar', media: 'v-ar' }));
    expect(f.project.tracks.filter((t) => t.kind === 'sound' && t.lang === 'ar')).toHaveLength(1);
  });
  it('keeps the subtitle look and refuses bad values (FILM-12d)', () => {
    const f = session();
    ok(f.run('subtitles.style', { box: 'none' }));
    expect(f.project.subtitleStyle).toEqual({ box: 'none', boxColor: '#000000', boxOpacity: 0.7, textColor: '#ffffff' });
    ok(f.run('subtitles.style', { boxColor: '#ffcc00', boxOpacity: 0.3 }));
    expect(f.project.subtitleStyle).toMatchObject({ box: 'none', boxColor: '#ffcc00', boxOpacity: 0.3 });
    expect(f.run('subtitles.style', { boxOpacity: 2 }).ok).toBe(false);
    expect(f.run('subtitles.style', { textColor: 'red' }).ok).toBe(false);
    ok(f.run('edit.undo'));
    expect(f.project.subtitleStyle?.boxColor).toBe('#000000');
  });
  it('places each actor’s voice on their own track at the take (FILM-11)', () => {
    const f = session();
    const audio = (id: string) => ({ id, kind: 'audio', asset: id, name: id, duration: 2 * 254016000000 + 777, camera: null, cues: [] });
    ok(f.run('media.add', { media: audio('va'), place: 'none' }));
    ok(f.run('media.add', { media: audio('vb'), place: 'none' }));
    ok(f.run('actor.voice', { media: 'va', name: 'Ana', start: 1.02 }));
    ok(f.run('actor.voice', { media: 'vb', name: 'Ben', start: 1 }));
    const ana = f.project.tracks.find((t) => t.name === 'Ana')!, ben = f.project.tracks.find((t) => t.name === 'Ben')!;
    expect(ana.kind).toBe('sound'); expect(ben.kind).toBe('sound');
    expect(ana.clips[0]).toMatchObject({ media: 'va', soundType: 'dialogue' });
    expect(ana.clips[0]!.start % (254016000000 / 30)).toBe(0);
    ok(f.run('actor.voice', { media: 'vb', name: 'Ana', start: 5 }));
    expect(f.project.tracks.filter((t) => t.name === 'Ana')).toHaveLength(1);
    expect(f.project.tracks.find((t) => t.name === 'Ana')!.clips).toHaveLength(2);
  });
  it('writes .srt and .vtt', () => {
    const lines = [{ start: 0.5, end: 2.25, text: 'Hello\nthere' }, { start: 3725.007, end: 3726, text: 'Late' }, { start: 4, end: 5, text: '  ' }];
    expect(toSrt(lines)).toBe('1\n00:00:00,500 --> 00:00:02,250\nHello\nthere\n\n2\n01:02:05,007 --> 01:02:06,000\nLate\n');
    expect(toVtt(lines)).toBe('WEBVTT\n\n00:00:00.500 --> 00:00:02.250\nHello\nthere\n\n01:02:05.007 --> 01:02:06.000\nLate\n');
  });
});
