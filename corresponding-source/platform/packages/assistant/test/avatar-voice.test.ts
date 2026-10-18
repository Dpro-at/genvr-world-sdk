import { expect, it, vi } from 'vitest';
import { runTool, type AssistantHost } from '../src/index.js';
it('routes voice jobs to the attached local host without editing the world',async()=>{
 const voice=vi.fn(async(input:unknown)=>({status:'running',input})),apply=vi.fn();
 const host={avatarVoice:voice,apply} as unknown as AssistantHost;
 expect((await runTool('avatar_voice',{action:'speak',text:'Hello',language:'en'},host)).ok).toBe(true);
 expect(voice).toHaveBeenCalledWith({action:'speak',text:'Hello',language:'en',target:'self'});
 expect(apply).not.toHaveBeenCalled();
});
it('rejects absent hosts, arbitrary playback commands and nonfinite input',async()=>{
 expect((await runTool('avatar_voice',{action:'models'},{} as AssistantHost)).ok).toBe(false);
 const voice=vi.fn(),host={avatarVoice:voice} as unknown as AssistantHost;
 expect((await runTool('avatar_voice',{action:'playback',command:'eval'},host)).ok).toBe(false);
 expect((await runTool('avatar_voice',{action:'playback',command:'seek',value:Infinity},host)).ok).toBe(false);
 expect(voice).not.toHaveBeenCalled();
});
