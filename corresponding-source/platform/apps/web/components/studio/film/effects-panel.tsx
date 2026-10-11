'use client';
import { useState } from 'react';
import { Eye, EyeOff, Layers, Move, Sparkles, Trash2 } from 'lucide-react';
import { BLEND_MODES, EFFECTS, EFFECT_IDS, IDENTITY_TRANSFORM, isEffect, type EffectClip, type EffectParam, type EffectValues, type MediaClip } from '@genvr/film';
import type { StudioFilming } from '../../../lib/use-studio-filming';
import { AnimatedSlider, GraphPanel, PositionControls } from './keyframes';

const button = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-ink/10 bg-paper px-2 py-1 text-xs font-semibold hover:bg-ink/10 disabled:opacity-35';
const select = 'w-full rounded-md border border-ink/10 bg-paper px-2 py-1.5 text-xs';
const legend = 'flex items-center gap-1 px-1 text-xs font-semibold';

/** A slider that saves once when released, so one drag is one undo step. */
export function CommitSlider({ label, value, min, max, step, disabled, commit, id }:
  { label: string; value: number; min: number; max: number; step: number; disabled?: boolean; commit: (value: number) => void; id?: string }) {
  const [draft, setDraft] = useState<number | null>(null);
  const done = () => { if (draft !== null && draft !== value) commit(draft); setDraft(null); };
  const shown = draft ?? value;
  return <label className="block text-xs text-ink/60" data-film-id={id}>
    <span className="flex justify-between"><span>{label}</span><span className="font-mono">{Number(shown.toFixed(3))}</span></span>
    <input type="range" aria-label={label} min={min} max={max} step={step} value={shown} disabled={disabled} className="w-full"
      onChange={(e) => setDraft(Number(e.target.value))} onPointerUp={done} onKeyUp={done} onBlur={done} />
  </label>;
}

/** Number settings animate (stopwatch, keys); colours are set directly. `prefix` is the property path before the setting name. */
function ParamControls({ filming, clip, prefix, effect, params, disabled, commit, id }: { filming: StudioFilming; clip: MediaClip | EffectClip; prefix: string;
  effect: string; params: EffectValues; disabled: boolean; commit: (params: EffectValues) => void; id: string }) {
  if (!isEffect(effect)) return null;
  return <>{Object.entries(EFFECTS[effect].params as Record<string, EffectParam>).map(([key, spec]) => spec.type === 'number'
    ? <AnimatedSlider key={key} filming={filming} clip={clip} path={`${prefix}${key}`} label={spec.label} disabled={disabled} id={`${id}.${key}`} />
    : spec.type === 'choice' ? <label key={key} className="flex items-center justify-between gap-2 text-xs text-ink/60" data-film-id={`${id}.${key}`}>{spec.label}
      <select aria-label={spec.label} className="rounded border border-ink/10 bg-paper px-1 py-0.5" value={String(params[key] ?? spec.default)} disabled={disabled}
        onChange={(e) => commit({ [key]: e.target.value })}>{spec.options.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>
    : <label key={key} className="flex items-center justify-between text-xs text-ink/60" data-film-id={`${id}.${key}`}>{spec.label}
      <input type="color" aria-label={spec.label} value={String(params[key] ?? spec.default)} disabled={disabled} onChange={(e) => commit({ [key]: e.target.value })} /></label>)}</>;
}

/** Transform, blend mode and effects of a picture clip, or the settings of an adjustment layer (FILM-05). */
export function LayerControls({ filming, clip, locked }: { filming: StudioFilming; clip: MediaClip | EffectClip; locked: boolean }) {
  const studio = filming.studio, off = studio.rendering || filming.busy || locked;
  const [adding, setAdding] = useState('');
  if (clip.type === 'effect') {
    const label = isEffect(clip.effect) ? EFFECTS[clip.effect].label : clip.effect;
    return <fieldset disabled={off} data-film-id="film.clip.adjustment" className="space-y-2 rounded-lg border border-ink/10 p-3">
      <legend className={legend}><Layers className="size-3.5" />Adjustment layer · {label}</legend>
      <p className="text-[10px] text-ink/45">Changes everything on the tracks below it while it lasts.</p>
      <ParamControls filming={filming} clip={clip} prefix="params." effect={clip.effect} params={clip.params} disabled={off} id="film.clip.adjustment"
        commit={(params) => studio.run('effect.set', { clip: clip.id, params })} />
      <GraphPanel filming={filming} clip={clip} disabled={off} />
    </fieldset>;
  }
  return <>
    <fieldset disabled={off} data-film-id="film.clip.transform" className="space-y-2 rounded-lg border border-ink/10 p-3">
      <legend className={legend}><Move className="size-3.5" />Transform</legend>
      <PositionControls filming={filming} clip={clip} disabled={off} />
      <AnimatedSlider filming={filming} clip={clip} path="scale" disabled={off} id="film.clip.transform.scale" />
      <AnimatedSlider filming={filming} clip={clip} path="rotation" disabled={off} id="film.clip.transform.rotation" />
      <AnimatedSlider filming={filming} clip={clip} path="opacity" disabled={off} id="film.clip.transform.opacity" />
      <AnimatedSlider filming={filming} clip={clip} path="volume" disabled={off} id="film.clip.volume" />
      <div className="flex items-center gap-2">
        <label className="flex-1 text-xs text-ink/60">Blend<select aria-label="Blend mode" data-film-id="film.clip.blend" className={select} value={clip.blend ?? 'normal'}
          onChange={(e) => studio.run('clip.blend', { clip: clip.id, mode: e.target.value })}>
          {BLEND_MODES.map((mode) => <option key={mode} value={mode}>{mode[0]!.toUpperCase() + mode.slice(1)}</option>)}</select></label>
        <button className={`${button} mt-4`} onClick={() => studio.run('clip.transform', { clip: clip.id, ...IDENTITY_TRANSFORM })} title="Full frame, no turn, fully visible (animated values keep their keys)">Reset</button>
      </div>
    </fieldset>
    <fieldset disabled={off} data-film-id="film.clip.effects" className="space-y-2 rounded-lg border border-ink/10 p-3">
      <legend className={legend}><Sparkles className="size-3.5" />Effects · {clip.effects?.length ?? 0}</legend>
      {(clip.effects ?? []).map((effect) => <div key={effect.id} className="space-y-1.5 rounded-md border border-ink/10 p-2" data-film-id={`film.clip.effects.${effect.id}`}>
        <div className="flex items-center justify-between text-xs font-semibold">
          <span>{isEffect(effect.effect) ? EFFECTS[effect.effect].label : effect.effect}</span>
          <span className="flex gap-1">
            <button className={button} aria-label={effect.enabled ? 'Turn effect off' : 'Turn effect on'} title={effect.enabled ? 'Turn off' : 'Turn on'}
              onClick={() => studio.run('effect.set', { clip: clip.id, effect: effect.id, enabled: !effect.enabled })}>{effect.enabled ? <Eye className="size-3" /> : <EyeOff className="size-3" />}</button>
            <button className={button} aria-label="Remove effect" onClick={() => studio.run('effect.remove', { clip: clip.id, effect: effect.id })}><Trash2 className="size-3" /></button>
          </span>
        </div>
        <ParamControls filming={filming} clip={clip} prefix={`effects.${effect.id}.`} effect={effect.effect} params={effect.params} disabled={off || !effect.enabled}
          id={`film.clip.effects.${effect.id}`} commit={(params) => studio.run('effect.set', { clip: clip.id, effect: effect.id, params })} />
      </div>)}
      <select aria-label="Add effect" data-film-id="film.clip.effects.add" className={select} value={adding}
        onChange={(e) => { const effect = e.target.value; setAdding(''); if (effect) studio.run('effect.add', { clip: clip.id, effect }); }}>
        <option value="">Add effect…</option>{EFFECT_IDS.filter((id) => id !== 'particles').map((id) => <option key={id} value={id}>{EFFECTS[id].label}</option>)}
      </select>
    </fieldset>
    <fieldset disabled={off} className="space-y-2 rounded-lg border border-ink/10 p-3">
      <legend className={legend}>Animation</legend>
      <GraphPanel filming={filming} clip={clip} disabled={off} />
    </fieldset>
  </>;
}

/** Toolbar menu: an adjustment layer at the playhead (3 seconds) on the top effect track. */
export function AdjustmentMenu({ filming }: { filming: StudioFilming }) {
  const studio = filming.studio;
  return <select aria-label="Add adjustment layer" data-film-id="film.adjustment.add" value="" disabled={studio.rendering || filming.busy}
    className="rounded-md border border-ink/10 bg-paper px-2 py-1.5 text-xs font-semibold"
    onChange={(e) => { if (e.target.value) studio.run('adjustment.add', { effect: e.target.value }); }}>
    <option value="">Adjustment…</option>{EFFECT_IDS.map((id) => <option key={id} value={id}>{EFFECTS[id].label}</option>)}
  </select>;
}
