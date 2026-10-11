'use client';
import { useState } from 'react';
import { Palette, Save } from 'lucide-react';
import { EFFECTS, LOOKS, type EffectParam, type MediaClip } from '@genvr/film';
import type { StudioFilming } from '../../../lib/use-studio-filming';
import { AnimatedSlider } from './keyframes';

const button = 'inline-flex items-center justify-center gap-1 rounded-md border border-ink/10 bg-paper px-2 py-1 text-[11px] font-semibold hover:bg-ink/10 disabled:opacity-35';
const field = 'w-full rounded-md border border-ink/10 bg-paper px-2 py-1.5 text-xs';

/** Colour workspace, right dock (FILM-07): looks and the Colour settings of the selected clip. */
export function ColourPanel({ filming }: { filming: StudioFilming }) {
  const studio = filming.studio, off = studio.rendering || filming.busy;
  const located = studio.selected ? studio.project.tracks.map((t) => ({ track: t, clip: t.clips.find((c) => c.id === studio.selected) })).find((x) => x.clip) : undefined;
  const clip = located?.clip?.type === 'media' ? located.clip as MediaClip : undefined;
  const colour = clip?.effects?.find((e) => e.effect === 'colour');
  const [look, setLook] = useState(''), [name, setName] = useState('');
  const saved = Object.keys(studio.project.looks ?? {});
  if (!clip) return <section aria-label="Colour" className="space-y-2 px-3 pb-3 text-xs text-ink/50"><p>Select a recording on the timeline to grade it.
    Hold the half-circle button under Program to compare before and after.</p></section>;
  const locked = located!.track.locked;
  return <section aria-label="Colour" data-film-id="film.colour" className="space-y-3 px-3 pb-3 text-ink">
    <fieldset disabled={off || locked} className="space-y-2 rounded-lg border border-ink/10 p-3">
      <legend className="flex items-center gap-1 px-1 text-xs font-semibold"><Palette className="size-3.5" />Look</legend>
      <div className="flex gap-1">
        <select aria-label="Look" className={field} value={look} onChange={(e) => setLook(e.target.value)}>
          <option value="">Choose a look…</option>
          {Object.entries(LOOKS).map(([id, l]) => <option key={id} value={id}>{l.label}</option>)}
          {saved.length ? <optgroup label="Saved in this film">{saved.map((n) => <option key={n} value={n}>{n}</option>)}</optgroup> : null}
        </select>
        <button className={button} data-film-id="film.colour.apply" disabled={!look} onClick={() => studio.run('look.apply', { clip: clip.id, look })}>Apply</button>
      </div>
      {colour ? <div className="flex gap-1">
        <input aria-label="Look name" className={field} placeholder="Name this look" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        <button className={button} data-film-id="film.colour.save" disabled={!name.trim()} onClick={() => { if (studio.run('look.save', { clip: clip.id, name: name.trim() }).ok) setName(''); }}>
          <Save className="size-3" />Save</button>
      </div> : null}
    </fieldset>
    <fieldset disabled={off || locked} className="space-y-1 rounded-lg border border-ink/10 p-3">
      <legend className="px-1 text-xs font-semibold">Colour settings</legend>
      {colour ? <>
        {Object.entries(EFFECTS.colour.params as Record<string, EffectParam>).map(([key]) =>
          <AnimatedSlider key={key} filming={filming} clip={clip} path={`effects.${colour.id}.${key}`} disabled={off || locked || !colour.enabled} />)}
        <label className="flex items-center gap-2 pt-1 text-xs text-ink/60"><input type="checkbox" checked={colour.enabled}
          onChange={(e) => studio.run('effect.set', { clip: clip.id, effect: colour.id, enabled: e.target.checked })} />Colour on</label>
      </> : <button className={`${button} w-full`} data-film-id="film.colour.add" onClick={() => studio.run('effect.add', { clip: clip.id, effect: 'colour' })}>Add Colour to this clip</button>}
    </fieldset>
  </section>;
}
