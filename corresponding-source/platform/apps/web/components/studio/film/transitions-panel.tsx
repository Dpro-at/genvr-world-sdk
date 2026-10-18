'use client';
import { useState } from 'react';
import { ArrowRightLeft, Film, Play, SunMoon } from 'lucide-react';
import { previousClip, toSeconds } from '@genvr/film';
import type { StudioFilming } from '../../../lib/use-studio-filming';
import { pictureFadeSteps } from '../../../lib/video-studio/picture-fades';
import { TransitionPanel } from './titles-panel';

const button = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-ink/10 bg-paper px-2.5 py-1.5 text-xs font-semibold hover:bg-ink/10 disabled:opacity-35';
export function TransitionsWorkspace({ filming }: { filming: StudioFilming }) {
  const studio = filming.studio, off = studio.rendering || filming.busy;
  const [opening, setOpening] = useState(0.5), [ending, setEnding] = useState(0.5);
  const pictures = studio.project.tracks.filter(t => t.kind === 'picture' && !t.hidden).flatMap(track => track.clips.flatMap(clip => clip.type === 'media' ? [{ track, clip }] : [])).sort((a,b) => a.clip.start - b.clip.start);
  const selected = pictures.find(row => row.clip.id === studio.selected) ?? pictures[0];
  const cut = selected ? previousClip(selected.track, selected.clip) : undefined;
  return <section aria-label="Transitions" className="space-y-3 px-3 pb-3 text-ink">
    <h3 className="flex items-center gap-2 text-xs font-semibold"><ArrowRightLeft className="size-4" />Transitions</h3>
    <p className="text-xs text-ink/55">Choose a picture clip. Its transition joins it to the clip immediately before it on the same track. No transition means a direct cut.</p>
    <label className="block text-xs font-semibold">Picture clip<select aria-label="Transition picture clip" className="mt-1 w-full rounded border border-ink/10 bg-paper p-2" disabled={off || !pictures.length} value={selected?.clip.id ?? ''} onChange={e => studio.select(e.target.value)}>
      {!pictures.length ? <option value="">Record a picture first</option> : null}
      {pictures.map(({clip}, i) => <option key={clip.id} value={clip.id}>{i+1}. {studio.project.media.find(m => m.id === clip.media)?.name} · {toSeconds(clip.start).toFixed(2)}s</option>)}
    </select></label>
    {selected ? <>
      {cut ? <>
        <p className="text-[11px] text-ink/55">{selected.clip.transition ? 'Transition active' : 'Direct cut · no transition'}</p>
        <TransitionPanel key={selected.clip.id} filming={filming} clip={selected.clip} locked={selected.track.locked} />
        <button className={button} disabled={off || selected.track.locked || !selected.clip.transition} onClick={() => studio.run('transition.remove', { clip: selected.clip.id })}>None · direct cut</button>
        <p className="text-[10px] text-ink/50">A transition needs extra footage around the cut. Adding one may trim both clips to make room; Undo restores the edit.</p>
        <button className={button} disabled={off} onClick={() => studio.setPlayhead(Math.max(0, toSeconds(selected.clip.start) - 1))}><Play className="size-3.5" />Cue before cut</button>
      </> : <p className="rounded border border-ink/10 p-2 text-xs text-ink/55">This clip has no adjacent picture before it. Add a second clip directly after the first to create a transition.</p>}
      <fieldset disabled={off || selected.track.locked} className="space-y-2 rounded-lg border border-ink/10 p-3">
        <legend className="flex items-center gap-1 text-xs font-semibold"><SunMoon className="size-3.5" />Picture opening & ending</legend>
        <p className="text-[11px] text-ink/55">For an episode, select its first or last clip. Fade from or to black; 0 means no fade. Replaces this clip's opacity animation.</p>
        <label className="flex items-center justify-between text-xs">Fade in (s)<input aria-label="Picture fade in seconds" className="w-20 rounded border border-ink/10 bg-paper p-1" type="number" min={0} max={toSeconds(selected.clip.duration)/2} step={0.1} value={opening} onChange={e => setOpening(Number(e.target.value))} /></label>
        <label className="flex items-center justify-between text-xs">Fade out (s)<input aria-label="Picture fade out seconds" className="w-20 rounded border border-ink/10 bg-paper p-1" type="number" min={0} max={toSeconds(selected.clip.duration)/2} step={0.1} value={ending} onChange={e => setEnding(Number(e.target.value))} /></label>
        <button className={button} onClick={() => { try { studio.batch(pictureFadeSteps(selected.clip, opening, ending), { label: 'Picture opening and ending' }); } catch (e) { studio.setMessage(e instanceof Error ? e.message : 'Could not apply fades.'); } }}><Film className="size-3.5" />Apply picture fades</button>
        <p className="text-[10px] text-ink/50">Sound fades stay in Sound. Titles remain on their own tracks.</p>
      </fieldset>
    </> : null}
  </section>;
}
