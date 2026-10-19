'use client';

import { useEffect, useState } from 'react';
import { Camera, Circle, CircleDot, Globe, Square, Video } from 'lucide-react';
import type { StudioFilming } from '../../../lib/use-studio-filming';
import { SUBTITLE_LANGUAGES } from '../../../lib/video-studio/subtitles';
import { ToolbarMenu } from '../toolbar-menu';
import { record } from './record';
import { DragNumber } from './drag-number';

const icon = 'inline-flex size-8 items-center justify-center rounded-md hover:bg-ink/10 disabled:opacity-35';
const MOVE_LABEL: Record<string, string> = { static: 'Static', handheld: 'Handheld', running: 'Running', drone: 'Drone', follow: 'Follow', side: 'Side', orbit: 'Orbit' };

/**
 * The recording bar above the scene (design v11, boards 1 and 29): the camera move in use, Record shot, Live take,
 * Stop, Photo, the take length and the one language control of the page. Keys: R record, L live take, Space stop
 * (while a live take runs), P photo. Characters, voice, camera and lights live in the left tabs.
 */
export function RecordingBar({ filming }: { filming: StudioFilming }) {
  const studio = filming.studio, live = filming.manualRecording, shot = filming.shotRecording, busy = live || !!shot;
  const blocked = !studio.ready || filming.busy || studio.rendering;
  const elapsed = useElapsed(live ? 'live' : shot ? shot.began : null);
  const photo = () => { const [w, h] = filming.output.size.split('x').map(Number); void filming.take('photo', filming.output.seconds, w!, h!); };
  const startLive = () => { try { filming.startManual(); } catch (error) { studio.setMessage(error instanceof Error ? error.message : 'Live take failed.'); } };
  const stop = () => { try { filming.endManual(); } catch { /* not recording */ } };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey || target?.closest('input,textarea,select,[contenteditable="true"]')) return;
      if (live) { if (event.code === 'Space') { event.preventDefault(); stop(); } return; }
      if (blocked || studio.workspace !== 'shoot') return;
      const key = event.key.toLowerCase();
      if (key === 'r') { event.preventDefault(); studio.setWorkspace('shoot'); record(filming); }
      else if (key === 'l') { event.preventDefault(); startLive(); }
      else if (key === 'p') { event.preventDefault(); photo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const languages = studio.project.tracks.filter((t) => t.kind === 'caption' && t.lang);
  const shown = languages.find((t) => !t.hidden)?.lang ?? null;
  const name = (code: string) => SUBTITLE_LANGUAGES.find((l) => l.code === code)?.native ?? code.toUpperCase();
  const limit = live ? 30 : shot ? shot.seconds : filming.output.seconds;
  const clock = (v: number) => `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(Math.floor(v % 60)).padStart(2, '0')}`;
  // Board 1b: small icons of one size; only the button that is recording turns red, with its time inside.
  const redPill = 'inline-flex h-8 items-center gap-1.5 rounded-md bg-red-600 px-2.5 font-mono text-xs font-semibold text-white';
  return <div role="toolbar" aria-label="Recording bar" className={`flex flex-wrap items-center justify-center gap-1 px-2 py-1 ${busy ? 'ring-1 ring-inset ring-red-500/60' : ''}`}>
    <span className="inline-flex items-center gap-1.5 px-2 text-xs font-bold" title="Camera move — change it in the Camera tab"><Video className="size-4" />{MOVE_LABEL[filming.camera?.preset ?? ''] ?? 'Player view'}</span>
    <span className="mx-1 h-5 w-px bg-ink/15" />
    {shot ? <span role="status" data-film-id="film.record" aria-label="Recording shot" className={redPill} title="Recording the shot; it stops by itself"><Circle className="size-3 fill-current" />{clock(elapsed)} / {clock(limit)}</span>
      : <button type="button" data-film-id="film.record" aria-label="Record shot" disabled={blocked || live} title="Record shot — the cues play and the camera moves by itself (R)"
        className={`${icon} border border-ink/10 text-red-500 ${live ? 'opacity-35' : ''}`} onClick={(event) => { event.currentTarget.blur(); studio.setWorkspace('shoot'); record(filming); }}><Circle className="size-3.5 fill-current" /></button>}
    {live ? <span role="status" aria-label="Live take recording" className={redPill}><CircleDot className="size-3.5" />{clock(elapsed)} / {clock(30)}</span>
      : <button type="button" aria-label="Live take" disabled={blocked} title="Live take — you move the character with keyboard and mouse, up to 30 s (L)"
        className={`${icon} border border-ink/10 text-red-500 ${shot ? 'opacity-35' : ''}`} onClick={(event) => { event.currentTarget.blur(); startLive(); }}><CircleDot className="size-4" /></button>}
    <button type="button" aria-label="Stop" disabled={!live} title={live ? 'Stop (Space)' : shot ? 'The shot stops by itself at its length' : 'Stop (Space)'}
      className={`${icon} border ${busy ? 'border-red-500/60 text-red-500' : 'border-ink/10 opacity-40'}`} onClick={stop}><Square className="size-3.5 fill-current" /></button>
    <button type="button" aria-label="Photo" disabled={blocked || busy} title="Photo (P)" className={`${icon} border border-ink/10`} onClick={photo}><Camera className="size-4" /></button>
    {busy ? null : <DragNumber label="Take" value={limit} min={1} max={30} step={1} unit="s" width="w-24" disabled={filming.busy} commit={(v) => filming.setOutput({ ...filming.output, seconds: v })} />}
    <span className="mx-1 h-5 w-px bg-ink/15" />
    <ToolbarMenu label={shown ? shown.toUpperCase() : 'Language'} icon={Globe} closeOnAction>
      <p className="text-xs font-semibold">Watch, record and edit in</p>
      {languages.length ? languages.map((t) => <button key={t.id} type="button" aria-pressed={t.lang === shown} className="rounded px-2 py-2 text-left text-xs hover:bg-ink/10 aria-pressed:bg-ink/10"
        onClick={() => studio.run('subtitles.show', { lang: t.lang! })}>{name(t.lang!)} <span className="text-ink/50">· {t.clips.length} lines</span></button>)
        : <p className="text-xs text-ink/60">No languages yet. Add them in Film settings › Languages, then make captions in Captions.</p>}
      {languages.length ? <button type="button" className="rounded px-2 py-2 text-left text-xs hover:bg-ink/10" onClick={() => studio.run('subtitles.show', { lang: null })}>No captions on the picture</button> : null}
    </ToolbarMenu>
    {live ? <span role="status" className="text-[10px] text-red-500">WASD move · Shift run · mouse look · Space stop</span> : null}
  </div>;
}

/** Seconds since `start` ('live' = since the live take began), ticking while recording. */
function useElapsed(start: number | 'live' | null) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (start === null) { setElapsed(0); return; }
    const began = start === 'live' ? performance.now() : start, timer = setInterval(() => setElapsed((performance.now() - began) / 1000), 200);
    return () => clearInterval(timer);
  }, [start]);
  return elapsed;
}

/** Board 1b: while recording, a thin red frame and a REC badge go round the picture. */
export function RecordingFrame({ filming }: { filming: StudioFilming }) {
  const live = filming.manualRecording, shot = filming.shotRecording;
  const elapsed = useElapsed(live ? 'live' : shot ? shot.began : null);
  if (!live && !shot) return null;
  return <div aria-hidden className="pointer-events-none absolute inset-0 z-30 shadow-[inset_0_0_0_3px_rgb(229_72_77)]">
    <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-red-600/85 px-2 py-0.5 font-mono text-[11px] font-bold text-white"><span className="size-1.5 rounded-full bg-white" />REC {String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(Math.floor(elapsed % 60)).padStart(2, '0')}</span>
  </div>;
}
