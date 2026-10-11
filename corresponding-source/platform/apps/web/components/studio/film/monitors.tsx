'use client';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { ChevronLeft, ChevronRight, Contrast, Grid3x3, Pause, Play, Square, SquareDashed, Undo2 } from 'lucide-react';
import { fromSeconds, timecode, toSeconds } from '@genvr/film';
import type { StudioFilming } from '../../../lib/use-studio-filming';
import { MotionPath } from './keyframes';

const tool = 'inline-flex size-7 items-center justify-center rounded-md text-white/80 hover:bg-white/15 disabled:opacity-35';
const text = 'rounded-md px-2 py-1 text-[11px] font-semibold text-white/85 hover:bg-white/15 disabled:opacity-35';

/** Thin scrub bar under a monitor: click or drag to choose a moment. */
function ScrubBar({ value, length, onChange, id }: { value: number; length: number; onChange: (seconds: number) => void; id: string }) {
  const at = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    onChange(Math.max(0, Math.min(length, ((event.clientX - box.left) / box.width) * length)));
  };
  return <div data-film-id={id} role="slider" aria-label="Scrub" aria-valuemin={0} aria-valuemax={length} aria-valuenow={value} tabIndex={-1}
    className="relative h-3 cursor-pointer rounded bg-white/15"
    onPointerDown={(e) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* Synthetic pointer. */ } at(e); }}
    onPointerMove={(e) => { if (e.buttons & 1) at(e); }}>
    <div className="absolute inset-y-0 left-0 rounded bg-white/35" style={{ width: `${length ? (value / length) * 100 : 0}%` }} />
    <div className="absolute -top-1 h-5 w-0.5 bg-red-500" style={{ left: `${length ? (value / length) * 100 : 0}%` }} />
  </div>;
}

/** Safe margins (action 90 %, titles 80 %) and thirds over a picture. */
function Guides({ safe, thirds }: { safe: boolean; thirds: boolean }) {
  return <div className="pointer-events-none absolute inset-0">
    {safe ? <><div className="absolute inset-[5%] border border-white/40" /><div className="absolute inset-[10%] border border-dashed border-white/40" /></> : null}
    {thirds ? <>{[1, 2].map((n) => <div key={`v${n}`} className="absolute inset-y-0 w-px bg-white/30" style={{ left: `${(n * 100) / 3}%` }} />)}
      {[1, 2].map((n) => <div key={`h${n}`} className="absolute inset-x-0 h-px bg-white/30" style={{ top: `${(n * 100) / 3}%` }} />)}</> : null}
  </div>;
}

export interface ProgramProps {
  filming: StudioFilming; canvas: RefObject<HTMLCanvasElement | null>; time: number; playing: boolean;
  play: () => void; stop: () => void; scrub: (seconds: number) => void;
}

/** The film at the playhead: transport, frame steps, scrub bar and guides. */
export function ProgramMonitor({ filming, canvas, time, playing, play, stop, scrub }: ProgramProps) {
  const studio = filming.studio, { guides } = studio;
  const step = (frames: number) => scrub(Math.max(0, studio.playhead + (frames * studio.project.rate.den) / studio.project.rate.num));
  return <section aria-label="Program monitor" data-film-id="film.program" className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-black">
    <div className="flex items-center justify-between px-3 py-1.5 text-[11px] font-bold tracking-wide text-white/70">
      <span>PROGRAM</span><span className="font-mono">{timecode(fromSeconds(time), studio.project.rate)}</span>
    </div>
    <div className="relative min-h-0 flex-1">
      <canvas aria-label="Sequence preview" ref={canvas} width={1280} height={720} className="h-full w-full object-contain" />
      <Guides safe={guides.safe} thirds={guides.thirds} />
      {(() => { const clip = studio.project.tracks.flatMap((t) => t.clips).find((c) => c.id === studio.selected);
        return (clip?.type === 'media' || clip?.type === 'caption') && !playing ? <MotionPath clip={clip} width={canvas.current?.width ?? 1280} height={canvas.current?.height ?? 720} /> : null; })()}
      {!studio.length ? <p className="absolute inset-0 flex items-center justify-center text-xs text-white/50">Record a shot to start the film.</p> : null}
    </div>
    {studio.workspace === 'colour' ? <Waveform canvas={canvas} time={time} /> : null}
    <div className="space-y-1.5 px-3 pt-1 pb-2">
      <ScrubBar id="film.program.scrub" value={time} length={studio.length} onChange={scrub} />
      <div className="flex items-center justify-center gap-1">
        <button className={tool} data-film-id="film.program.back" title="Back one frame (Left)" aria-label="Back one frame" disabled={playing} onClick={() => step(-1)}><ChevronLeft className="size-4" /></button>
        {playing
          ? <button className={tool} data-film-id="film.program.stop" title="Stop (Space)" aria-label="Stop" onClick={stop}><Square className="size-4" /></button>
          : <button className={tool} data-film-id="film.program.play" title="Play (Space)" aria-label="Play" disabled={!studio.length || filming.busy} onClick={play}><Play className="size-4" /></button>}
        <button className={tool} data-film-id="film.program.forward" title="Forward one frame (Right)" aria-label="Forward one frame" disabled={playing} onClick={() => step(1)}><ChevronRight className="size-4" /></button>
        <span className="mx-2 h-4 w-px bg-white/20" />
        <button className={`${tool} ${guides.safe ? 'bg-white/20' : ''}`} data-film-id="film.program.safe" title="Safe margins" aria-label="Safe margins" aria-pressed={guides.safe}
          onClick={() => studio.setGuides({ ...guides, safe: !guides.safe })}><SquareDashed className="size-4" /></button>
        <button className={`${tool} ${guides.thirds ? 'bg-white/20' : ''}`} data-film-id="film.program.thirds" title="Thirds" aria-label="Thirds" aria-pressed={guides.thirds}
          onClick={() => studio.setGuides({ ...guides, thirds: !guides.thirds })}><Grid3x3 className="size-4" /></button>
        <button className={`${tool} ${studio.ungraded ? 'bg-white/20' : ''}`} data-film-id="film.program.before" title="Hold to see the picture without its Colour (before / after)"
          aria-label="Before (hold)" aria-pressed={studio.ungraded} disabled={playing}
          onPointerDown={() => studio.setUngraded(true)} onPointerUp={() => studio.setUngraded(false)} onPointerLeave={() => studio.setUngraded(false)}><Contrast className="size-4" /></button>
      </div>
    </div>
  </section>;
}

/** One recording: watch it, mark the part you want (I / O), put it on the film at the playhead. */
export function SourceMonitor({ filming }: { filming: StudioFilming }) {
  const studio = filming.studio, source = studio.source;
  const media = source ? studio.project.media.find((m) => m.id === source.media) : undefined;
  const blob = media ? studio.assets.find((a) => a.id === media.asset)?.blob : undefined;
  const url = useMemo(() => blob ? URL.createObjectURL(blob) : null, [blob]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0), [playing, setPlaying] = useState(false);
  const length = media ? toSeconds(media.duration) : 0;
  const out = source?.out ?? length;
  const seek = (seconds: number) => { if (video.current) video.current.currentTime = seconds; setTime(seconds); };
  const mark = (edge: 'in' | 'out') => {
    if (!source) return;
    const next = edge === 'in' ? { ...source, in: Math.min(time, out - .1) } : { ...source, out: Math.max(time, source.in + .1) };
    studio.setSource(next);
  };
  const place = (mode: 'insert' | 'overwrite') => {
    if (!source) return;
    studio.run('clip.place', { media: source.media, start: studio.playhead, in: source.in, duration: Math.max(.1, out - source.in), mode });
  };
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input, textarea, select') || event.ctrlKey || event.metaKey) return;
      // I / O act on the focused panel: inside the timeline they mark the film's In / Out instead.
      if ((event.target as HTMLElement).closest('[data-film-id="film.timeline"]') || !source) return;
      if (event.key === 'i' || event.key === 'I') mark('in'); else if (event.key === 'o' || event.key === 'O') mark('out');
    };
    window.addEventListener('keydown', keys); return () => window.removeEventListener('keydown', keys);
  });
  return <section aria-label="Source monitor" data-film-id="film.source" className="flex h-full min-h-0 min-w-0 flex-1 flex-col border-r border-white/10 bg-black">
    <div className="flex items-center justify-between px-3 py-1.5 text-[11px] font-bold tracking-wide text-white/70">
      <span className="truncate">SOURCE{media ? ` · ${media.name}` : ''}</span><span className="font-mono">{time.toFixed(2)}s</span>
    </div>
    <div className="relative min-h-0 flex-1">
      {url ? <video ref={video} src={url} muted playsInline className="h-full w-full object-contain"
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
        : <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-white/50">Open a recording from Shots to watch it here.</p>}
    </div>
    <div className="space-y-1.5 px-3 pt-1 pb-2">
      <div className="relative">
        <ScrubBar id="film.source.scrub" value={time} length={length} onChange={seek} />
        {source && length ? <div className="pointer-events-none absolute inset-y-0 rounded border-x-2 border-amber-400 bg-amber-400/20"
          style={{ left: `${(source.in / length) * 100}%`, width: `${((out - source.in) / length) * 100}%` }} /> : null}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1">
        <button className={tool} aria-label={playing ? 'Pause source' : 'Play source'} data-film-id="film.source.play" disabled={!url}
          onClick={() => playing ? video.current?.pause() : void video.current?.play()}>{playing ? <Pause className="size-4" /> : <Play className="size-4" />}</button>
        <button className={text} data-film-id="film.source.in" title="Mark in (I)" disabled={!source} onClick={() => mark('in')}>In {source ? source.in.toFixed(2) : ''}</button>
        <button className={text} data-film-id="film.source.out" title="Mark out (O)" disabled={!source} onClick={() => mark('out')}>Out {source ? out.toFixed(2) : ''}</button>
        <button className={text} data-film-id="film.source.clear" title="Clear marks" aria-label="Clear marks" disabled={!source} onClick={() => source && studio.setSource({ media: source.media, in: 0, out: null })}><Undo2 className="size-3.5" /></button>
        <span className="mx-1 h-4 w-px bg-white/20" />
        <button className={text} data-film-id="film.source.insert" title="Insert at the playhead: later clips move right" disabled={!source || filming.busy} onClick={() => place('insert')}>Insert</button>
        <button className={text} data-film-id="film.source.overwrite" title="Overwrite at the playhead" disabled={!source || filming.busy} onClick={() => place('overwrite')}>Overwrite</button>
      </div>
    </div>
  </section>;
}

/** Brightness of every column of the Program picture (0 bottom .. 1 top), for matching exposure by eye. */
export function Waveform({ canvas, time }: { canvas: RefObject<HTMLCanvasElement | null>; time: number }) {
  const out = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      const source = canvas.current, target = out.current; if (!source || !target) return;
      const small = document.createElement('canvas'); small.width = 256; small.height = 72;
      const sctx = small.getContext('2d', { willReadFrequently: true }), tctx = target.getContext('2d');
      if (!sctx || !tctx) return;
      sctx.drawImage(source, 0, 0, 256, 72);
      const data = sctx.getImageData(0, 0, 256, 72).data;
      tctx.fillStyle = '#0b0b0b'; tctx.fillRect(0, 0, 256, 100);
      tctx.fillStyle = 'rgba(255,255,255,0.08)'; for (const y of [0, 25, 50, 75]) tctx.fillRect(0, y, 256, 1);
      tctx.fillStyle = 'rgba(120,255,140,0.35)';
      for (let x = 0; x < 256; x++) for (let y = 0; y < 72; y++) {
        const i = (y * 256 + x) * 4, l = (data[i]! * 0.2126 + data[i + 1]! * 0.7152 + data[i + 2]! * 0.0722) / 255;
        tctx.fillRect(x, Math.round((1 - l) * 99), 1, 1);
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [canvas, time]);
  return <canvas ref={out} width={256} height={100} aria-label="Waveform" data-film-id="film.program.waveform" className="mx-3 h-20 w-[calc(100%-1.5rem)] rounded border border-white/10" />;
}
