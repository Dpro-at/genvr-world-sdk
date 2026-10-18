import { expect, it } from 'vitest';
import { emptyFilm, FilmSession, fromSeconds, toSeconds, type MediaClip } from '@genvr/film';
import { soundEditSteps } from './sound-edit';
it('trims source and moves audio in one undo without moving other tracks',()=>{
 let n=0;const s=new FilmSession(emptyFilm(),()=>`sound${++n}`);
 s.run('media.add',{media:{id:'sound',kind:'audio',asset:'wav',name:'Sound',duration:fromSeconds(10),camera:null,cues:[]},place:'none'});
 const track=s.project.tracks.find(t=>t.kind==='sound')!;
 const placed=s.run('clip.place',{media:'sound',track:track.id,start:2,duration:3});expect(placed.ok).toBe(true);
 const clip=()=>s.project.tracks.find(t=>t.id===track.id)!.clips[0] as MediaClip;
 const before=structuredClone(s.project);
 expect(s.batch(soundEditSteps(clip(),{sourceIn:4,sourceOut:7,start:5},10)).ok).toBe(true);
 expect([clip().start,clip().in,clip().duration].map(toSeconds)).toEqual([5,4,3]);
 expect(s.run('edit.undo').ok).toBe(true);expect(s.project).toEqual(before);
 expect(s.batch(soundEditSteps(clip(),{sourceIn:.5,sourceOut:2,start:1},10)).ok).toBe(true);
 expect([clip().start,clip().in,clip().duration].map(toSeconds)).toEqual([1,.5,1.5]);
 expect(()=>soundEditSteps(clip(),{sourceIn:2,sourceOut:1,start:0},10)).toThrow();
 expect(()=>soundEditSteps(clip(),{sourceIn:0,sourceOut:11,start:0},10)).toThrow();
});
