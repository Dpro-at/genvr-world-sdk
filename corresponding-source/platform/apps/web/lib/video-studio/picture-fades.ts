import { toSeconds, type BatchStep, type MediaClip } from '@genvr/film';

/** Replace the selected picture's opacity envelope; other animated properties stay intact. */
export function pictureFadeSteps(clip: MediaClip, opening: number, ending: number): BatchStep[] {
  const start = toSeconds(clip.start), duration = toSeconds(clip.duration);
  if (![opening, ending].every(x => Number.isFinite(x) && x >= 0 && x <= duration / 2)) throw new Error('Each fade must fit inside half the clip.');
  const steps: BatchStep[] = (clip.keys?.opacity ?? []).map(key => ({ id: 'key.remove', args: { clip: clip.id, property: 'opacity', key: key.id } }));
  const keys = new Map<number, number>([[0, opening ? 0 : 1], [duration, ending ? 0 : 1]]);
  if (opening) keys.set(opening, 1);
  if (ending) keys.set(duration - ending, 1);
  for (const [at, value] of [...keys].sort((a, b) => a[0] - b[0])) steps.push({ id: 'key.add', args: { clip: clip.id, property: 'opacity', at: start + at, value } });
  return steps;
}
