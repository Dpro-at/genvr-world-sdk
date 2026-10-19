'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Check, Clapperboard, Hand, Info, Mic, Move, RotateCcw, Smile, Trash2, UserRound, Video } from 'lucide-react';
import { toSeconds } from '@genvr/film';
import type { StudioFilming } from '../../../lib/use-studio-filming';

const button = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-ink/10 bg-paper px-2.5 py-1.5 text-xs font-semibold hover:bg-ink/10 disabled:opacity-35';
const primary = 'inline-flex items-center justify-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-paper hover:bg-ink/85 disabled:opacity-35';
const label = 'text-[10px] font-semibold uppercase tracking-wide text-ink/50';
/** A live take records at most this long (startManual's limit). */
const LIMIT = 30;

const Help = ({ text }: { text: string }) => <span title={text} aria-label={text} className="inline-flex text-ink/45"><Info className="size-3.5" /></span>;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, '0')}`;
const clock2 = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, '0')}`;
/** On / off shown as an icon that lights (design rule 2); here it only tells what the take records. */
const Lit = ({ on, icon: Icon, text, why }: { on: boolean; icon: typeof Move; text: string; why: string }) =>
  <span title={why} className={`flex flex-1 flex-col items-center gap-0.5 rounded-md py-1.5 text-[10px] font-semibold ${on ? 'bg-ink/10 text-ink ring-1 ring-ink/25' : 'text-ink/35'}`}>
    <Icon className="size-3.5" />{text}</span>;

/**
 * Live take (board 29): shown on the right while you record yourself (`manualRecording`), and for the take just
 * made after it stops: keep it, redo it, or discard it. Shows nothing otherwise.
 */
export function LiveTakePanel({ filming }: { filming: StudioFilming }) {
  const studio = filming.studio, recording = filming.manualRecording;
  const [began, setBegan] = useState<number | null>(null), [now, setNow] = useState(() => Date.now());
  /** After a stop: the media count before the take, so the new take is the newest media. */
  const [after, setAfter] = useState<{ before: number; until: number } | null>(null);
  const before = useRef(studio.project.media.length), was = useRef(recording);
  const [error, setError] = useState('');
  useEffect(() => {
    if (recording && !was.current) { before.current = studio.project.media.length; setBegan(Date.now()); setAfter(null); setError(''); }
    if (!recording && was.current) { setBegan(null); setAfter({ before: before.current, until: Date.now() + 8000 }); }
    was.current = recording;
  }, [recording]);
  useEffect(() => {
    if (!recording && !after) return;
    const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer);
  }, [recording, after]);
  const take = after && studio.project.media.length > after.before ? studio.project.media.at(-1) : undefined;
  // A stop that made no take (cancelled or empty) leaves nothing to keep after a short wait.
  useEffect(() => { if (after && !take && now > after.until) setAfter(null); }, [after, take, now]);

  if (!recording && !take) return null;
  const preset = filming.camera?.preset ?? 'player view', elapsed = began ? Math.min(LIMIT, (now - began) / 1000) : 0;
  const me = (studio.project.cast ?? []).find((c) => c.actor === 'self');
  const cues = studio.plan.filter((c) => c.text || c.action);

  if (!recording && take) {
    const seconds = toSeconds(take.duration), off = filming.busy || studio.rendering;
    const discard = () => { const r = studio.run('edit.undo'); if (r.ok) setAfter(null); else setError(r.reason); };
    const redo = () => {
      const r = studio.run('edit.undo'); if (!r.ok) { setError(r.reason); return; }
      setAfter(null);
      try { filming.startManual(LIMIT); } catch (e) { setError(e instanceof Error ? e.message : 'Could not start a new take.'); }
    };
    return <section aria-label="Live take" data-film-id="film.live-take" className="text-ink">
      <div className="flex items-center gap-2 border-b border-ink/10 px-3 py-2"><Video className="size-4 text-ink/60" />
        <div className="min-w-0 flex-1"><b className="block text-xs">Live take</b><span className="block truncate text-[11px] text-ink/55">{take.name} · {clock(seconds)}</span></div>
        <span className="inline-block size-1.5 rounded-full bg-green-500" title="Recorded" /></div>
      <div className="space-y-2 px-3 py-3 text-xs">
        <p className="flex items-center gap-2"><span className={`${label} flex-1`}>After stop</span><span className="text-[11px] text-ink/55">keep · redo · discard</span></p>
        <p className="text-ink/65">The take is on the timeline and selected. {take.camera?.preset ? `Camera: ${take.camera.preset}.` : ''}</p>
        <div className="flex gap-1">
          <button type="button" className={`${primary} flex-1`} disabled={off} onClick={() => setAfter(null)}><Check className="size-3.5" />Keep</button>
          <button type="button" className={button} disabled={off} title="Remove this take and record again" onClick={redo}><RotateCcw className="size-3.5" />Redo</button>
          <button type="button" className={`${button} text-red-500`} disabled={off} title="Remove this take (Undo)" onClick={discard}><Trash2 className="size-3.5" />Discard</button>
        </div>
        {error ? <p role="status" className="text-ink/70">{error}</p> : null}
      </div>
    </section>;
  }

  return <section aria-label="Live take" data-film-id="film.live-take" className="text-ink">
    <div className="flex items-center gap-2 border-b border-ink/10 px-3 py-2">
      <span className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-60" /><span className="relative inline-flex size-2.5 rounded-full bg-red-500" /></span>
      <div className="min-w-0 flex-1"><b className="block text-xs">Live take</b>
        <span className="block text-[11px] text-ink/55">{me ? `${me.name} · you move ${me.name}` : 'My avatar · you move it'}</span></div>
      <span className="font-mono text-xs tabular-nums" title="Recording time">{clock2(elapsed)} / {clock(LIMIT)}</span>
    </div>
    <div className="divide-y divide-ink/10 text-xs">
      <div className="flex items-center gap-2 px-3 py-2"><span className="w-20 text-ink/60">You control</span>
        <span className="flex items-center gap-1.5 font-semibold"><UserRound className="size-3.5" />{me ? me.name : 'My avatar'}</span></div>
      <div className="flex items-center gap-2 px-3 py-2"><span className="w-20 text-ink/60">Camera</span>
        <span className="flex items-center gap-1.5 font-semibold capitalize"><Camera className="size-3.5" />{preset}</span>
        <Help text="Change the camera move before the take; it is locked while recording." /></div>
      <div className="space-y-1.5 px-3 py-2">
        <p className="flex items-center gap-2"><span className="w-20 text-ink/60">Length limit</span><span className="font-mono">{clock(LIMIT)}</span>
          <span className="flex-1" /><span className="text-ink/60">Left</span><b className="font-mono">{clock(LIMIT - elapsed)}</b></p>
        <span className="block h-1.5 overflow-hidden rounded-full bg-ink/10"><span className="block h-full bg-red-500" style={{ width: `${(elapsed / LIMIT) * 100}%` }} /></span>
      </div>
      <div className="space-y-1.5 px-3 py-2">
        <p className="flex items-center gap-2"><span className={`${label} flex-1`}>What gets recorded</span><span className="text-[11px] text-ink/55">moves · actions · face</span></p>
        <div className="flex gap-1">
          <Lit on icon={Move} text="Moves" why="Your walking and running are recorded" />
          <Lit on icon={Hand} text="Actions" why="Actions you play (E, 1–9) are recorded" />
          <Lit on icon={Smile} text="Face" why="Faces you choose are recorded" />
          <Lit on={false} icon={Mic} text="Voice" why="Your microphone is not recorded in a live take; add a voice later" />
        </div>
      </div>
      <div className="space-y-1 px-3 py-2">
        <p className="flex items-center gap-2"><span className={`${label} flex-1`}>Cues playing</span><span className="text-[11px] text-ink/55">{cues.length}</span></p>
        {cues.length ? cues.map((cue) => { const active = elapsed >= cue.start && elapsed < cue.end;
          return <div key={cue.id} className={`flex items-start gap-2 rounded-md px-1.5 py-1 ${active ? 'bg-ink/10' : ''}`}>
            <Clapperboard className={`mt-0.5 size-3.5 shrink-0 ${active ? 'text-red-500' : 'text-ink/45'}`} />
            <span className="min-w-0 flex-1"><b className="block truncate">{cue.label}</b>{cue.text ? <span className="block truncate text-ink/65" dir="auto">{cue.text}</span> : null}</span>
            <span className="shrink-0 font-mono text-[10px] text-ink/50">{clock(cue.start)} → {clock(cue.end)}</span></div>; })
          : <p className="text-ink/55">No scene cues; only you move in this take.</p>}
      </div>
      <p className="px-3 py-2 text-[11px] text-ink/55">Stop with Space, or it stops at {clock(LIMIT)}. Then keep, redo or discard the take.</p>
    </div>
  </section>;
}
