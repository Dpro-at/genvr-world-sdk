'use client';
import { useEffect, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Shuffle, Trash2, Type, Wand2, ArrowRightLeft } from 'lucide-react';
import {
  DEFAULT_TITLE, SELECTOR_SHAPES, TEMPLATES, TITLE_PRESETS, TITLE_PRESET_IDS, TRANSITIONS, TRANSITION_KINDS, toSeconds,
  type CaptionClip, type MediaClip, type TitleFont, type TransitionKind, type TransitionParam,
} from '@genvr/film';
import type { StudioFilming } from '../../../lib/use-studio-filming';
import { CommitSlider } from './effects-panel';
import { AnimatedSlider, GraphPanel, PositionControls } from './keyframes';

const button = 'inline-flex items-center justify-center gap-1 rounded-md border border-ink/10 bg-paper px-2 py-1 text-[11px] font-semibold hover:bg-ink/10 disabled:opacity-35';
const field = 'w-full rounded-md border border-ink/10 bg-paper px-2 py-1.5 text-xs';
const legend = 'flex items-center gap-1 px-1 text-xs font-semibold';
const FONT_LABEL: Record<TitleFont, string> = { nunito: 'Nunito', serif: 'Merriweather (serif)', mono: 'JetBrains Mono', display: 'Bebas Neue (display)' };

/** Text, look, presets and animators of a title (FILM-01); a plain caption can become one. */
export function TitlePanel({ filming, clip, locked }: { filming: StudioFilming; clip: CaptionClip; locked: boolean }) {
  const studio = filming.studio, off = studio.rendering || filming.busy || locked;
  const [text, setText] = useState(clip.text), [subtitle, setSubtitle] = useState(clip.subtitle ?? ''), [preset, setPreset] = useState(TITLE_PRESET_IDS[0]!);
  useEffect(() => { setText(clip.text); setSubtitle(clip.subtitle ?? ''); }, [clip.id, clip.text, clip.subtitle]);
  const style = clip.title ?? DEFAULT_TITLE;
  const set = (change: Record<string, unknown>) => studio.run('title.style', { clip: clip.id, ...change });
  return <>
    <fieldset disabled={off} data-film-id="film.title" className="space-y-2 rounded-lg border border-ink/10 p-3">
      <legend className={legend}><Type className="size-3.5" />{clip.title ? `Title${clip.template ? ` · ${TEMPLATES[clip.template].label}` : ''}` : 'Caption'}</legend>
      <label className="block text-xs text-ink/60">Text<textarea aria-label="Title text" className={field} rows={2} maxLength={2000} value={text}
        onChange={(e) => setText(e.target.value)} onBlur={() => { if (text !== clip.text) set({ text }); }} /></label>
      {!clip.title ? <button className={`${button} w-full`} data-film-id="film.title.make" onClick={() => set({})}>Make this a title (font, colour, animation)</button> : <>
        <label className="block text-xs text-ink/60">{clip.template === 'credits' ? 'Names (one per line)' : 'Second line'}<textarea aria-label="Subtitle" className={field} rows={clip.template === 'credits' ? 4 : 1}
          maxLength={500} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} onBlur={() => { if (subtitle !== (clip.subtitle ?? '')) set({ subtitle }); }} /></label>
        <div className="grid grid-cols-2 gap-2">
          <select aria-label="Font" className={field} value={style.font} onChange={(e) => set({ font: e.target.value })}>
            {(Object.keys(FONT_LABEL) as TitleFont[]).map((f) => <option key={f} value={f}>{FONT_LABEL[f]}</option>)}</select>
          <select aria-label="Weight" className={field} value={style.weight} onChange={(e) => set({ weight: Number(e.target.value) })}>
            <option value={400}>Regular</option><option value={700}>Bold</option><option value={900}>Black</option></select>
        </div>
        <CommitSlider id="film.title.size" label="Size" value={style.size} min={12} max={240} step={1} commit={(size) => set({ size })} />
        <div className="flex items-center gap-2 text-xs text-ink/60">
          <label className="flex items-center gap-1">Colour<input type="color" aria-label="Text colour" value={style.color} onChange={(e) => set({ color: e.target.value })} /></label>
          <span className="ml-auto flex gap-0.5">{(['left', 'center', 'right'] as const).map((a) => {
            const Icon = a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight;
            return <button key={a} className={`${button} ${style.align === a ? 'bg-brand/20' : ''}`} aria-label={`Align ${a}`} aria-pressed={style.align === a} onClick={() => set({ align: a })}><Icon className="size-3" /></button>; })}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink/60">
          <label className="flex items-center gap-1"><input type="checkbox" checked={style.shadow} onChange={(e) => set({ shadow: e.target.checked })} />Shadow</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={!!style.outline} onChange={(e) => set({ outline: e.target.checked ? { color: '#000000', width: 3 } : null })} />Outline</label>
          {style.outline ? <input type="color" aria-label="Outline colour" value={style.outline.color} onChange={(e) => set({ outline: { ...style.outline!, color: e.target.value } })} /> : null}
          <label className="flex items-center gap-1"><input type="checkbox" checked={!!style.box} onChange={(e) => set({ box: e.target.checked ? { color: '#111827', opacity: 0.75 } : null })} />Box</label>
          {style.box ? <input type="color" aria-label="Box colour" value={style.box.color} onChange={(e) => set({ box: { ...style.box!, color: e.target.value } })} /> : null}
        </div>
      </>}
    </fieldset>
    {clip.title ? <>
      <fieldset disabled={off} data-film-id="film.title.animators" className="space-y-2 rounded-lg border border-ink/10 p-3">
        <legend className={legend}><Wand2 className="size-3.5" />Animation presets</legend>
        <div className="flex gap-1">
          <select aria-label="Title preset" className={field} value={preset} onChange={(e) => setPreset(e.target.value)}>
            {TITLE_PRESET_IDS.map((id) => <option key={id} value={id}>{TITLE_PRESETS[id]!.label}</option>)}</select>
          <button className={button} data-film-id="film.title.preset.in" onClick={() => studio.run('title.animate', { clip: clip.id, preset, edge: 'in' })}>In</button>
          <button className={button} data-film-id="film.title.preset.out" onClick={() => studio.run('title.animate', { clip: clip.id, preset, edge: 'out' })}>Out</button>
        </div>
        {(clip.animators ?? []).map((a, n) => <div key={a.id} className="space-y-1 rounded-md border border-ink/10 p-2 text-xs" data-film-id={`film.title.animator.${a.id}`}>
          <div className="flex items-center justify-between font-semibold"><span>{n + 1}. {a.preset ? `${TITLE_PRESETS[a.preset.split(':')[0]!]?.label ?? a.preset} (${a.preset.split(':')[1]})` : 'Custom'}</span>
            <button className={button} aria-label="Remove animator" onClick={() => studio.run('animator.remove', { clip: clip.id, animator: a.id })}><Trash2 className="size-3" /></button></div>
          <div className="grid grid-cols-2 gap-1">
            <select aria-label="Based on" className={field} value={a.selector.based} onChange={(e) => studio.run('animator.set', { clip: clip.id, animator: a.id, selector: { based: e.target.value } })}>
              <option value="chars">Letters</option><option value="words">Words</option><option value="lines">Lines</option></select>
            <select aria-label="Shape" className={field} value={a.selector.shape} onChange={(e) => studio.run('animator.set', { clip: clip.id, animator: a.id, selector: { shape: e.target.value } })}>
              {SELECTOR_SHAPES.map((sh) => <option key={sh} value={sh}>{sh}</option>)}</select>
          </div>
          <label className="flex items-center gap-1 text-ink/60"><input type="checkbox" checked={a.selector.random}
            onChange={(e) => studio.run('animator.set', { clip: clip.id, animator: a.id, selector: { random: e.target.checked } })} /><Shuffle className="size-3" />Random order</label>
          <AnimatedSlider filming={filming} clip={clip} path={`animators.${a.id}.offset`} label="Offset" disabled={off} />
        </div>)}
      </fieldset>
      <fieldset disabled={off} className="space-y-2 rounded-lg border border-ink/10 p-3">
        <legend className={legend}>Place and animate</legend>
        <PositionControls filming={filming} clip={clip} disabled={off} />
        <AnimatedSlider filming={filming} clip={clip} path="scale" disabled={off} />
        <AnimatedSlider filming={filming} clip={clip} path="rotation" disabled={off} />
        <AnimatedSlider filming={filming} clip={clip} path="opacity" disabled={off} />
        <GraphPanel filming={filming} clip={clip} disabled={off} />
      </fieldset>
    </> : null}
  </>;
}

/** The transition on the cut with the clip right before this one (FILM-01). */
export function TransitionPanel({ filming, clip, locked }: { filming: StudioFilming; clip: MediaClip; locked: boolean }) {
  const studio = filming.studio, off = studio.rendering || filming.busy || locked, t = clip.transition;
  const [kind, setKind] = useState<TransitionKind>('dissolve');
  const params = t ? TRANSITIONS[t.kind].params as Record<string, TransitionParam> : {};
  return <fieldset disabled={off} data-film-id="film.transition" className="space-y-2 rounded-lg border border-ink/10 p-3">
    <legend className={legend}><ArrowRightLeft className="size-3.5" />Transition from the clip before</legend>
    {t ? <>
      <div className="flex gap-1">
        <select aria-label="Transition kind" className={field} value={t.kind} onChange={(e) => studio.run('transition.set', { clip: clip.id, kind: e.target.value })}>
          {TRANSITION_KINDS.map((k) => <option key={k} value={k}>{TRANSITIONS[k].label}</option>)}</select>
        <button className={button} aria-label="Remove transition" onClick={() => studio.run('transition.remove', { clip: clip.id })}><Trash2 className="size-3" /></button>
      </div>
      <CommitSlider id="film.transition.duration" label="Length (s)" value={toSeconds(t.duration)} min={0.1} max={4} step={0.05} commit={(duration) => studio.run('transition.set', { clip: clip.id, duration })} />
      <select aria-label="Transition alignment" className={field} value={t.align} onChange={(e) => studio.run('transition.set', { clip: clip.id, align: e.target.value })}>
        <option value="centre">Centred on the cut</option><option value="start">Starts at the cut</option><option value="end">Ends at the cut</option></select>
      {Object.entries(params).map(([key, spec]) => spec.type === 'number'
        ? <CommitSlider key={key} label={spec.label} value={Number(t.params[key] ?? spec.default)} min={spec.min} max={spec.max} step={spec.step}
          commit={(value) => studio.run('transition.set', { clip: clip.id, params: { [key]: value } })} />
        : <select key={key} aria-label={spec.label} className={field} value={String(t.params[key] ?? spec.default)}
          onChange={(e) => studio.run('transition.set', { clip: clip.id, params: { [key]: e.target.value } })}>{spec.options.map((o) => <option key={o} value={o}>{o}</option>)}</select>)}
    </> : <div className="flex gap-1">
      <select aria-label="New transition kind" className={field} value={kind} onChange={(e) => setKind(e.target.value as TransitionKind)}>
        {TRANSITION_KINDS.map((k) => <option key={k} value={k}>{TRANSITIONS[k].label}</option>)}</select>
      <button className={button} data-film-id="film.transition.add" title={studio.film.reason('transition.add', { clip: clip.id, kind }) ?? 'Add'}
        onClick={() => addTransition(filming, clip, kind)}>Add</button>
    </div>}
  </fieldset>;
}

/**
 * Adds a transition the way editors do (FILM-TEST-01 D8): the first fitting placement (centred, ending or starting at the
 * cut; 1, 0.5 or 0.25 s). Shots recorded end to end have no recording beyond the cut, so then both clips are trimmed by
 * half the length (later clips follow) to make room, in one undo step.
 */
function addTransition(filming: StudioFilming, clip: MediaClip, kind: TransitionKind) {
  const studio = filming.studio;
  for (const duration of [1, 0.5, 0.25]) for (const align of ['centre', 'end', 'start'] as const)
    if (studio.film.run('transition.add', { clip: clip.id, kind, duration, align }).ok) return;
  const track = studio.project.tracks.find((t) => t.clips.some((c) => c.id === clip.id));
  const before = track?.clips.find((c) => c.type === 'media' && c.start + c.duration === clip.start);
  if (!before) { studio.run('transition.add', { clip: clip.id, kind }); return; }
  const length = Math.min(1, toSeconds(before.duration) / 3, toSeconds(clip.duration) / 3), half = length / 2;
  const done = studio.batch([
    { id: 'clip.trim', args: { clip: before.id, edge: 'end', by: -half, ripple: true } },
    { id: 'clip.trim', args: { clip: clip.id, edge: 'start', by: half, ripple: true } },
    { id: 'transition.add', args: { clip: clip.id, kind, duration: length, align: 'centre' } },
  ], { label: 'Add transition (clips trimmed to make room)' });
  if (done.ok) studio.setMessage(`Both clips were trimmed by ${half.toFixed(2)} s to make room for the transition (Ctrl+Z undoes it).`);
}

/** Toolbar menu: a title from a template at the playhead. */
export function TitleMenu({ filming }: { filming: StudioFilming }) {
  const studio = filming.studio;
  return <select aria-label="Add title" data-film-id="film.title.add" value="" disabled={studio.rendering || filming.busy}
    className="rounded-md border border-ink/10 bg-paper px-2 py-1.5 text-xs font-semibold"
    onChange={(e) => { const template = e.target.value; if (template) studio.run('title.add', { template, text: template === 'strip' ? 'Name' : template === 'credits' ? 'Thanks for watching' : 'Title',
      ...(template === 'strip' ? { subtitle: 'Role' } : template === 'credits' ? { subtitle: 'Director\nCamera\nMusic' } : {}) }); }}>
    <option value="">Title…</option>{(Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[]).map((id) => <option key={id} value={id}>{TEMPLATES[id].label}</option>)}
  </select>;
}
