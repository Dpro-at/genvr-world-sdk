'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Diamond, LineChart, Timer } from 'lucide-react';
import {
  EASE_PRESETS, evaluate, filmTime, fromSeconds, keyTime, pathPoints, property, properties, toSeconds, valueAt, velocity,
  type CaptionClip, type EffectClip, type Key, type MediaClip,
} from '@genvr/film';
import type { StudioFilming } from '../../../lib/use-studio-filming';

type Animated = MediaClip | EffectClip | CaptionClip;
const icon = 'inline-flex size-6 items-center justify-center rounded hover:bg-ink/10 disabled:opacity-35';
const button = 'inline-flex items-center justify-center gap-1 rounded-md border border-ink/10 bg-paper px-2 py-1 text-[11px] font-semibold hover:bg-ink/10 disabled:opacity-35';

const keysOf = (clip: Animated, path: string): Key[] => clip.keys?.[path] ?? [];
/** Film seconds of each key of a property. */
const keyFilmTimes = (clip: Animated, path: string) => keysOf(clip, path).map((k) => ({ key: k, at: toSeconds(filmTime(clip, k.at)) }));

/**
 * One animatable value: the stopwatch turns animation on (a key at the playhead) or off; the arrows jump
 * to the previous / next key; the diamond adds or removes a key at the playhead. The slider shows the
 * value at the playhead and, when animated, sets a key there.
 */
export function AnimatedSlider({ filming, clip, path, label, disabled, id }:
  { filming: StudioFilming; clip: Animated; path: string; label?: string; disabled?: boolean; id?: string }) {
  const studio = filming.studio, info = property(clip, path);
  const [draft, setDraft] = useState<number | null>(null);
  if (!info || info.kind !== 'number') return null;
  const playhead = fromSeconds(studio.playhead), animated = keysOf(clip, path).length > 0;
  const value = Number(valueAt(clip, path, playhead) ?? 0), shown = draft ?? value;
  const here = keysOf(clip, path).find((k) => k.at === keyTime(clip, playhead));
  const times = keyFilmTimes(clip, path).map((k) => k.at);
  const prev = [...times].reverse().find((t) => t < studio.playhead - 1e-6), next = times.find((t) => t > studio.playhead + 1e-6);
  const commit = () => { if (draft !== null && draft !== value) studio.run('property.set', { clip: clip.id, property: path, value: draft }); setDraft(null); };
  return <div className="text-xs text-ink/60" data-film-id={id ?? `film.clip.prop.${path}`}>
    <div className="flex items-center gap-0.5">
      <button className={`${icon} ${animated ? 'text-brand' : ''}`} disabled={disabled} aria-pressed={animated}
        title={animated ? 'Stop animating (keeps the value at the playhead)' : 'Animate: add a key at the playhead'} aria-label={`Animate ${label ?? info.label}`}
        onClick={() => studio.run(animated ? 'property.clear' : 'key.add', { clip: clip.id, property: path })}><Timer className="size-3.5" /></button>
      <span className="flex-1 truncate">{label ?? info.label}</span>
      {animated ? <>
        <button className={icon} disabled={disabled || prev === undefined} title="Previous key" aria-label="Previous key" onClick={() => prev !== undefined && studio.setPlayhead(prev)}><ChevronLeft className="size-3" /></button>
        <button className={`${icon} ${here ? 'text-brand' : ''}`} disabled={disabled} title={here ? 'Remove the key here' : 'Add a key here'} aria-label={here ? 'Remove key' : 'Add key'}
          onClick={() => studio.run(here ? 'key.remove' : 'key.add', { clip: clip.id, property: path, ...(here ? { key: here.id } : {}) })}>
          <Diamond className={`size-3 ${here ? 'fill-current' : ''}`} /></button>
        <button className={icon} disabled={disabled || next === undefined} title="Next key" aria-label="Next key" onClick={() => next !== undefined && studio.setPlayhead(next)}><ChevronRight className="size-3" /></button>
      </> : null}
      <span className="w-12 text-right font-mono">{Number(shown.toFixed(3))}</span>
    </div>
    <input type="range" aria-label={label ?? info.label} min={info.min} max={info.max} step={info.step} value={shown} disabled={disabled} className="w-full"
      onChange={(e) => setDraft(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
  </div>;
}

/** Position as two sliders (x, y) on one animated value. */
export function PositionControls({ filming, clip, disabled }: { filming: StudioFilming; clip: MediaClip | CaptionClip; disabled?: boolean }) {
  const studio = filming.studio, playhead = fromSeconds(studio.playhead);
  const [x, y] = (valueAt(clip, 'position', playhead) as [number, number] | undefined) ?? [0, 0];
  const [draft, setDraft] = useState<[number, number] | null>(null);
  const animated = keysOf(clip, 'position').length > 0, shown = draft ?? [x, y];
  const here = keysOf(clip, 'position').find((k) => k.at === keyTime(clip, playhead));
  const commit = () => { if (draft && (draft[0] !== x || draft[1] !== y)) studio.run('property.set', { clip: clip.id, property: 'position', value: draft }); setDraft(null); };
  const slider = (axis: 0 | 1) => <input type="range" aria-label={axis ? 'Position Y' : 'Position X'} min={-1} max={1} step={0.01} value={shown[axis]} disabled={disabled}
    className="w-full" onChange={(e) => { const v = [...shown] as [number, number]; v[axis] = Number(e.target.value); setDraft(v); }} onPointerUp={commit} onKeyUp={commit} onBlur={commit} />;
  return <div className="text-xs text-ink/60" data-film-id="film.clip.prop.position">
    <div className="flex items-center gap-0.5">
      <button className={`${icon} ${animated ? 'text-brand' : ''}`} disabled={disabled} aria-pressed={animated} aria-label="Animate position"
        title={animated ? 'Stop animating position' : 'Animate position: add a key at the playhead'}
        onClick={() => studio.run(animated ? 'property.clear' : 'key.add', { clip: clip.id, property: 'position' })}><Timer className="size-3.5" /></button>
      <span className="flex-1">Position</span>
      {animated ? <button className={`${icon} ${here ? 'text-brand' : ''}`} disabled={disabled} aria-label={here ? 'Remove key' : 'Add key'}
        onClick={() => studio.run(here ? 'key.remove' : 'key.add', { clip: clip.id, property: 'position', ...(here ? { key: here.id } : {}) })}>
        <Diamond className={`size-3 ${here ? 'fill-current' : ''}`} /></button> : null}
      <span className="font-mono">{shown[0].toFixed(2)}, {shown[1].toFixed(2)}</span>
    </div>
    <div className="grid grid-cols-2 gap-2">{slider(0)}{slider(1)}</div>
  </div>;
}

/** Key diamonds of the selected clip on its timeline bar; drag one to move it in time. */
export function KeyLane({ filming, clip, zoom }: { filming: StudioFilming; clip: Animated; zoom: number }) {
  const studio = filming.studio;
  const [drag, setDrag] = useState<{ path: string; key: string; x0: number; at: number; dx: number } | null>(null);
  const dragRef = useRef(drag); dragRef.current = drag;
  // A drag still held when the lane goes away (clip deselected, editor closed) lets go of the window.
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);
  const marks = Object.keys(clip.keys ?? {}).flatMap((path) => keyFilmTimes(clip, path).map(({ key, at }) => ({ path, key, at })));
  const begin = (event: React.PointerEvent, path: string, key: string, at: number) => {
    event.stopPropagation(); event.preventDefault();
    const first = { path, key, x0: event.clientX, at, dx: 0 }; dragRef.current = first; setDrag(first);
    const move = (e: PointerEvent) => { const d = dragRef.current; if (d) { const next = { ...d, dx: e.clientX - d.x0 }; dragRef.current = next; setDrag(next); } };
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      stop.current = null;
      const d = dragRef.current; dragRef.current = null; setDrag(null);
      if (!d || e.type === 'pointercancel') return;
      if (Math.abs(e.clientX - d.x0) < 3) { studio.setPlayhead(d.at); return; }
      studio.run('key.set', { clip: clip.id, property: d.path, key: d.key, at: Math.max(0, d.at + (e.clientX - d.x0) / zoom) });
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    stop.current = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  };
  return <>{marks.map(({ path, key, at }) => {
    const shown = drag?.key === key.id ? at + drag.dx / zoom : at;
    return <span key={`${path}-${key.id}`} role="button" tabIndex={-1} title={`${property(clip, path)?.label ?? path} · ${shown.toFixed(2)}s (drag to move, click to go there)`}
      data-film-id={`film.timeline.key.${key.id}`} onPointerDown={(e) => begin(e, path, key.id, at)}
      style={{ left: (shown - toSeconds(clip.start)) * zoom - 4 }}
      className="absolute bottom-0.5 z-10 size-2 rotate-45 cursor-ew-resize border border-white/70 bg-amber-400" />;
  })}</>;
}

/** Value or speed curve of one animated property; drag a key up or down to change its value; ease buttons. */
export function GraphPanel({ filming, clip, disabled }: { filming: StudioFilming; clip: Animated; disabled?: boolean }) {
  const studio = filming.studio;
  const animated = properties(clip).filter((p) => keysOf(clip, p.path).length && p.kind === 'number');
  const [path, setPath] = useState<string>(''), [mode, setMode] = useState<'value' | 'speed'>('value');
  const [drag, setDrag] = useState<{ key: string; value: number } | null>(null);
  const chosen = animated.find((p) => p.path === path) ?? animated[0];
  if (!chosen) return <p className="text-[10px] text-ink/45">Turn on a stopwatch to animate a value; its curve shows here.</p>;
  const keys = keysOf(clip, chosen.path), W = 260, H = 110, pad = 8;
  const from = toSeconds(clip.start), to = toSeconds(clip.start + clip.duration);
  const samples = Array.from({ length: 81 }, (_, i) => {
    const film = from + ((to - from) * i) / 80, at = keyTime(clip, fromSeconds(film));
    return { film, v: mode === 'value' ? Number(evaluate(keys, at)) : velocity(keys, at) };
  });
  const lo = mode === 'value' ? chosen.min : Math.min(0, ...samples.map((p) => p.v)), hi = mode === 'value' ? chosen.max : Math.max(1e-6, ...samples.map((p) => p.v));
  const span = Math.max(1e-9, hi - lo);
  const x = (film: number) => pad + ((film - from) / Math.max(1e-9, to - from)) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - lo) / span) * (H - 2 * pad);
  const valueFromY = (py: number) => Math.min(chosen.max, Math.max(chosen.min, lo + ((H - pad - py) / (H - 2 * pad)) * span));
  return <div className="space-y-1.5" data-film-id="film.graph">
    <div className="flex items-center gap-1">
      <LineChart className="size-3.5 text-ink/60" />
      <select aria-label="Graph value" className="flex-1 rounded border border-ink/10 bg-paper px-1 py-0.5 text-[11px]" value={chosen.path} onChange={(e) => setPath(e.target.value)}>
        {animated.map((p) => <option key={p.path} value={p.path}>{p.label}</option>)}</select>
      <button className={button} aria-pressed={mode === 'speed'} onClick={() => setMode(mode === 'value' ? 'speed' : 'value')}>{mode === 'value' ? 'Value' : 'Speed'}</button>
    </div>
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded bg-ink/5" role="img" aria-label={`${chosen.label} ${mode} graph`}
      onPointerMove={(e) => { if (!drag) return; const box = e.currentTarget.getBoundingClientRect(); setDrag({ ...drag, value: valueFromY(((e.clientY - box.top) / box.height) * H) }); }}
      onPointerUp={() => { if (drag) studio.run('key.set', { clip: clip.id, property: chosen.path, key: drag.key, value: Number(drag.value.toFixed(4)) }); setDrag(null); }}
      onPointerLeave={() => setDrag(null)}>
      <line x1={x(studio.playhead)} x2={x(studio.playhead)} y1={0} y2={H} stroke="rgb(239 68 68)" strokeWidth={1} />
      <polyline fill="none" stroke="currentColor" strokeWidth={1.5} className="text-brand" points={samples.map((p) => `${x(p.film)},${y(p.v)}`).join(' ')} />
      {mode === 'value' ? keyFilmTimes(clip, chosen.path).map(({ key, at }) => <rect key={key.id} x={x(at) - 4} y={y(drag?.key === key.id ? drag.value : Number(key.value)) - 4} width={8} height={8}
        transform={`rotate(45 ${x(at)} ${y(drag?.key === key.id ? drag.value : Number(key.value))})`} className={`cursor-ns-resize ${disabled ? '' : 'fill-amber-400'}`}
        onPointerDown={(e) => { if (disabled) return; e.preventDefault(); setDrag({ key: key.id, value: Number(key.value) }); }} />) : null}
    </svg>
    <div className="flex flex-wrap gap-1">{EASE_PRESETS.map((preset) => <button key={preset} className={button} disabled={disabled}
      data-film-id={`film.graph.ease.${preset}`} onClick={() => studio.run('key.ease', { clip: clip.id, property: chosen.path, preset })}>
      {preset === 'easy' ? 'Easy ease' : preset === 'in' ? 'Ease in' : preset === 'out' ? 'Ease out' : preset === 'hold' ? 'Hold' : 'Linear'}</button>)}</div>
  </div>;
}

/** The position path of the selected clip drawn over the Program monitor (frame coordinates). */
export function MotionPath({ clip, width, height }: { clip: MediaClip | CaptionClip; width: number; height: number }) {
  const keys = keysOf(clip, 'position');
  if (keys.length < 2) return null;
  const px = ([x, y]: [number, number]) => `${(x * 0.5 + 0.5) * width},${(0.5 - y * 0.5) * height}`;
  return <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="pointer-events-none absolute inset-0 h-full w-full" data-film-id="film.program.path">
    <polyline fill="none" stroke="rgb(251 191 36)" strokeWidth={3} strokeDasharray="10 6" points={pathPoints(keys).map(px).join(' ')} />
    {keys.map((k) => { const [cx, cy] = px(k.value as [number, number]).split(',').map(Number); return <circle key={k.id} cx={cx} cy={cy} r={8} fill="rgb(251 191 36)" />; })}
  </svg>;
}
