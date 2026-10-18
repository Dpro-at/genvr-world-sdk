import { expect, it } from 'vitest';
import { FilmSession, emptyFilm, fromSeconds, resolveAt, type MediaClip } from '@genvr/film';
import { pictureFadeSteps } from './picture-fades';
it('fades picture edges, replaces only opacity keys, and supports no fades and undo', () => {
 let n = 0;
 const s = new FilmSession(emptyFilm(), () => `fade${++n}`);
 s.run('media.add', { media: { id:'video', kind:'video', asset:'asset', name:'Video', duration:fromSeconds(6), camera:null, cues:[] } });
 const clip = () => s.project.tracks.flatMap(t => t.clips).find(c => c.type === 'media') as MediaClip;
 s.run('key.add', {clip:clip().id, property:'position', at:1, value:[.2,0]});
 expect(s.batch(pictureFadeSteps(clip(), 1, 1)).ok).toBe(true);
 for(const [time, value] of [[0,0],[.5,.5],[1,1],[3,1],[5.5,.5],[6,0]]) expect(resolveAt(clip(),fromSeconds(time!)).transform!.opacity).toBeCloseTo(value!);
 expect(clip().keys?.position).toHaveLength(1);
 expect(s.batch(pictureFadeSteps(clip(),0,0)).ok).toBe(true);
 expect(resolveAt(clip(),0).transform!.opacity).toBe(1);
 expect(() => pictureFadeSteps(clip(),4,0)).toThrow();
 expect(s.run('edit.undo').ok).toBe(true);
 expect(resolveAt(clip(),0).transform!.opacity).toBe(0);
});
