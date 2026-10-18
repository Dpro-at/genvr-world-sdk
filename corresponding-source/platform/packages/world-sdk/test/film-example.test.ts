import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { FilmSession, readFilmFile, toSeconds } from '@genvr/film';

describe('starter film', () => {
 it('keeps two pictures and three exclusive languages without private profile data', async () => {
  const { project, assets } = readFilmFile(new Uint8Array(await readFile(new URL('../../../apps/web/public/film-examples/island-languages.genvrfilm', import.meta.url))));
  expect(project.draft).toEqual([]);
  expect(project.media).toHaveLength(9);
  expect(assets).toHaveLength(9);
  const picture = project.tracks.filter(t => t.kind === 'picture').flatMap(t => t.clips);
  expect(picture).toHaveLength(2);
  expect(toSeconds(picture[0]!.duration)).toBe(7);
  expect(toSeconds(picture[1]!.duration)).toBeGreaterThan(20);
  expect(project.tracks.filter(t=>t.kind==='sound'&&t.lang).every(t=>t.clips.length===2)).toBe(true);
  expect(project.tracks.filter(t => t.kind === 'caption' && t.lang).map(t => t.lang)).toEqual(['ar', 'en', 'de']);
  expect(JSON.stringify(project)).not.toMatch(/voiceType|voiceId|Arabic Female|Arabic Male/);
  const session = new FilmSession(project);
  for (const lang of ['ar', 'en', 'de']) {
   expect(session.run('subtitles.show', { lang }).ok).toBe(true);
   expect(session.project.tracks.filter(t => t.kind === 'sound' && t.lang && !t.muted).map(t => t.lang)).toEqual([lang]);
   expect(session.project.tracks.filter(t => t.kind === 'sound' && !t.lang && !t.muted).flatMap(t => t.clips).filter(c => c.soundType === 'ambience')).toHaveLength(1);
   expect(session.project.tracks.filter(t => t.kind === 'caption' && t.lang && !t.hidden).map(t => t.lang)).toEqual([lang]);
  }
 });
});
