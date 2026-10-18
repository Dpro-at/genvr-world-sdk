import { toSeconds, type MediaClip, type BatchStep } from '@genvr/film';
/** Source trims and timeline placement in one undoable edit. */
export function soundEditSteps(clip: MediaClip, input: { sourceIn: number; sourceOut: number; start: number }, sourceSeconds: number): BatchStep[] {
 const { sourceIn, sourceOut, start } = input;
 if (![sourceIn,sourceOut,start].every(Number.isFinite) || sourceIn < 0 || sourceOut <= sourceIn || sourceOut > sourceSeconds || start < 0) throw new Error('Choose a valid source range and timeline start.');
 const oldIn = toSeconds(clip.in), oldOut = oldIn + toSeconds(clip.duration);
 if (toSeconds(clip.start) + sourceIn - oldIn < 0) throw new Error('Move the clip later before extending its source start.');
 const steps: BatchStep[] = [];
 if (Math.abs(sourceIn-oldIn)>.0001) steps.push({id:'clip.trim',args:{clip:clip.id,edge:'start',by:sourceIn-oldIn,ripple:false}});
 if (Math.abs(sourceOut-oldOut)>.0001) steps.push({id:'clip.trim',args:{clip:clip.id,edge:'end',by:sourceOut-oldOut,ripple:false}});
 if (sourceOut > oldOut) steps.sort((a,b) => (a.args as {edge?:string}).edge === 'end' ? -1 : (b.args as {edge?:string}).edge === 'end' ? 1 : 0);
 steps.push({id:'clip.move',args:{clip:clip.id,start}});
 return steps;
}
