'use client';
import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Eye, EyeOff, Lock, Mic, Film, Sparkles, Trash2, Type, Unlock } from 'lucide-react';
import { fromSeconds, timecode, toSeconds, type Clip, type FilmProject, type Media, type Track } from '@genvr/film';
import type { StudioFilming } from '../../../lib/use-studio-filming';
import { ROW_MAX, ROW_MIN, rulerSteps } from '../../../lib/video-studio/timeline-view';
import { ClipStrip, ClipWave } from './timeline-clip';

/**
 * The timeline's dark look (FILM-09), set to the same measures as professional editors (FilmCraft,
 * Premiere): one flat grey for panel, rows and headers, black gutters, blue time and playhead.
 */
export const TL = {
  panel: '#1d1d1d', row: '#1d1d1d', line: '#303030', head: '#1d1d1d', text: '#d1d1d1', dim: '#b0b0b0', faint: '#6e6e6e',
  timecode: '#4096f3', playhead: '#5895ec', tick: '#8d8d8d', divider: '#000000', on: '#4b4b4b', hover: '#2c2c2c', patch: '#265bc1',
  accent: '#2f6bdf', range: '#3f3f3f', rangeBand: '#5c5c5c',
} as const;
export const KIND = { picture: { icon: Film }, sound: { icon: Mic }, caption: { icon: Type }, effect: { icon: Sparkles } } as const;

/** A clip's colour by what it holds: picture with sound, silent picture, sound, caption, adjustment layer. */
export function clipColour(clip: Clip, media: Media | undefined): string {
  if (clip.type === 'caption') return '#6b4f8f';
  if (clip.type === 'effect') return '#6b1c82';
  if (media?.kind === 'audio') return '#355418';
  return media?.hasSound ? '#1d4a64' : '#380ea7';
}
const lighten = (hex: string, k: number) => '#' + [1, 3, 5].map((i) => {
  const v = parseInt(hex.slice(i, i + 2), 16); return Math.round(v + (255 - v) * k).toString(16).padStart(2, '0');
}).join('');

/** The clip box: flat colour, a lighter top edge, a black line at the cut, a white border when selected. */
export function clipBox(clip: Clip, media: Media | undefined, selected: boolean, inRange = false): CSSProperties {
  const base = clipColour(clip, media), fill = inRange ? lighten(base, 0.12) : selected ? lighten(base, 0.06) : base;
  return { background: fill, boxShadow: selected ? `inset 0 0 0 2px #ebebeb, inset 0 0 0 3px #000` : `inset 1px 0 0 #000, inset 0 1px 0 ${lighten(fill, 0.15)}` };
}

/** Timecode ruler with steps that follow the zoom; click or drag to show a moment. */
export function Ruler({ project, zoom, width, range, onScrub, onDrag }: { project: FilmProject; zoom: number; width: number; range: { from: number; to: number } | null;
  onScrub: (event: ReactPointerEvent<HTMLDivElement>) => void; onDrag: (event: ReactPointerEvent<HTMLDivElement>) => void }) {
  const fps = project.rate.num / project.rate.den, { label, tick } = rulerSteps(zoom, fps), end = width / zoom;
  const ticks: number[] = [];
  for (let i = 0, t = 0; t <= end && i < 4000; i++, t = i * tick) ticks.push(t);
  const isLabel = (t: number) => Math.abs(t / label - Math.round(t / label)) < 1e-6;
  return <div className="relative h-10 cursor-ew-resize" style={{ background: TL.head, borderBottom: `1px solid ${TL.line}` }}
    title="Click or drag to show a moment" data-film-id="film.timeline.ruler" onPointerDown={onScrub} onPointerMove={onDrag}>
    {ticks.map((t) => { const major = isLabel(t);
      return <span key={t} className="pointer-events-none absolute bottom-0 w-px" style={{ left: t * zoom, height: major ? 10 : 4, background: TL.tick }}>
        {major ? <span className="absolute bottom-3 -translate-x-1/2 whitespace-nowrap font-mono text-[11px]" style={{ color: TL.dim }}>{timecode(fromSeconds(t), project.rate)}</span> : null}
      </span>; })}
    {range ? <span aria-hidden title="In / Out (I, O; Ctrl+Shift+X clears)" data-film-id="film.timeline.range" className="pointer-events-none absolute bottom-0 h-1.5"
      style={{ left: range.from * zoom, width: (range.to - range.from) * zoom, background: TL.rangeBand }} /> : null}
    {project.markers.map((m) => <span key={m.id} title={m.label || 'Marker'} style={{ left: toSeconds(m.at) * zoom - 4 }}
      className="pointer-events-none absolute top-0 h-3 w-2 bg-sky-400 [clip-path:polygon(0_0,100%_0,100%_65%,50%_100%,0_65%)]" />)}
  </div>;
}

/** A small square toggle of the timeline (28 px, grey fill when on). */
export function Toggle({ on, title, onClick, children, id, className = '', style }: { on: boolean; title: string; onClick: () => void; children: React.ReactNode; id?: string; className?: string; style?: CSSProperties }) {
  return <button className={`inline-flex size-6 items-center justify-center rounded text-[10px] font-bold hover:bg-[#2c2c2c] disabled:opacity-35 ${className}`}
    style={{ ...(on ? { background: TL.on } : {}), ...style }} title={title} aria-label={title} aria-pressed={on} data-film-id={id} onClick={onClick}>{children}</button>;
}

/** One track's header: the patch tag with its name, lock, eye or M / S, and a name line when tall; the bottom edge resizes. */
export function TrackHeader({ filming, track, height, onResize, onToggleSize }: { filming: StudioFilming; track: Track; height: number;
  onResize?: (height: number) => void; onToggleSize?: () => void }) {
  const studio = filming.studio, off = studio.rendering || filming.busy;
  const toggle = (key: 'locked' | 'muted' | 'hidden' | 'solo') => { if (!off) studio.run('track.set', { track: track.id, [key]: !track[key] }); };
  const start = useRef<{ y: number; h: number } | null>(null);
  return <div className="relative flex shrink-0 flex-col justify-center gap-1 pl-3 pr-2" style={{ height, background: TL.head, borderBottom: `1px solid ${TL.line}`, color: TL.text }}
    data-film-id={`film.timeline.header.${track.name}`} onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest('button')) onToggleSize?.(); }}>
    <div className="flex items-center gap-1">
      <span className="inline-flex h-5 w-7 items-center justify-center rounded-sm text-[10px] font-semibold" style={{ background: TL.patch, color: '#ebebeb' }}>{track.name}</span>
      <Toggle on={false} title={track.locked ? `Unlock ${track.name}` : `Lock ${track.name}`} onClick={() => toggle('locked')}>
        {track.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5 opacity-40" />}</Toggle>
      {track.kind === 'sound' ? <>
        <Toggle on={false} title={track.muted ? `Unmute ${track.name}` : `Mute ${track.name}`} onClick={() => toggle('muted')} style={track.muted ? { background: '#2d9d78', color: '#fff' } : { color: TL.dim }}>M</Toggle>
        <Toggle on={false} title={`Solo ${track.name}`} onClick={() => toggle('solo')} style={track.solo ? { background: '#f0f04f', color: '#000' } : { color: TL.dim }}>S</Toggle>
      </> : <Toggle on={false} title={track.hidden ? `Show ${track.name}` : `Hide ${track.name}`} onClick={() => toggle('hidden')}>
        {track.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5 opacity-70" />}</Toggle>}
      {!track.clips.length ? <Toggle on={false} title={`Remove ${track.name}`} id={`film.track.${track.name}.remove`} className="ml-auto" onClick={() => { if (!off) studio.run('track.remove', { track: track.id }); }}><Trash2 className="size-3 opacity-60" /></Toggle> : null}
    </div>
    {height >= 40 ? <span className="truncate text-[11px]" style={{ color: TL.faint }}>
      {track.kind === 'picture' ? 'Video' : track.kind === 'sound' ? 'Audio' : track.kind === 'caption' ? 'Captions' : 'Effects'} {track.name.slice(1)}</span> : null}
    {track.locked ? <span className="absolute inset-y-0 right-0 w-1" style={{ background: TL.on }} /> : null}
    {onResize ? <span aria-hidden title="Drag to resize these tracks (double-click the header: small / large)" className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize hover:bg-white/20"
      onPointerDown={(e) => { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* Pointer already gone. */ } start.current = { y: e.clientY, h: height }; }}
      onPointerMove={(e) => { if (start.current) onResize(Math.max(ROW_MIN, Math.min(ROW_MAX, start.current.h + e.clientY - start.current.y))); }}
      onPointerUp={() => { start.current = null; }} onPointerCancel={() => { start.current = null; }} /> : null}
  </div>;
}

/**
 * What a clip shows inside (FILM-09): its name on the first 16 px with an "fx" mark, white corner
 * marks where it reaches the recording's first or last frame, the head picture below, the sound as
 * bars in the lower 42 % with the volume line above, title text or the effect name.
 */
export function ClipFace({ clip, track, media, blob, zoom, height, label, seconds, show, fps }: { clip: Clip; track: Track; media: Media | undefined; blob: Blob | undefined;
  zoom: number; height: number; label: string; seconds: number; show: { pictures: boolean; strip: boolean; waves: boolean }; fps: number }) {
  const width = seconds * zoom, band = 16;
  const effects = clip.type === 'media' ? (clip.effects?.length ?? 0) : 0;
  const changed = 'keys' in clip && !!clip.keys && Object.keys(clip.keys).length > 0 || ('transform' in clip && !!clip.transform);
  const sounding = clip.type === 'media' && !!media && (media.kind === 'audio' || !!media.hasSound);
  const zone = sounding && show.waves ? Math.max(8, Math.round(height * 0.42)) : 0;
  const noHead = clip.type === 'media' && clip.in <= 0;
  const noTail = clip.type === 'media' && !!media && toSeconds(clip.in + clip.duration) >= toSeconds(media.duration) - 1 / fps;
  const upper = height - band - zone - 1;
  const volumeY = clip.type === 'media' && zone && upper > 6
    ? band + upper - Math.max(0, Math.min(1, (20 * Math.log10(Math.max(1e-6, clip.volume)) + 60) / 66)) * upper : null;
  return <>
    {clip.type === 'media' && media && track.kind === 'picture' && show.pictures && height > 28 && width > 20
      ? <div className="absolute inset-x-0" style={{ top: band, height: height - band - 1 - (zone ? 0 : 0) }}>
        <ClipStrip clip={clip} media={media} blob={blob} zoom={zoom} height={height - band - 1} head={!show.strip} /></div> : null}
    {clip.type === 'media' && media && zone ? <div className="pointer-events-none absolute inset-x-px bottom-px overflow-hidden" style={{ height: zone }}>
      <ClipWave clip={clip} media={media} blob={blob} zoom={zoom} height={zone} /></div> : null}
    {volumeY !== null ? <span aria-hidden className="pointer-events-none absolute inset-x-0 h-px bg-white shadow-[0_1px_0_#000]" style={{ top: volumeY }} /> : null}
    {width > 24 ? <span className="pointer-events-none absolute left-1.5 right-6 top-0 flex h-4 items-center truncate text-[11.5px] leading-none" style={{ color: '#d9d9d9' }}>{label}</span> : null}
    {(effects || changed) && width > 40 ? <span className="pointer-events-none absolute right-1.5 top-0 flex h-4 items-center text-[11px] font-semibold"
      style={{ color: effects ? '#e8c54a' : '#91a2ac' }} title={effects ? `${effects} effect${effects === 1 ? '' : 's'}` : 'Changed properties'}>fx</span> : null}
    {noHead && width > 12 ? <span aria-hidden className="pointer-events-none absolute left-0 top-0 size-[5px] bg-white/85 [clip-path:polygon(0_0,100%_0,0_100%)]" /> : null}
    {noTail && width > 12 ? <span aria-hidden className="pointer-events-none absolute right-0 top-0 size-[5px] bg-white/85 [clip-path:polygon(0_0,100%_0,100%_100%)]" /> : null}
    {clip.type === 'caption' && height > 28 ? <span className="pointer-events-none absolute inset-x-1.5 truncate text-[10px]" style={{ top: band, color: '#e9dcff' }}>{clip.style}</span> : null}
  </>;
}

/** Audio meters beside the timeline (one bar per sound lane while the film plays), 0 to -57 dB. */
export function Meters({ filming }: { filming: StudioFilming }) {
  const studio = filming.studio, lanes = Object.entries(studio.levels);
  const scale = (db: number) => Math.max(0, Math.min(1, (db + 57) / 57));
  return <div aria-label="Audio meters" data-film-id="film.timeline.meters" className="flex w-[72px] shrink-0 flex-col bg-black" style={{ borderLeft: `4px solid ${TL.divider}` }}>
    <div className="relative mx-1 mb-2 mt-3 flex min-h-0 flex-1 gap-1 pr-6">
      {Array.from({ length: 20 }, (_, i) => -i * 3).filter((db) => db % 6 === 0).map((db) => <span key={db} className="pointer-events-none absolute right-0 font-mono text-[8px] leading-none"
        style={{ bottom: `calc(${scale(db) * 100}% - 4px)`, color: TL.faint }}>{db}</span>)}
      {(lanes.length ? lanes : [['L', -90], ['R', -90]] as [string, number][]).map(([lane, db]) => {
        const name = lane === 'dialogue' ? 'Dialogue' : studio.project.tracks.find((t) => t.id === lane)?.name ?? lane;
        return <div key={lane} title={`${name}: ${db > -90 ? db.toFixed(0) : '-∞'} dB`} className="relative flex-1 overflow-hidden" style={{ background: '#141414' }}>
          {/* Colours stay fixed to the scale: green, yellow above -12 dB, red above -3 dB; the cover hides what is not reached. */}
          <div className="absolute inset-0" style={{ background: `linear-gradient(to top, #579f51 0%, #70dc5d ${scale(-12) * 100}%, #f0f04f ${scale(-12) * 100}%, #f0f04f ${scale(-3) * 100}%, #e34850 ${scale(-3) * 100}%)` }} />
          <div className="absolute inset-x-0 top-0" style={{ height: `${(1 - scale(db)) * 100}%`, background: '#141414' }} />
        </div>; })}
    </div>
  </div>;
}

/** A sound transition: the outgoing fade and the incoming fade crossing (FILM-09). */
export function SoundCrossfade() {
  const out = Array.from({ length: 21 }, (_, i) => `${i * 5},${(50 - 46 * Math.cos((i / 20) * Math.PI / 2)).toFixed(1)}`).join(' ');
  const into = Array.from({ length: 21 }, (_, i) => `${i * 5},${(50 - 46 * Math.sin((i / 20) * Math.PI / 2)).toFixed(1)}`).join(' ');
  return <svg aria-hidden viewBox="0 0 100 52" preserveAspectRatio="none" className="absolute inset-0 size-full">
    <polyline points={out} fill="none" stroke="#ebebeb" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    <polyline points={into} fill="none" stroke="#ebebeb" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
  </svg>;
}

/**
 * The bottom scrollbar of the timeline (FILM-09): drag the thumb to scroll, drag its round ends to
 * zoom in or out (the other end stays where it is), as in professional editors.
 */
export function ZoomBar({ left, view, content, head, zoom, onScroll, onZoom }: { left: number; view: number; content: number; head: number; zoom: number;
  onScroll: (left: number) => void; onZoom: (zoom: number, keep: { time: number; offset: number }) => void }) {
  const track = useRef<HTMLDivElement>(null), drag = useRef<{ part: 'thumb' | 'start' | 'end'; x: number } | null>(null);
  const total = Math.max(content, view), size = Math.max(0.04, Math.min(1, view / total)), at = Math.min(1 - size, left / total);
  const down = (part: 'thumb' | 'start' | 'end') => (e: ReactPointerEvent<HTMLElement>) => {
    e.preventDefault(); e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* A pointer that is already gone. */ }
    drag.current = { part, x: e.clientX };
  };
  // Each move works from the bar as it is now, so scrolling and zooming never drift.
  const move = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current, width = track.current?.clientWidth ?? 1; if (!d) return;
    const dx = (e.clientX - d.x) / width; drag.current = { ...d, x: e.clientX };
    if (d.part === 'thumb') { onScroll(Math.max(0, left + dx * total)); return; }
    // A smaller thumb shows less time: the zoom grows by old size / new size; the other end stays put.
    const nextSize = Math.max(0.02, d.part === 'end' ? size + dx : size - dx);
    if (!dx) return;
    const keep = d.part === 'end' ? { time: left / zoom, offset: 0 } : { time: (left + view) / zoom, offset: view };
    onZoom(zoom * (size / nextSize), keep);
  };
  const up = () => { drag.current = null; };
  return <div className="flex h-[17px] shrink-0 items-center" style={{ background: TL.panel, borderTop: `1px solid ${TL.line}`, paddingLeft: head }} data-film-id="film.timeline.zoombar">
    <div ref={track} className="relative mx-1 h-[11px] flex-1 rounded-full" style={{ background: '#141414' }}>
      <div className="group absolute inset-y-0 flex cursor-grab items-center justify-between rounded-full" style={{ left: `${at * 100}%`, width: `${size * 100}%`, background: TL.on }}
        title="Drag to scroll; drag a round end to zoom" onPointerDown={down('thumb')} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <span className="size-[11px] cursor-ew-resize rounded-full bg-[#8d8d8d] group-hover:bg-[#b0b0b0]" onPointerDown={down('start')} />
        <span className="size-[11px] cursor-ew-resize rounded-full bg-[#8d8d8d] group-hover:bg-[#b0b0b0]" onPointerDown={down('end')} />
      </div>
    </div>
  </div>;
}
