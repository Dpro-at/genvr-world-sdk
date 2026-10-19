'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AudioWaveform, Info, MapPin, MoreHorizontal, Music, Scissors, SlidersHorizontal, Trash2, Volume2, VolumeX, Waves, X, type LucideIcon } from 'lucide-react';
import { toSeconds, type MediaClip } from '@genvr/film';
import type { StudioFilming } from '../../../lib/use-studio-filming';
import { soundEditSteps } from '../../../lib/video-studio/sound-edit';
import { fitMusicSteps } from '../../../lib/video-studio/sound-jobs';
import { DragNumber } from './drag-number';
import { ContextMenu, type MenuItem } from './context-menu';

const button = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-ink/10 bg-paper px-2.5 py-1.5 text-xs font-semibold hover:bg-ink/10 disabled:opacity-35';
const icon = 'inline-flex size-7 items-center justify-center rounded-md hover:bg-ink/10 disabled:opacity-35';
const lit = (on: boolean) => `${icon} ${on ? 'bg-ink/15 text-ink ring-1 ring-ink/30' : 'text-ink/60'}`;
const chip = (on: boolean) => `inline-flex h-6 items-center rounded-full border px-2 text-[11px] font-semibold disabled:opacity-35 ${on ? 'border-ink bg-ink text-paper' : 'border-ink/10 bg-paper hover:bg-ink/10'}`;
const seg = (on: boolean) => `inline-flex h-7 flex-1 items-center justify-center rounded px-1.5 text-[11px] font-semibold disabled:opacity-35 ${on ? 'bg-ink text-paper' : 'hover:bg-ink/10'}`;
const Help = ({ text }: { text: string }) => <span title={text} aria-label={text} className="inline-flex text-ink/45"><Info className="size-3.5" /></span>;
const DEFAULT_DUCK = { on: true, amount: 10, fade: 0.3 };
const SOUND_TYPES = [['dialogue', 'Dialogue'], ['music', 'Music'], ['effects', 'Effects'], ['ambience', 'Ambience']] as const;
const clock = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
const secs = (s: number) => `${Number.isInteger(Math.round(s * 10) / 10) ? Math.round(s) : s.toFixed(1)} s`;

function Fold({ title, icon: Icon, value, open = true, help, children }: { title: string; icon: LucideIcon; value?: ReactNode; open?: boolean; help?: string; children: ReactNode }) {
  return <details open={open} className="group border-b border-ink/10">
    <summary className="flex h-9 cursor-pointer list-none items-center gap-2 px-3 text-xs font-bold [&::-webkit-details-marker]:hidden">
      <span className="text-ink/45 group-open:rotate-90">›</span><Icon className="size-3.5" />{title}{help ? <Help text={help} /> : null}
      {value !== undefined ? <span className="ml-auto truncate font-normal text-ink/55">{value}</span> : null}</summary>
    <div className="space-y-2 px-3 pb-3">{children}</div>
  </details>;
}

/** Board 6: a clip on a sound track on the right — volume, trim and place, fades, sound type and ducking. */
export function SoundClipPanel({ filming, clipId, onClose }: { filming: StudioFilming; clipId: string; onClose?: () => void }) {
  const studio = filming.studio, project = studio.project;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const lastVolume = useRef(1);
  const track = project.tracks.find((t) => t.kind === 'sound' && t.clips.some((c) => c.id === clipId));
  const found = track?.clips.find((c) => c.id === clipId), clip: MediaClip | undefined = found?.type === 'media' ? found : undefined;
  useEffect(() => { if (clip && clip.volume > 0) lastVolume.current = clip.volume; }, [clip?.volume]);
  useEffect(() => {
    if (!onClose) return;
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape' && !(e.target as HTMLElement | null)?.closest('input,textarea,select')) onClose(); };
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  if (!track || !clip) return null;

  const media = project.media.find((m) => m.id === clip.media), mediaSeconds = toSeconds(media?.duration ?? 0);
  const off = studio.rendering || filming.busy || track.locked, why = track.locked ? `Track ${track.name} is locked.` : undefined;
  const name = clip.name ?? media?.name ?? 'Sound';
  const start = toSeconds(clip.start), length = toSeconds(clip.duration), sourceIn = toSeconds(clip.in), sourceOut = sourceIn + length;
  const fadeIn = toSeconds(clip.fade?.in ?? 0), fadeOut = toSeconds(clip.fade?.out ?? 0);
  const duck = project.ducking ?? DEFAULT_DUCK, type = clip.soundType ?? 'music';
  const volume = (v: number) => studio.run('clip.set', { clip: clip.id, volume: Math.min(2, Math.max(0, v)) });
  // Trim and place in one undo step (the same steps as the audio editor).
  const place = (next: { sourceIn?: number; sourceOut?: number; start?: number }) => {
    try { studio.batch(soundEditSteps(clip, { sourceIn, sourceOut, start, ...next }, mediaSeconds), { label: 'Trim and position audio' }); }
    catch (e) { studio.setMessage(e instanceof Error ? e.message : 'Could not edit audio.'); }
  };
  const inside = studio.playhead > start && studio.playhead < start + length;
  const items: MenuItem[] = [
    { label: 'Go to sound', icon: MapPin, run: () => studio.setPlayhead(start) },
    { label: 'Split at playhead', icon: Scissors, keys: 'S', run: () => studio.run('clip.split', { clips: [clip.id], at: studio.playhead }), disabled: off || !inside, why: why ?? 'Put the playhead inside the sound.' },
    { label: 'Fit music to film', icon: Music, run: () => void fitMusicSteps(project, studio.assets, clip.id).then((steps) => { studio.batch(steps, { label: 'Fit music' }); })
      .catch((e) => studio.setMessage(e instanceof Error ? e.message : 'Could not fit the music.')), disabled: off || type !== 'music', why: why ?? 'Only for music.' },
    { label: 'Open Sound tool', icon: SlidersHorizontal, run: () => studio.setWorkspace('sound') },
    'divider',
    { label: 'Delete', icon: Trash2, keys: 'Del', danger: true, run: () => { if (studio.run('clip.remove', { clips: [clip.id], ripple: false }).ok) onClose?.(); }, disabled: off, ...(why ? { why } : {}) },
  ];

  return <div className="text-xs text-ink" aria-label={`Sound ${name}`}>
    <div className="flex items-start gap-2 border-b border-ink/10 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-ink/50">Sound · {track.name} · {SOUND_TYPES.find(([id]) => id === type)?.[1]}</div>
        <input aria-label="Sound name" key={clip.id + name} defaultValue={name} maxLength={120} disabled={off} title="Click to rename"
          className="w-full bg-transparent text-sm font-bold outline-none focus:ring-1 focus:ring-ink/30"
          onBlur={(e) => { const next = e.target.value.trim(); if (next && next !== name) studio.run('clip.set', { clip: clip.id, name: next }); }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        <div className="font-mono text-[11px] text-ink/55">{clock(start)} → {clock(start + length)} · {secs(length)}</div>
      </div>
      <button type="button" className={icon} aria-label="More" title="More — same menu as right-click" onClick={(e) => setMenu({ x: e.clientX, y: e.clientY })}><MoreHorizontal className="size-4" /></button>
      {onClose ? <button type="button" className={icon} aria-label="Close" title="Close (Esc)" onClick={onClose}><X className="size-4" /></button> : null}
    </div>
    {menu ? <ContextMenu at={menu} items={items} close={() => setMenu(null)} title={name} /> : null}
    {track.locked ? <p className="border-b border-ink/10 px-3 py-1.5 text-[11px] text-amber-500">Track {track.name} is locked. <button type="button" className="underline" onClick={() => studio.run('track.set', { track: track.id, locked: false })}>Unlock</button></p> : null}

    <Fold title="Volume" icon={Volume2} value={clip.volume === 0 ? 'muted' : `${Math.round(clip.volume * 100)} %`}>
      <div className="flex items-center gap-1">
        <button type="button" className={lit(clip.volume === 0)} aria-pressed={clip.volume === 0} aria-label="Mute" title="Mute (M)" disabled={off}
          onClick={() => volume(clip.volume === 0 ? lastVolume.current || 1 : 0)}>{clip.volume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}</button>
        <DragNumber label="Volume" value={Math.round(clip.volume * 100)} min={0} max={200} step={1} unit="%" width="w-full" disabled={off} title="Drag to change · 0–200 %" commit={(v) => volume(v / 100)} />
      </div>
      <div className="flex flex-wrap gap-1">{[25, 50, 100, 150, 200].map((v) => <button key={v} type="button" className={chip(Math.round(clip.volume * 100) === v)} disabled={off} onClick={() => volume(v / 100)}>{v}%</button>)}</div>
      {track.lang && track.muted ? <button type="button" className={`${button} w-full`} onClick={() => studio.run('subtitles.show', { lang: track.lang })}>Activate {track.lang.toUpperCase()} audio & captions</button>
        : track.muted ? <p className="text-[11px] text-amber-500">This track is muted. <button type="button" className="underline" onClick={() => studio.run('track.set', { track: track.id, muted: false })}>Unmute</button></p> : null}
    </Fold>

    <Fold title="Trim & position" icon={Scissors} value={`${sourceIn.toFixed(1)} – ${sourceOut.toFixed(1)} · at ${start.toFixed(1)}`}
      help="In and Out cut the sound file; At is where it starts on the timeline. Overlapping sound on this track is overwritten.">
      <div className="grid grid-cols-3 gap-1">
        <DragNumber label="In" value={sourceIn} min={0} max={Math.max(0, sourceOut - 0.05)} step={0.01} width="w-full" disabled={off} commit={(v) => place({ sourceIn: v })} />
        <DragNumber label="Out" value={sourceOut} min={sourceIn + 0.05} max={mediaSeconds} step={0.01} width="w-full" disabled={off} commit={(v) => place({ sourceOut: v })} />
        <DragNumber label="At" value={start} min={0} max={180} step={0.01} width="w-full" disabled={off} title="Starts at, on the timeline" commit={(v) => place({ start: v })} />
      </div>
      <div className="flex items-center gap-1 text-[11px] text-ink/55">
        <span className="flex-1">Source {secs(mediaSeconds)} · used {secs(length)}</span>
        <button type="button" className={icon} aria-label="Go to sound" title="Go to sound on the timeline" onClick={() => studio.setPlayhead(start)}><MapPin className="size-3.5" /></button>
        <button type="button" className={icon} aria-label="Split at playhead" title={inside ? 'Split at playhead (S)' : 'Put the playhead inside the sound to split'} disabled={off || !inside}
          onClick={() => studio.run('clip.split', { clips: [clip.id], at: studio.playhead })}><Scissors className="size-3.5" /></button>
      </div>
    </Fold>

    <Fold title="Fades" icon={AudioWaveform} value={`in ${fadeIn.toFixed(1)} s · out ${fadeOut.toFixed(1)} s`} open={false}>
      <div className="grid grid-cols-2 gap-1">
        <DragNumber label="In" value={fadeIn} min={0} max={Math.min(10, length)} step={0.1} unit="s" width="w-full" disabled={off} commit={(v) => studio.run('clip.fade', { clip: clip.id, in: v })} />
        <DragNumber label="Out" value={fadeOut} min={0} max={Math.min(10, length)} step={0.1} unit="s" width="w-full" disabled={off} commit={(v) => studio.run('clip.fade', { clip: clip.id, out: v })} />
      </div>
    </Fold>

    <Fold title="Sound type" icon={Waves} value={SOUND_TYPES.find(([id]) => id === type)?.[1]} help="What the sound is, for ducking and loudness. Ambience is world sound (ocean, wind), separate from character voices.">
      <div role="radiogroup" aria-label="Sound type" className="flex gap-0.5 rounded-md border border-ink/10 p-0.5">
        {SOUND_TYPES.map(([id, label]) => <button key={id} type="button" role="radio" aria-checked={type === id} disabled={off} className={seg(type === id)}
          onClick={() => { if (type !== id) studio.run('clip.soundType', { clip: clip.id, type: id }); }}>{label}</button>)}
      </div>
    </Fold>

    <Fold title="Mixer" icon={SlidersHorizontal} value={duck.on ? `ducking ${duck.amount} dB` : 'ducking off'} open={false} help="Ducking: music and ambience go down under dialogue (whole film).">
      <div className="flex items-center gap-1">
        <button type="button" className={lit(duck.on)} aria-pressed={duck.on} aria-label="Ducking" title={duck.on ? 'Ducking ON: voices lower the music' : 'Ducking OFF'} disabled={studio.rendering || filming.busy}
          onClick={() => studio.run('sound.duck', { on: !duck.on })}><AudioWaveform className="size-4" /></button>
        <DragNumber label="Down" value={duck.amount} min={0} max={30} step={1} unit="dB" width="w-full" disabled={studio.rendering || filming.busy || !duck.on} commit={(amount) => studio.run('sound.duck', { amount })} />
        <DragNumber label="Fade" value={duck.fade} min={0} max={3} step={0.1} unit="s" width="w-full" disabled={studio.rendering || filming.busy || !duck.on} commit={(fade) => studio.run('sound.duck', { fade })} />
      </div>
      <button type="button" className={`${button} w-full`} onClick={() => studio.setWorkspace('sound')}><SlidersHorizontal className="size-3.5" />Open Sound tool</button>
    </Fold>
  </div>;
}
