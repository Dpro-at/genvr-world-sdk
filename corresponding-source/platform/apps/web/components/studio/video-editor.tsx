'use client';
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Scissors, Undo2, Redo2, Download, Circle, Type, Camera, Plus, Trash2, Magnet, SlidersHorizontal,
  Users, Mic, Film, Languages, Bookmark, FolderOpen, Save, MousePointer2, ChevronsRight, Columns2, ArrowLeftRight, MoveHorizontal } from 'lucide-react';
import { filmLength, fromSeconds, timecode, toSeconds, type Clip, type Track } from '@genvr/film';
import type { StudioFilming } from '../../lib/use-studio-filming';
import { drawAt, mediaDuration, render } from '../../lib/video-studio/render';
import { CaptionsPanel, SoundPanel, WorkspaceSwitch } from './film/panels';
import { ProgramMonitor, SourceMonitor } from './film/monitors';
import { AdjustmentMenu, LayerControls } from './film/effects-panel';
import { KeyLane } from './film/keyframes';
import { TitleMenu, TitlePanel, TransitionPanel } from './film/titles-panel';
import { TransitionsWorkspace } from './film/transitions-panel';
import { ColourPanel } from './film/colour-panel';
import { useStudioHost } from '../../lib/studio-host';
import { SceneVoice } from './film/scene-voice';
import { ClipFace, KIND, Meters, Ruler, SoundCrossfade, TL, Toggle, TrackHeader, ZoomBar, clipBox } from './film/timeline-parts';
import { ROWS_DEFAULT, rowHeight, trackOrder, type RowSizes } from '../../lib/video-studio/timeline-view';
import { FONT_CLASSES } from '../../lib/video-studio/fonts';
import { SCENE_ACTOR, SCENE_FX_ACTIONS, flashWarnings, transitionWindow, type TransitionSpec } from '@genvr/film';

const button = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-ink/10 bg-paper px-2.5 py-1.5 text-xs font-semibold hover:bg-ink/10 disabled:opacity-35';
const input = 'mt-1 w-full rounded-md border border-ink/10 bg-paper px-2 py-1.5 text-xs';
const HEAD = 176;
/** Timeline view settings kept in this browser (row sizes, what clips show, snapping). */
/** `ripple` (FILM-15, owner N-067): cutting or deleting closes the gap and moves what comes after on every track. */
interface TimelineView { rows: RowSizes; pictures: boolean; strip: boolean; waves: boolean; snapping: boolean; ripple: boolean }
const VIEW_KEY = 'genvr.film.timeline-view';
function loadView(): TimelineView {
  const base = { rows: ROWS_DEFAULT, pictures: true, strip: false, waves: true, snapping: true, ripple: true };
  try { return { ...base, ...JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}') as Partial<TimelineView> }; } catch { return base; }
}

function attempt(filming: StudioFilming, action: () => void) {
  try { action(); } catch (error) { filming.studio.setMessage(error instanceof Error ? error.message : 'Edit failed.'); }
}
function record(filming: StudioFilming, replace?: string) {
  if (!replace && filming.studio.mode === 'gameplay') filming.reset();
  filming.studio.setPreviewing(false);
  const [width, height] = filming.output.size.split('x').map(Number);
  void filming.take('video', filming.output.seconds, width!, height!, true, replace, filming.studio.plan);
}

/** A button that runs one editor command; when it cannot run, it is disabled and says why. */
function Command({ filming, id, args, children, title, name, disabled }: { filming: StudioFilming; id: string; args?: unknown; children: ReactNode; title?: string; name?: string; disabled?: boolean }) {
  const studio = filming.studio, reason = studio.film.reason(id, args ?? {});
  const label = title ?? studio.film.labelOf(id, args ?? {});
  return <button className={button} disabled={disabled || !!reason || studio.rendering || filming.busy} title={reason ?? label} aria-label={name ?? label} data-command={id}
    onClick={() => studio.run(id, args ?? {})}>{children}</button>;
}

interface Drag { part: 'move' | 'start' | 'end'; clip: string; track: string; kind: Track['kind']; start: number; end: number; x0: number;
  dx: number; target: string; ripple: boolean; insert: boolean; tool: Tool }

/** Editing tools of the timeline (FILM-09), with the keys professional editors use. */
type Tool = 'select' | 'ripple' | 'roll' | 'slip' | 'slide' | 'razor';
const TOOLS: { id: Tool; key: string; label: string; hint: string; icon: typeof Scissors }[] = [
  { id: 'select', key: 'v', label: 'Selection', hint: 'Move clips, trim edges', icon: MousePointer2 },
  { id: 'ripple', key: 'b', label: 'Ripple edit', hint: 'Trim an edge; later clips follow', icon: ChevronsRight },
  { id: 'roll', key: 'n', label: 'Rolling edit', hint: 'Move a cut; both clips change, the film keeps its length', icon: Columns2 },
  { id: 'slip', key: 'y', label: 'Slip', hint: 'Change what a clip shows, keep its place and length', icon: ArrowLeftRight },
  { id: 'slide', key: 'u', label: 'Slide', hint: 'Move a clip between its neighbours; they give or take the time', icon: MoveHorizontal },
  { id: 'razor', key: 'c', label: 'Razor', hint: 'Click a clip to cut it there', icon: Scissors },
];

/** Transport, workspaces and tracks; monitors take the stage, side docks follow the workspace. */
export function VideoEditor({ filming }: { filming: StudioFilming }) {
  const studio = filming.studio, { project, selected, rendering: running, workspace } = studio;
  const canvas = useRef<HTMLCanvasElement>(null), cancel = useRef<AbortController | null>(null), file = useRef<HTMLInputElement>(null);
  const lanes = useRef<HTMLDivElement>(null), scroller = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<HTMLElement | null>(null), [time, setTime] = useState(0), [zoom, setZoom] = useState(48);
  const [drag, setDrag] = useState<Drag | null>(null), [tool, setTool] = useState<Tool>('select');
  const [exportScope,setExportScope] = useState<'film'|'clip'|'range'>('film');
  const [scroll, setScroll] = useState({ left: 0, view: 800 });
  const anchor = useRef<{ time: number; offset: number } | null>(null);
  const [view, setViewState] = useState<TimelineView>(loadView);
  const rippleRef = useRef(view.ripple); rippleRef.current = view.ripple;
  const setView = (next: Partial<TimelineView>) => setViewState((v) => {
    const merged = { ...v, ...next };
    try { localStorage.setItem(VIEW_KEY, JSON.stringify(merged)); } catch { /* Private window: the view still works for this visit. */ }
    return merged;
  });
  const dragging = useRef<Drag | null>(null);
  const drawing = useRef<{ busy: boolean; next: number | null }>({ busy: false, next: null });
  const ungradedRef = useRef(studio.ungraded); ungradedRef.current = studio.ungraded;
  useEffect(() => { setStage(document.getElementById('genvr-film-stage')); return () => { cancel.current?.abort(); }; }, []);
  // Shoot and Story show the live world; the other workspaces show the monitors.
  const live = workspace === 'shoot' || workspace === 'story';
  useEffect(() => { cancel.current?.abort(); studio.setPreviewing(!live); setTime(0); }, [studio.identity]);
  const playhead = running ? time : studio.playhead;
  /** Draws one moment on the Program monitor; a newer request replaces a waiting one, so scrubbing never queues up. */
  const draw = (seconds: number) => {
    const d = drawing.current; d.next = seconds;
    if (d.busy || !canvas.current) return;
    d.busy = true;
    void (async () => {
      while (d.next !== null) {
        const at = d.next; d.next = null;
        const now = studio.snapshot();
        if (!canvas.current || !toSeconds(filmLength(now.project))) break;
        try { await drawAt(now.project, now.assets, canvas.current, at, new AbortController().signal, { ungraded: ungradedRef.current }); }
        catch (error) { studio.setMessage(error instanceof Error ? error.message : 'Frame unavailable.'); }
      }
      d.busy = false;
    })();
  };
  // Monitors replace the live world outside Shoot; Program always shows the film at the playhead.
  useEffect(() => {
    if (running) return;
    studio.setPreviewing(!live);
    if (!live) draw(studio.playhead);
  }, [workspace]);
  useEffect(() => { if (!running && studio.previewing) draw(studio.playhead); }, [project, studio.playhead, studio.ungraded, stage, studio.previewing]);
  const play = async (exporting: boolean, scope: 'film'|'clip'|'range' = 'range') => {
    if (!canvas.current || studio.isRendering() || filming.isBusy()) return;
    const controller = new AbortController(); cancel.current = controller; studio.setRendering(true); studio.setPreviewing(true);
    // With In / Out marked, playback and export use only that part (FILM-09).
    const selectedPicture = project.tracks.filter(t=>t.kind==='picture').flatMap(t=>t.clips).find(c=>c.id===selected);
    if(exporting && scope==='clip' && !selectedPicture){studio.setRendering(false);studio.setMessage('Select a picture clip to export its shot.');return;}
    const range = exporting && scope==='film' ? undefined : exporting && scope==='clip' && selectedPicture ? {from:toSeconds(selectedPicture.start),to:toSeconds(selectedPicture.start+selectedPicture.duration)} : project.range ? { from: toSeconds(project.range.in), to: Math.min(studio.length, toSeconds(project.range.out)) } : undefined;
    const first = range?.from ?? 0, last = range?.to ?? studio.length;
    const from = exporting || studio.playhead >= last - .05 || studio.playhead < first ? first : studio.playhead; setTime(from);
    const resume = filming.pauseForPlayback();
    let reached = from;
    try {
      const blob = await render(project, studio.assets, canvas.current, controller.signal, (seconds) => { reached = seconds; setTime(seconds); }, exporting, from,
        exporting ? undefined : studio.setLevels, range);
      if (blob) {
        const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `genvr-episode-${project.tracks.find(t => t.kind === 'caption' && t.lang && !t.hidden)?.lang ?? 'original'}.webm`;
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); studio.setMessage('Sequence exported with its captions and attached dialogue audio.');
      }
    } catch (error) { if (!controller.signal.aborted) studio.setMessage(error instanceof Error ? error.message : 'Preview failed.'); }
    finally {
      resume(); studio.setRendering(false); cancel.current = null; studio.setLevels({});
      // Like professional editors the playhead stays where playback stopped, also on the last frame; Play from there starts over.
      if (!exporting) { studio.setPlayhead(reached); if (!live) draw(reached); }
    }
  };
  /** Moves the playhead and shows that frame on Program (no playback). */
  const showFrame = (seconds: number) => {
    const at = Math.max(0, Math.min(seconds, studio.length || 0));
    studio.setPlayhead(at);
    if (running || !studio.length) return;
    studio.setPreviewing(true);
    draw(at);
  };
  const keys = (event: KeyboardEvent) => {
    if ((event.target as HTMLElement).closest('input, textarea, select')) return;
    const ctrl = event.ctrlKey || event.metaKey, key = event.key.toLowerCase();
    if (key === ' ') { event.preventDefault(); if (running) cancel.current?.abort(); else void play(false); return; }
    // J / K / L: back one second, stop, play.
    if (!ctrl && key === 'k') { event.preventDefault(); cancel.current?.abort(); return; }
    if (!ctrl && key === 'l') { event.preventDefault(); if (!running) void play(false); return; }
    if (!ctrl && key === 'j') { event.preventDefault(); if (running) cancel.current?.abort(); else showFrame(studio.playhead - 1); return; }
    const chosen = !ctrl && !event.altKey ? TOOLS.find((t) => t.key === key) : undefined;
    if (chosen) { event.preventDefault(); setTool(chosen.id); return; }
    if ((key === 'arrowleft' || key === 'arrowright') && !ctrl && !running) {
      event.preventDefault(); showFrame(studio.playhead + ((key === 'arrowleft' ? -1 : 1) * (event.shiftKey ? 10 : 1) * project.rate.den) / project.rate.num); return;
    }
    const command = ctrl && key === 'k' ? ['clip.split', {}] : ctrl && key === 'z' && event.shiftKey ? ['edit.redo', {}] : ctrl && key === 'z' ? ['edit.undo', {}]
      : key === 'delete' || key === 'backspace' ? ['clip.remove', { ripple: rippleRef.current !== event.shiftKey }] : !ctrl && key === 'm' ? ['marker.add', {}]
      : !ctrl && key === 'i' ? ['range.set', { here: 'in' }] : !ctrl && key === 'o' ? ['range.set', { here: 'out' }]
      : ctrl && event.shiftKey && key === 'x' ? ['range.clear', {}] : null;
    if (!command || running || filming.busy) return;
    event.preventDefault(); studio.run(command[0] as string, command[1]);
  };
  // Shortcuts keep working after a toolbar button turns itself off and focus falls back to the page (FILM-TEST-01 D1).
  const keysRef = useRef(keys); keysRef.current = keys;
  useEffect(() => {
    const loose = (event: globalThis.KeyboardEvent) => {
      if (event.target === document.body && !event.defaultPrevented) keysRef.current(event as unknown as KeyboardEvent);
    };
    document.addEventListener('keydown', loose);
    return () => document.removeEventListener('keydown', loose);
  }, []);
  // Ctrl + wheel zooms the timeline around the pointer.
  useEffect(() => {
    const element = scroller.current; if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        // Zoom keeps the moment under the pointer in place.
        event.preventDefault();
        const left = (lanes.current?.getBoundingClientRect().left ?? 0), offset = event.clientX - element.getBoundingClientRect().left - HEAD;
        setZoom((z) => { anchor.current = { time: (event.clientX - left) / z, offset }; return Math.max(16, Math.min(320, Math.round(z * (event.deltaY < 0 ? 1.15 : 1 / 1.15)))); });
      } else if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        event.preventDefault(); element.scrollLeft += event.deltaX || event.deltaY;
      }
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);
  useLayoutEffect(() => {
    const element = scroller.current, a = anchor.current; anchor.current = null;
    if (element && a) element.scrollLeft = Math.max(0, a.time * zoom - a.offset);
  }, [zoom]);
  // The zoom bar follows the scroll position and the visible width.
  useEffect(() => {
    const element = scroller.current; if (!element) return;
    const update = () => setScroll({ left: element.scrollLeft, view: Math.max(1, element.clientWidth - HEAD) });
    update(); element.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update); observer.observe(element);
    return () => { element.removeEventListener('scroll', update); observer.disconnect(); };
  }, []);
  const seconds = (clientX: number) => (clientX - (lanes.current?.getBoundingClientRect().left ?? 0)) / zoom;
  /** Clip edges, the playhead and markers within 8 px pull a dragged edge onto them (Alt turns it off). */
  const snap = (value: number, except: string, free: boolean) => {
    if (free || !view.snapping) return Math.max(0, value);
    const targets = [0, studio.playhead, ...project.markers.map((m) => toSeconds(m.at)),
      ...project.tracks.flatMap((t) => t.clips.filter((c) => c.id !== except).flatMap((c) => [toSeconds(c.start), toSeconds(c.start + c.duration)]))];
    const near = targets.reduce((best, t) => Math.abs(t - value) < Math.abs(best - value) ? t : best, Infinity);
    return Math.abs(near - value) * zoom <= 8 ? near : Math.max(0, value);
  };
  const begin = (event: React.PointerEvent, clip: Clip, track: Track, part: Drag['part']) => {
    if (running || filming.busy || event.button !== 0) return;
    event.stopPropagation(); event.preventDefault();
    studio.select(clip.id);
    if (track.locked) { studio.setMessage(`Track ${track.name} is locked.`); return; }
    if (tool === 'razor') {
      const r = studio.run('clip.split', { at: snap(seconds(event.clientX), '', event.altKey), clips: [clip.id] });
      if (r.ok) studio.setMessage('Cut.');
      return;
    }
    const first: Drag = { part, clip: clip.id, track: track.id, kind: track.kind, start: toSeconds(clip.start), end: toSeconds(clip.start + clip.duration),
      x0: event.clientX, dx: 0, target: track.id, ripple: false, insert: false, tool };
    dragging.current = first; setDrag(first);
    // Listen from the first moment, so a quick release (or one outside the window) never leaves a drag held.
    const move = (e: PointerEvent) => {
      const d = dragging.current; if (!d) return;
      const lane = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-track]');
      const target = d.tool === 'select' && d.part === 'move' && lane && studio.project.tracks.find((t) => t.id === lane.dataset.track)?.kind === d.kind ? lane.dataset.track! : d.target;
      const next = { ...d, dx: e.clientX - d.x0, target, ripple: e.shiftKey, insert: e.ctrlKey || e.metaKey };
      dragging.current = next; setDrag(next);
    };
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      const d = dragging.current; dragging.current = null; setDrag(null);
      if (!d || e.type === 'pointercancel' || (Math.abs(e.clientX - d.x0) < 3 && d.target === d.track)) return;
      const result = ghost({ ...d, dx: e.clientX - d.x0 }, e.altKey), by = (e.clientX - d.x0) / zoom;
      const edge = d.part === 'start' ? result.start - d.start : result.end - d.end;
      const before = studio.project.tracks.find((t) => t.id === d.track)?.clips.find((c) => toSeconds(c.start + c.duration) === d.start);
      const r = d.part === 'move' && d.tool === 'slip' ? studio.run('clip.slip', { clip: d.clip, by: -by })
        : d.part === 'move' && d.tool === 'slide' ? studio.run('clip.slide', { clip: d.clip, by: result.start - d.start })
        : d.part === 'move' ? studio.run('clip.move', { clip: d.clip, start: result.start, mode: d.insert ? 'insert' : 'overwrite', ...(d.target !== d.track ? { track: d.target } : {}) })
        : d.tool === 'roll' ? (d.part === 'end' ? studio.run('clip.roll', { clip: d.clip, by: edge })
          : before ? studio.run('clip.roll', { clip: before.id, by: edge }) : studio.run('clip.trim', { clip: d.clip, edge: 'start', to: result.start }))
        : studio.run('clip.trim', { clip: d.clip, edge: d.part, to: d.part === 'start' ? result.start : result.end, ripple: (rippleRef.current !== e.shiftKey) || d.tool === 'ripple' });
      if (r.ok) studio.setMessage(`${studio.film.history.undoLabel ?? 'Edit'} done.`);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };
  /** Where a dragged clip would land (seconds), snapped. */
  const ghost = (d: Drag, free = false) => {
    const by = d.dx / zoom;
    if (d.part === 'move' && d.tool === 'slip') return { start: d.start, end: d.end };
    if (d.part === 'move') { const start = snap(d.start + by, d.clip, free); return { start, end: start + d.end - d.start }; }
    if (d.part === 'start') return { start: Math.min(snap(d.start + by, d.clip, free), d.end - .05), end: d.end };
    return { start: d.start, end: Math.max(snap(d.end + by, d.clip, free), d.start + .05) };
  };
  const scrubFrom = (event: React.PointerEvent<HTMLDivElement>) => {
    if (running || event.button !== 0) return;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Synthetic or already released pointer. */ }
    showFrame(seconds(event.clientX));
  };
  const width = Math.max(600, (studio.length + 5) * zoom);
  const monitors = <div className="flex h-full w-full bg-black">
    {workspace === 'edit' ? <SourceMonitor filming={filming} /> : null}
    <div className="relative flex min-w-0 flex-1">
      <ProgramMonitor filming={filming} canvas={canvas} time={playhead} playing={running} play={() => void play(false)}
        stop={() => cancel.current?.abort()} scrub={showFrame} />
      {live ? <button className="absolute top-9 left-3 rounded-lg bg-black/70 px-3 py-2 text-xs text-white" disabled={running}
        data-film-id="film.program.live" onClick={() => studio.setPreviewing(false)}>Return to live camera</button> : null}
    </div>
  </div>;
  const clipLabel = (clip: Clip) => clip.type === 'media' ? clip.name ?? project.media.find((m) => m.id === clip.media)?.name ?? 'Clip'
    : clip.type === 'caption' ? clip.text : clip.effect;
  const flashes = flashWarnings(project);
  const { above, below } = trackOrder(project.tracks);
  const inOut = project.range ? { from: toSeconds(project.range.in), to: toSeconds(project.range.out) } : null;
  const heightOf = (track: Track) => rowHeight(track.kind, view.rows);
  const resize = (kind: Track['kind']) => kind === 'picture' || kind === 'sound' ? (h: number) => setView({ rows: { ...view.rows, [kind]: h } }) : undefined;
  const toggleSize = (kind: Track['kind']) => kind === 'picture' || kind === 'sound'
    ? () => setView({ rows: { ...view.rows, [kind]: view.rows[kind] > 47 ? 30 : 64 } }) : undefined;
  const group = 'flex shrink-0 items-center gap-1 rounded-lg border border-ink/10 bg-paper/60 p-0.5';
  const lane = (track: Track) => {
    const h = heightOf(track);
    return <div key={track.id} data-track={track.id} data-film-id={`film.timeline.track.${track.name}`}
      className={`relative ${track.hidden || track.muted ? 'opacity-40' : ''}`}
      style={{ height: h, background: drag && drag.target === track.id && drag.target !== drag.track ? '#2a3346' : TL.row, borderBottom: `1px solid ${TL.line}` }}>
      {inOut ? <span aria-hidden className="pointer-events-none absolute inset-y-0" style={{ left: inOut.from * zoom, width: (inOut.to - inOut.from) * zoom, background: TL.range }} /> : null}
      {track.clips.map((clip) => {
        const media = clip.type === 'media' ? project.media.find((m) => m.id === clip.media) : undefined;
        const moving = drag?.clip === clip.id ? ghost(drag) : null;
        if (moving && drag!.target !== track.id) return null;
        const left = (moving?.start ?? toSeconds(clip.start)) * zoom, length = moving ? moving.end - moving.start : toSeconds(clip.duration), size = length * zoom;
        const chosen = clip.id === selected;
        const inside = !!inOut && toSeconds(clip.start) >= inOut.from && toSeconds(clip.start + clip.duration) <= inOut.to;
        return <div key={clip.id} role="button" tabIndex={-1} aria-pressed={chosen} data-film-id={`film.timeline.clip.${clip.id}`}
          title={`${clipLabel(clip)} · ${toSeconds(clip.duration).toFixed(2)}s · drag to move (Ctrl: insert), drag an edge to trim (Ripple button decides if later clips follow; Shift: the opposite; Alt: no snap)`}
          style={{ left, width: Math.max(2, size), top: 1, height: h - 3, ...clipBox(clip, media, chosen, inside) }}
          onPointerDown={(e) => begin(e, clip, track, 'move')}
          className={`absolute ${tool === 'razor' ? 'cursor-crosshair' : tool === 'slip' || tool === 'slide' ? 'cursor-ew-resize' : 'cursor-grab'} overflow-hidden text-left ${moving ? 'z-20 opacity-80 shadow-lg' : ''}`}>
          <ClipFace clip={clip} track={track} media={media} blob={media ? studio.assets.find((a) => a.id === media.asset)?.blob : undefined}
            zoom={zoom} height={h - 3} label={clipLabel(clip)} seconds={length} fps={project.rate.num / project.rate.den} show={{ pictures: view.pictures, strip: view.strip, waves: view.waves }} />
          {media && !moving ? media.cues.map((cue) => {
            const from = Math.max(toSeconds(cue.start), toSeconds((clip as { in: number }).in)), to = Math.min(toSeconds(cue.end), toSeconds((clip as { in: number }).in + clip.duration));
            if (to <= from) return null;
            return <span key={cue.id} title={`${cue.label}: ${cue.text || cue.action}`} style={{ left: (from - toSeconds((clip as { in: number }).in)) * zoom, width: Math.max(2, (to - from) * zoom) }}
              className={`pointer-events-none absolute bottom-0 h-1 ${cue.text ? 'bg-amber-400' : 'bg-fuchsia-400'}`} />;
          }) : null}
          {chosen && !moving && (clip.type === 'media' || clip.type === 'effect' || clip.type === 'caption') ? <KeyLane filming={filming} clip={clip} zoom={zoom} /> : null}
          <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize hover:bg-white/40" onPointerDown={(e) => begin(e, clip, track, 'start')} />
          <span aria-hidden className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize hover:bg-white/40" onPointerDown={(e) => begin(e, clip, track, 'end')} />
        </div>;
      })}
      {track.clips.flatMap((c) => c.type === 'media' && c.transition ? [c] : []).map((c) => {
        const w = transitionWindow(c, c.transition as TransitionSpec), wide = toSeconds(w.to - w.from) * zoom;
        return <span key={`tr-${c.id}`} title={`Transition: ${c.transition!.kind} · ${toSeconds(c.transition!.duration).toFixed(2)} s`} data-film-id={`film.timeline.transition.${c.id}`}
          style={{ left: toSeconds(w.from) * zoom, width: Math.max(4, wide), top: h >= 34 ? 17 : 1, bottom: 2 }}
          className="pointer-events-none absolute z-10 flex items-center justify-center overflow-hidden border border-[#ebebeb] bg-black/35 bg-[repeating-linear-gradient(45deg,rgba(217,217,217,.43)_0_1px,transparent_1px_4px)]">
          {track.kind === 'sound' ? <SoundCrossfade />
            : wide > 40 ? <span className="rounded-sm bg-black/65 px-1 text-[10.5px] text-white">{c.transition!.kind}</span> : null}</span>;
      })}
      {drag && drag.target === track.id && drag.target !== drag.track ? (() => { const g = ghost(drag);
        return <div className="pointer-events-none absolute rounded border-2 border-dashed border-sky-400 bg-sky-400/20" style={{ left: g.start * zoom, width: (g.end - g.start) * zoom, top: 1, height: h - 3 }} />; })() : null}
    </div>;
  };
  const divider = <div aria-hidden style={{ height: 6, background: TL.divider }} />;
  return <section aria-label="Video editor" data-film-id="film.timeline" tabIndex={0} onKeyDown={keys} className={`flex h-full min-h-0 flex-col bg-surface text-ink outline-none ${FONT_CLASSES}`}>
    {stage ? createPortal(monitors, stage) : <div className="hidden">{monitors}</div>}
    {/* One toolbar row; on narrow screens it scrolls sideways so the tracks keep their room. */}
    <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-ink/10 px-3 py-1.5 [&>*]:shrink-0 [scrollbar-width:thin]">
      <WorkspaceSwitch filming={filming} />
      <button className={`${button} !border-red-500/50`} data-film-id="film.record" disabled={!studio.ready || filming.busy || running} onClick={() => { studio.setWorkspace('shoot'); record(filming); }}><Circle className="size-3 fill-red-500 text-red-500" />Record shot</button>
      <div className={group} aria-label="Edit">
        <Command filming={filming} id="clip.split" title="Split at the playhead (Ctrl+K)"><Scissors className="size-3.5" />Split</Command>
        <Command filming={filming} id="clip.remove" args={{ ripple: view.ripple }} title={view.ripple ? 'Delete and close the gap (Delete; Shift+Delete leaves a gap)' : 'Delete and leave a gap (Delete; Shift+Delete closes it)'}><Trash2 className="size-3.5" /></Command>
        <button type="button" aria-pressed={view.ripple} data-film-id="film.timeline.ripple" className={`${button} ${view.ripple ? '!bg-ink !text-paper' : ''}`}
          title={view.ripple ? 'Ripple on: cutting or deleting moves everything after it on every track (Shift: not this time)' : 'Ripple off: cuts leave gaps (Shift: ripple this time)'}
          onClick={() => setView({ ripple: !view.ripple })}><ChevronsRight className="size-3.5" />Ripple</button>
        <Command filming={filming} id="marker.add" title="Add a marker (M)"><Bookmark className="size-3.5" /></Command>
      </div>
      <div className={group} aria-label="Add">
        <Command filming={filming} id="caption.add" args={{ text: 'New caption' }}><Type className="size-3.5" />Caption</Command>
        <TitleMenu filming={filming} />
        <AdjustmentMenu filming={filming} />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <div className={group} aria-label="History">
          <Command filming={filming} id="edit.undo" name="Undo" title={studio.undoLabel ? `Undo ${studio.undoLabel}` : 'Nothing to undo.'}><Undo2 className="size-3.5" /></Command>
          <Command filming={filming} id="edit.redo" name="Redo" title={studio.redoLabel ? `Redo ${studio.redoLabel}` : 'Nothing to redo.'}><Redo2 className="size-3.5" /></Command>
        </div>
        <div className={group} aria-label="File">
          <button className={button} title="Save project file (.genvrfilm)" aria-label="Save project file" disabled={running || filming.busy || !studio.ready}
            onClick={() => void studio.downloadFile().catch((e) => studio.setMessage(e instanceof Error ? e.message : 'Save failed.'))}><Save className="size-3.5" /></button>
          <button className={button} title="Open project file (.genvrfilm)" aria-label="Open project file" disabled={running || filming.busy || !studio.ready}
            onClick={() => file.current?.click()}><FolderOpen className="size-3.5" /></button>
          <input ref={file} type="file" accept=".genvrfilm" className="hidden" onChange={(e) => {
            const chosen = e.target.files?.[0]; e.target.value = '';
            if (chosen && window.confirm(`Open ${chosen.name} in place of this film? Your current film is kept and the Restore button brings it back.`))
              void studio.openFile(chosen).catch((error) => studio.setMessage(error instanceof Error ? error.message : 'Open failed.'));
          }} />
          {studio.previous ? <button className={button} title="Bring back the film that was open before the last Open" data-film-id="film.file.restore" disabled={running || filming.busy || !studio.ready}
            onClick={() => { if (window.confirm('Bring back the previous film in place of this one?')) void studio.restorePrevious().catch((e) => studio.setMessage(e instanceof Error ? e.message : 'Restore failed.')); }}>Restore</button> : null}
        </div>
        <select aria-label="Export scope" className="rounded border border-ink/15 bg-paper px-2 py-1 text-xs" value={exportScope} onChange={e=>setExportScope(e.target.value as typeof exportScope)} disabled={running||filming.busy}><option value="film">Full film</option><option value="clip">Selected shot</option><option value="range" disabled={!project.range}>Marked range</option></select>
        <button className="inline-flex items-center justify-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-bold text-on-brand hover:opacity-90 disabled:opacity-35" data-film-id="film.export" disabled={!studio.length || running || filming.busy}
          onClick={() => { if (!flashes.length || window.confirm(`${flashes.join('\n')}\n\nFlashing can hurt people with photosensitive epilepsy. Export anyway?`)) void play(true,exportScope); }}>
          <Download className="size-3.5" />Export</button>
      </div>
    </div>
    <div className="flex min-h-0 flex-1" style={{ background: TL.panel, color: TL.text }}>
      <div className="flex min-h-0 w-9 shrink-0 flex-col items-center gap-1 py-2" role="toolbar" aria-label="Editing tools" style={{ background: TL.panel, borderRight: `4px solid ${TL.divider}` }}>
        {TOOLS.map(({ id, key, label, hint, icon: Icon }) => <button key={id} title={`${label} (${key.toUpperCase()}): ${hint}`} aria-label={label} aria-pressed={tool === id}
          data-film-id={`film.tool.${id}`} onClick={() => setTool(id)}
          className="inline-flex size-[26px] items-center justify-center rounded-[3px] hover:bg-[#2c2c2c]" style={tool === id ? { background: TL.accent, color: '#fff' } : { color: TL.dim }}>
          <Icon className="size-4" /></button>)}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div ref={scroller} aria-label="Shot timeline" className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="relative flex min-h-full" style={{ width: width + HEAD }}>
          <div className="sticky left-0 z-20 shrink-0" style={{ width: HEAD, background: TL.head, borderRight: `1px solid ${TL.line}` }}>
            <div className="sticky top-0 z-10 flex h-10 items-center gap-1 px-2" style={{ background: TL.head, borderBottom: `1px solid ${TL.line}` }}>
              <span className="font-mono text-[15px] tabular-nums" style={{ color: TL.timecode }} data-film-id="film.timeline.timecode">{timecode(fromSeconds(playhead), project.rate)}</span>
              <Toggle on={view.snapping} className="ml-auto" title={view.snapping ? 'Snap on (Alt while dragging skips it)' : 'Snap off'} id="film.timeline.snap"
                onClick={() => setView({ snapping: !view.snapping })}><Magnet className="size-3.5" /></Toggle>
              <details className="relative" data-film-id="film.timeline.view">
                <summary className="inline-flex size-6 cursor-pointer list-none items-center justify-center rounded hover:bg-white/10" title="Timeline view"><SlidersHorizontal className="size-3.5" /></summary>
                <div className="absolute left-0 top-7 z-30 w-44 space-y-1 rounded-lg p-2 text-xs shadow-xl" style={{ background: '#252525', border: `1px solid ${TL.line}` }}>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={view.pictures} onChange={(e) => setView({ pictures: e.target.checked })} />Show pictures</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={view.strip} disabled={!view.pictures} onChange={(e) => setView({ strip: e.target.checked })} />Pictures all along</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={view.waves} onChange={(e) => setView({ waves: e.target.checked })} />Sound waveforms</label>
                  <div className="flex gap-1 pt-1">
                    <button className="flex-1 rounded bg-white/10 px-1 py-1 hover:bg-white/20" onClick={() => setView({ rows: { picture: 26, sound: 26 } })}>Minimize</button>
                    <button className="flex-1 rounded bg-white/10 px-1 py-1 hover:bg-white/20" onClick={() => setView({ rows: ROWS_DEFAULT })}>Default</button>
                    <button className="flex-1 rounded bg-white/10 px-1 py-1 hover:bg-white/20" onClick={() => setView({ rows: { picture: 64, sound: 64 } })}>Expand</button>
                  </div>
                  <label className="flex items-center gap-2 pt-1" title="Ctrl + wheel on the timeline also zooms">Zoom
                    <input aria-label="Timeline zoom" type="range" min={16} max={320} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full" /></label>
                </div>
              </details>
            </div>
            {above.map((track) => <TrackHeader key={track.id} filming={filming} track={track} height={heightOf(track)} onResize={resize(track.kind)} onToggleSize={toggleSize(track.kind)} />)}
            {divider}
            {below.map((track) => <TrackHeader key={track.id} filming={filming} track={track} height={heightOf(track)} onResize={resize(track.kind)} onToggleSize={toggleSize(track.kind)} />)}
            <div className="flex items-center gap-1 px-2 py-1.5 text-[10px]" style={{ color: TL.dim }}>Add
              {(['picture', 'sound', 'caption'] as const).map((kind) => { const Icon = KIND[kind].icon;
                return <button key={kind} className="inline-flex h-6 items-center gap-0.5 rounded px-1.5 hover:bg-white/10 disabled:opacity-35" title={`Add ${kind} track`} aria-label={`Add ${kind} track`} data-film-id={`film.track.add.${kind}`}
                  disabled={running || filming.busy || !!studio.film.reason('track.add', { kind })}
                  onClick={() => studio.run('track.add', { kind })}><Plus className="size-2.5" /><Icon className="size-3" /></button>; })}
            </div>
          </div>
          <div ref={lanes} className="relative flex-1 select-none">
            <div className="sticky top-0 z-10">
              <Ruler project={project} zoom={zoom} width={width} range={inOut} onScrub={scrubFrom} onDrag={(e) => { if (e.buttons & 1 && !running) showFrame(seconds(e.clientX)); }} />
            </div>
            {above.map(lane)}
            {divider}
            {below.map(lane)}
            <div style={{ left: playhead * zoom }} className="pointer-events-none absolute inset-y-0 z-10 w-px" data-film-id="film.timeline.playhead">
              <span className="absolute inset-y-0 left-0 w-px" style={{ background: TL.playhead }} />
              <span className="sticky top-0 block h-0"><span className="absolute -left-[6px] top-[26px] h-[14px] w-[13px] [clip-path:polygon(0_0,100%_0,100%_55%,50%_100%,0_55%)]" style={{ background: TL.playhead }} /></span>
            </div>
            {!studio.length ? <div className="absolute top-16 left-8 max-w-sm text-xs" style={{ color: TL.dim }}>Your recorded shots appear here. Choose a camera on the left and prepare characters, dialogue and motion on the right.</div> : null}
          </div>
        </div>
      </div>
      <ZoomBar left={scroll.left} view={scroll.view} content={width} head={HEAD}
        onScroll={(left) => { if (scroller.current) scroller.current.scrollLeft = left; }}
        onZoom={(next, keep) => { anchor.current = keep; setZoom(Math.max(16, Math.min(320, Math.round(next)))); }} zoom={zoom} />
      </div>
      <Meters filming={filming} />
    </div>
    <div role="status" className="flex shrink-0 items-center justify-between border-t border-ink/10 px-3 py-1 text-[10px] text-ink/50">
      <span>{flashes.length ? <b className="text-amber-500" title={flashes.join('\n')}>⚠ {flashes.length} flash warning{flashes.length > 1 ? 's' : ''} · </b> : null}{studio.message}</span><span>LOCAL PROJECT · {project.tracks.length} TRACKS · {project.media.length} RECORDINGS · 180s / 128 MB</span>
    </div>
  </section>;
}

/** Scene tools replace world-building properties only in the filming workspace. */
export function VideoSceneInspector({ filming }: { filming: StudioFilming }) {
  const workspace = filming.studio.workspace;
  if (workspace === 'captions') return <CaptionsPanel filming={filming} />;
  if (workspace === 'transitions') return <TransitionsWorkspace filming={filming} />;
  if (workspace === 'sound') return <SoundPanel filming={filming} />;
  if (workspace === 'colour') return <ColourPanel filming={filming} />;
  return <InspectorBody filming={filming} mode={workspace === 'edit' ? 'clip' : 'scene'} />;
}

/** Shoot shows the Scene panel (cues for the next take, shot workflow); Edit shows the Clip panel. */
function InspectorBody({ filming, mode }: { filming: StudioFilming; mode: 'scene' | 'clip' }) {
  const studio = filming.studio, { project, selected, rendering: running } = studio;
  const host = useStudioHost();
  const [choosingAvatar, setChoosingAvatar] = useState(false), avatarDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (choosingAvatar) avatarDialog.current?.showModal(); else avatarDialog.current?.close(); }, [choosingAvatar]);
  const located = selected ? project.tracks.map((t) => ({ track: t, clip: t.clips.find((c) => c.id === selected) })).find((x) => x.clip) : undefined;
  const clip = located?.clip, media = clip?.type === 'media' ? project.media.find((m) => m.id === clip.media) : undefined;
  const [start, setStart] = useState(0), [sourceIn, setSourceIn] = useState(0), [sourceOut, setSourceOut] = useState(0), [ripple, setRipple] = useState(true);
  const [actor, setActor] = useState('self'), [action, setAction] = useState('none'), [dialogue, setDialogue] = useState('');
  /** FILM-10: the avatar's start spot and walk-to spots for the next cue (world metres). */
  const [spot, setSpot] = useState<{ x: number; z: number } | null>(null), [path, setPath] = useState<Array<{ x: number; z: number }>>([]);
  const spotText = (p: { x: number; z: number }) => `${p.x.toFixed(1)}, ${p.z.toFixed(1)}`;
  const avatarSpot = () => { const p = filming.avatarSpot(); if (!p) throw new Error('The avatar is not in the world yet.'); return p; };
  const [cueStart, setCueStart] = useState(0), [cueEnd, setCueEnd] = useState(3);
  const actors = filming.actors();
  const [inspectorTab, setInspectorTab] = useState<'scene' | 'voices' | 'shot'>(filming.voiceAvailable ? 'voices' : 'scene');
  const inspectorId = useId();
  const inspectorTabs = [{ id: 'scene' as const, label: 'Scene', icon: Users }, { id: 'voices' as const, label: 'Voices', icon: Mic }, { id: 'shot' as const, label: 'Shot', icon: Film }];
  const importing = useRef(new Set<AbortController>());
  useEffect(() => () => { for (const controller of importing.current) controller.abort(); importing.current.clear(); }, [studio.identity, selected]);
  useEffect(() => {
    if (!clip) return;
    setStart(toSeconds(clip.start));
    if (clip.type === 'media') { setSourceIn(toSeconds(clip.in)); setSourceOut(toSeconds(clip.in + clip.duration)); }
  }, [clip]);
  const disabled = running || filming.busy;
  const number = (label: string, value: number, update: (n: number) => void, max = 180) =>
    <label className="text-xs text-ink/60">{label}<input aria-label={label} className={input} type="number" min={0} max={max} step="0.01" value={Math.round(value * 100) / 100} onChange={(e) => update(Number(e.target.value))} /></label>;
  const applyTrim = () => {
    if (clip?.type !== 'media') return;
    const byStart = sourceIn - toSeconds(clip.in), byEnd = (sourceOut - sourceIn) - (toSeconds(clip.duration) - byStart);
    const steps = [...(Math.abs(byStart) > 1e-6 ? [{ id: 'clip.trim', args: { clip: clip.id, edge: 'start', by: byStart, ripple } }] : []),
      ...(Math.abs(byEnd) > 1e-6 ? [{ id: 'clip.trim', args: { clip: clip.id, edge: 'end', by: byEnd, ripple } }] : [])];
    if (steps.length) studio.batch(steps, { label: ripple ? 'Ripple trim' : 'Trim' });
  };
  return <div className="space-y-4 px-3 pb-3 text-ink">
    {host.userAvatarControls ? createPortal(<dialog ref={avatarDialog} aria-label="Choose scene avatar" onCancel={() => setChoosingAvatar(false)} onClose={() => setChoosingAvatar(false)} className="m-auto max-h-[85vh] w-[min(48rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-ink/20 bg-paper p-0 text-ink shadow-xl backdrop:bg-black/60">
      <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3"><h2 className="flex items-center gap-2 text-sm font-semibold"><Users className="size-4" />Choose scene avatar</h2><button className={button} onClick={() => setChoosingAvatar(false)}>Done</button></div>
      <p className="px-4 pt-3 text-xs text-ink/60">Choose from your available character library. The chosen character replaces My avatar in the live world. Record a new take to use it in the film; existing recordings keep their original character.</p>
      <div className="max-h-[65vh] overflow-y-auto p-4">{choosingAvatar ? host.userAvatarControls('characters') : null}</div>
    </dialog>, document.body) : null}
    <label className="block text-xs font-semibold">Production mode<select aria-label="Filming mode" value={studio.mode} disabled={disabled} className={input}
      onChange={(e) => studio.setMode(e.target.value as 'gameplay' | 'production')}>
      <option value="production">Film / series</option><option value="gameplay">Gameplay recording</option>
    </select></label>
    {mode === 'clip' ? <fieldset disabled={disabled} data-film-id="film.clip" className="space-y-3 rounded-lg border border-ink/10 p-3">
      <legend className="flex items-center gap-1 px-1 text-xs font-semibold"><Scissors className="size-3.5" />{clip ? `${located!.track.name} · ${clip.type === 'media' ? clip.name ?? media?.name : clip.type}` : 'Clip properties'}</legend>
      {clip ? <>
        <div className="flex items-end gap-2">{number('Clip start (film s)', start, setStart)}
          <button className={button} onClick={() => studio.run('clip.move', { clip: clip.id, start })}>Move</button></div>
        {clip.type === 'media' ? <>
          <div className="grid grid-cols-2 gap-2">{number('Source in', sourceIn, setSourceIn, toSeconds(media?.duration ?? 0))}{number('Source out', sourceOut, setSourceOut, toSeconds(media?.duration ?? 0))}</div>
          <label className="flex items-center gap-2 text-xs text-ink/60"><input type="checkbox" checked={ripple} onChange={(e) => setRipple(e.target.checked)} />Ripple (later clips follow)</label>
          <button className={`${button} w-full`} onClick={applyTrim}>Apply trim</button>
        </> : null}
        {clip.type === 'caption' ? <TitlePanel filming={filming} clip={clip} locked={located!.track.locked} /> : null}
        {clip.type === 'media' ? <TransitionPanel filming={filming} clip={clip} locked={located!.track.locked} /> : null}
        {clip.type === 'media' || clip.type === 'effect' ? <LayerControls filming={filming} clip={clip} locked={located!.track.locked} /> : null}
        <div className="grid grid-cols-2 gap-2">
          <Command filming={filming} id="clip.split" args={{ clips: [clip.id] }}><Scissors className="size-3" />Split at playhead</Command>
          <Command filming={filming} id="clip.remove" args={{ clips: [clip.id], ripple: true }}><Trash2 className="size-3" />Ripple delete</Command>
        </div>
      </> : <p className="text-xs text-ink/45">Select a timeline clip to edit it. Drag clips to move, drag an edge to trim (with Ripple on, everything after follows on every track; Shift: the opposite). Keys: Ctrl+K split, Delete, Shift+Delete (the opposite of Ripple), Ctrl+Z undo, M marker, Space play, Left/Right frame.</p>}
    </fieldset> : null}
    {mode === 'scene' ? <>
    <div role="tablist" aria-label="Scene inspector tools" className="sticky top-0 z-10 grid grid-cols-3 border-b border-ink/15 bg-paper">
      {inspectorTabs.map(({ id, label, icon: Icon }, index) => <button key={id} id={`${inspectorId}-${id}`} role="tab" aria-selected={inspectorTab === id} aria-controls={`${inspectorId}-panel`} tabIndex={inspectorTab === id ? 0 : -1}
        onClick={() => setInspectorTab(id)} onKeyDown={event => {
          const next = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : -1;
          if (next < 0) return; event.preventDefault(); setInspectorTab(inspectorTabs[next]!.id);
          (event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next])?.focus();
        }} className={`flex min-w-0 flex-col items-center gap-1 border-b-2 px-1 py-2.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${inspectorTab === id ? 'border-brand text-ink' : 'border-transparent text-ink/50 hover:bg-ink/5 hover:text-ink'}`}><Icon className="size-4" />{label}</button>)}
    </div>
    <div id={`${inspectorId}-panel`} role="tabpanel" aria-labelledby={`${inspectorId}-${inspectorTab}`} className="space-y-3">
    {inspectorTab === 'voices' ? <section aria-label="Scene voices" className="space-y-3">
      <div className="flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-semibold"><Mic className="size-4" />Dialogue & saved voices</h3><span className="text-xs text-ink/50">{studio.plan.filter(cue => cue.actor !== SCENE_ACTOR && cue.text.trim()).length} lines</span></div>
      <p className="text-xs leading-relaxed text-ink/60">Choose a character, write a line, then select one of your saved voices below.</p>
      {host.userAvatarControls ? <button className={`${button} w-full`} disabled={disabled} onClick={() => setChoosingAvatar(true)}><Users className="size-3.5" />Choose avatar from library</button> : null}
      <details open={!studio.plan.some(cue => cue.actor !== SCENE_ACTOR && cue.text.trim())} className="space-y-2 border-y border-ink/10 py-2"><summary className="cursor-pointer text-xs font-semibold">Add dialogue line</summary>
      <label className="block text-xs">Character<select aria-label="Dialogue character" className={input} value={actor === SCENE_ACTOR ? 'self' : actor} disabled={disabled} onChange={event => setActor(event.target.value)}>{actors.filter(a => a.id !== SCENE_ACTOR).map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
      <label className="block text-xs">New dialogue<textarea aria-label="New scene dialogue" className={input} rows={3} value={dialogue} maxLength={500} disabled={disabled} placeholder="Write what this character says…" onChange={event => setDialogue(event.target.value)} /></label>
      <button className={`${button} w-full`} disabled={disabled || !dialogue.trim() || studio.plan.length >= 30} onClick={() => attempt(filming, () => {
        const speaker = actor === SCENE_ACTOR ? 'self' : actor;
        studio.setPlan([...studio.plan, { id: crypto.randomUUID(), actor: speaker, label: actors.find(a => a.id === speaker)?.label ?? speaker, action: 'none', start: 0, end: filming.output.seconds, text: dialogue.trim(), volume: 1 }]); setDialogue('');
      })}><Plus className="size-3.5" />Add dialogue line</button>
      </details>
      <button className={`${button} w-full`} disabled={disabled} onClick={() => studio.setWorkspace('captions')}><Languages className="size-3.5" />Captions & dubbing</button>
    </section> : null}
    {inspectorTab === 'scene' ? <fieldset aria-label="Scene dialogue and motion" data-film-id="film.scene" disabled={disabled} className="space-y-3 rounded-lg border border-ink/10 p-3">
      <legend className="px-1 text-xs font-semibold">Characters · dialogue · motion</legend>
      <label className="block text-xs text-ink/60">Shot length (seconds)<input aria-label="Shot length (seconds)" data-film-id="film.scene.length" className={input} type="number" min={1} max={30} step="0.5"
        value={filming.output.seconds} onChange={(e) => { const seconds = Number(e.target.value); if (seconds >= 1 && seconds <= 30) filming.setOutput({ ...filming.output, seconds }); }} /></label>
      <label className="block text-xs text-ink/60">Character<select aria-label="Scene character" value={actor} className={input} onChange={(e) => { setActor(e.target.value); setAction('none'); }}>
        {actors.map((a) => <option key={a.id} value={a.id}>{a.label} · {a.id === 'self' ? 'avatar' : a.id.slice(-5)}</option>)}
      </select></label>
      {host.userAvatarControls ? <button className={`${button} w-full`} disabled={disabled} onClick={() => setChoosingAvatar(true)}><Users className="size-3.5" />Choose avatar from library</button> : null}
      <label className="block text-xs text-ink/60">Action<select aria-label="Scene action" value={action} className={input} onChange={(e) => setAction(e.target.value)}>
        <option value="none">No movement</option>
        {(actor === 'self' ? filming.actions : actor === SCENE_ACTOR ? [...SCENE_FX_ACTIONS] : ['dance', 'bob', 'spin', 'sway', 'run'].map((id) => ({ id, label: id === 'run' ? 'run (walk its spots faster)' : id }))).map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
      </select></label>
      <div className="grid grid-cols-2 gap-2">{number('Cue start', cueStart, setCueStart, 30)}{number('Cue end', cueEnd, setCueEnd, 30)}</div>
      {actor !== SCENE_ACTOR ? <div data-film-id="film.scene.places" className="space-y-2 rounded-md bg-paper/40 p-2 text-xs text-ink/60">
        <p>{actor === 'self' ? 'Places: Pick, then click the ground in the world; or Here for where your avatar stands.' : 'Places: Pick, then click the ground in the world. The object walks there (Run: faster).'}</p>
        <div className="flex items-center justify-between gap-2"><span>Start <strong className="text-ink">{spot ? spotText(spot) : 'where it stands'}</strong></span>
          <span className="flex gap-1"><button type="button" className={button} data-film-id="film.scene.start.pick" onClick={() => void filming.pickSpot().then((p) => { if (p) setSpot(p); })}>Pick</button>
            {actor === 'self' ? <button type="button" className={button} onClick={() => attempt(filming, () => setSpot(avatarSpot()))}>Here</button> : null}
            {spot ? <button type="button" className={button} onClick={() => setSpot(null)}>Clear</button> : null}</span></div>
        <div className="flex items-center justify-between gap-2"><span>Walk to <strong className="text-ink">{path.length ? path.map(spotText).join(' → ') : 'nowhere'}</strong></span>
          <span className="flex gap-1"><button type="button" className={button} data-film-id="film.scene.walk.pick" disabled={path.length >= 8} onClick={() => void filming.pickSpot().then((p) => { if (p) setPath((list) => [...list, p].slice(0, 8)); })}>Pick</button>
            {actor === 'self' ? <button type="button" className={button} disabled={path.length >= 8} onClick={() => attempt(filming, () => setPath((p) => [...p, avatarSpot()]))}>Here</button> : null}
            {path.length ? <button type="button" className={button} onClick={() => setPath([])}>Clear</button> : null}</span></div>
      </div> : null}
      <label className="block text-xs text-ink/60">Dialogue text<textarea aria-label="Dialogue text" className={input} rows={3} maxLength={500} value={dialogue} onChange={(e) => setDialogue(e.target.value)} /></label>
      <button className={`${button} w-full`} onClick={() => attempt(filming, () => {
        if (!Number.isFinite(cueStart) || !Number.isFinite(cueEnd) || cueStart < 0 || cueEnd <= cueStart || cueEnd > 30 || studio.plan.length >= 30)
          throw new Error('Use up to 30 cues with start/end inside 0–30 seconds.');
        studio.setPlan([...studio.plan, { id: crypto.randomUUID(), actor, label: actors.find((a) => a.id === actor)?.label ?? actor, action, start: cueStart, end: cueEnd, text: dialogue, volume: 1,
          ...(actor !== SCENE_ACTOR && spot ? { at: spot } : {}), ...(actor !== SCENE_ACTOR && path.length ? { to: path } : {}) }]);
        setSpot(null); setPath([]);
      })}><Plus className="size-3" />Add scene cue</button>
      {media?.cues.length ? <button className={`${button} w-full`} onClick={() => attempt(filming, () =>
        studio.setPlan(media.cues.map((c) => ({ ...c, start: toSeconds(c.start), end: toSeconds(c.end) }))))}>Load this shot's cues</button> : null}
      {media ? <button className={`${button} w-full`} onClick={() => attempt(filming, () => {
        const limit = toSeconds(media.duration);
        studio.must('cues.set', { media: media.id, cues: studio.plan.map((c) => ({ ...c, end: Math.min(c.end, limit) })).filter((c) => c.start < c.end) });
        studio.setMessage('Dialogue saved. Re-record to apply changed actor motion.');
      })}>Save scene cues to this shot</button> : null}
    </fieldset> : null}
    {inspectorTab !== 'shot' ? <div className="space-y-2">{studio.plan.filter(cue => inspectorTab === 'scene' || (cue.actor !== SCENE_ACTOR && cue.text.trim())).map((cue) => <div key={cue.id} className="space-y-2 rounded-lg border border-ink/10 bg-paper/40 p-3 text-xs">
      <div className="flex items-center justify-between"><strong className="truncate">{cue.label}</strong><button aria-label={`Remove cue ${cue.id}`} className={button} disabled={disabled}
        onClick={() => attempt(filming, () => studio.setPlan(studio.plan.filter((c) => c.id !== cue.id)))}><Trash2 className="size-3" /></button></div>
      <p className="text-ink/50">{cue.action === 'none' ? 'Dialogue only' : filming.actions.find(a => a.id === cue.action)?.label ?? cue.action} · {cue.start}–{cue.end}s</p>{inspectorTab === 'scene' ? <p className="break-words">{cue.text}</p> : null}
      {cue.at || cue.to?.length ? <p className="text-ink/50">{cue.at ? `From ${spotText(cue.at)}` : 'From where it stands'}{cue.to?.length ? ` → ${cue.to.map(spotText).join(' → ')}` : ''}</p> : null}
      {inspectorTab === 'voices' ? <label className="block">Dialogue<textarea aria-label={`Dialogue for ${cue.id}`} className={input} rows={2} maxLength={500} value={cue.text} disabled={disabled} onChange={event => studio.setPlan(previous => previous.map(c => c.id === cue.id ? { ...c, text: event.target.value, audio: undefined, voice: undefined } : c))} /></label> : null}
      {inspectorTab === 'voices' && cue.actor !== SCENE_ACTOR ? <SceneVoice filming={filming} cue={cue} disabled={disabled} /> : null}
      {inspectorTab === 'voices' ? <details className="border-t border-ink/10 pt-2"><summary className="cursor-pointer text-xs text-ink/60">Audio file & volume</summary>
      <label className="mt-2 block">Import audio<input aria-label={`Audio for ${cue.id}`} type="file" accept="audio/*" disabled={disabled} className="mt-1 w-full text-[10px]" onChange={(e) => {
        const chosen = e.target.files?.[0]; if (!chosen) return;
        const controller = new AbortController(); importing.current.add(controller);
        void mediaDuration(chosen, controller.signal).then((duration) => {
          if (controller.signal.aborted) return;
          if (duration > 180) throw new Error('Choose audio up to 180 seconds.');
          attempt(filming, () => { const audio = studio.addAudio(chosen); studio.setPlan((previous) => previous.map((c) => c.id === cue.id ? { ...c, audio, voice: undefined } : c)); });
        }).catch((error) => { if (!controller.signal.aborted) studio.setMessage(error instanceof Error ? error.message : 'Audio could not be decoded.'); })
          .finally(() => importing.current.delete(controller));
      }} /></label>
      {cue.audio ? <p className="text-emerald-600">Audio attached</p> : null}
      <label className="block text-ink/60">Volume<input key={`${cue.id}-${cue.volume}`} aria-label={`Volume for ${cue.id}`} className={input} type="number" min={0} max={2} step="0.1" defaultValue={cue.volume} disabled={disabled}
        onBlur={(e) => { const volume = Number(e.target.value); if (volume !== cue.volume) attempt(filming, () => studio.setPlan((previous) => previous.map((c) => c.id === cue.id ? { ...c, volume } : c))); }} /></label>
      </details> : null}
    </div>)}</div> : null}
    {inspectorTab === 'shot' && media ? <fieldset aria-label="Shot workflow" disabled={disabled} className="space-y-2 rounded-lg border border-ink/10 p-3">
      <legend className="px-1 text-xs font-semibold">Shot workflow</legend>
      <div className="border-l-2 border-brand/30 pl-3 text-xs text-ink/50">World → camera → character cues → capture → trim → output</div>
      <button className={`${button} w-full`} onClick={() => media.camera ? filming.apply(media.camera) : filming.reset()}><Camera className="size-3" />Apply shot camera</button>
      <button className={`${button} w-full`} onClick={() => { if (media.camera) filming.apply(media.camera); else filming.reset(); record(filming, clip!.id); }}><Circle className="size-3 text-red-500" />Re-record this shot</button>
    </fieldset> : null}
    {inspectorTab === 'shot' && !media ? <p className="text-xs text-ink/60">Select a recorded shot on the timeline to apply its camera or re-record it.</p> : null}
    </div>
    <p className="text-[10px] leading-relaxed text-ink/45">Avatar actions use compatible library clips. Object motions move a non-colliding, anchored character as a whole; animated mouths require a compatible rig. Dialogue text and attached audio appear in preview/export.</p>
    </> : null}
  </div>;
}
