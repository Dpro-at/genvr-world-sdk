'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Circle, Play, Square, Trash2 } from 'lucide-react';
import type { ScriptLine } from '@genvr/film';
import type { StudioFilming } from '../../../lib/use-studio-filming';

const icon = 'inline-flex size-7 items-center justify-center rounded-md hover:bg-ink/10 disabled:opacity-35';

/**
 * A person records a line (FILM-D3, board 23): count-in 3-2-1, record from the microphone, then keep the best take.
 * The kept take is the voice of the line's cue; recording happens only here in the Studio (agents read the takes).
 */
export function VoiceTakes({ filming, line, lang, person }: { filming: StudioFilming; line: ScriptLine; lang: string; person: string }) {
  const studio = filming.studio, off = filming.busy || studio.rendering;
  const takes = (studio.project.takes ?? []).filter((t) => t.line === line.id && t.lang === lang);
  const [count, setCount] = useState(0), [recording, setRecording] = useState(false), [error, setError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null), began = useRef(0), chunks = useRef<Blob[]>([]);
  useEffect(() => () => { recorder.current?.stream.getTracks().forEach((t) => t.stop()); }, []);
  const start = async () => {
    setError('');
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { setError('The microphone is not allowed. Allow it in the browser to record.'); return; }
    for (const n of [3, 2, 1]) { setCount(n); await new Promise((r) => setTimeout(r, 700)); }
    setCount(0);
    const rec = new MediaRecorder(stream); recorder.current = rec; chunks.current = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop()); setRecording(false);
      const seconds = Math.min(60, Math.max(0.1, (performance.now() - began.current) / 1000));
      const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' });
      try {
        const asset = studio.addAudio(blob);
        const result = studio.run('take.add', { line: line.id, lang, asset, seconds: Math.round(seconds * 10) / 10, by: person });
        if (!result.ok) setError(result.reason);
      } catch (e) { setError(e instanceof Error ? e.message : 'Could not keep the recording.'); }
    };
    began.current = performance.now(); rec.start(); setRecording(true);
  };
  const play = (asset: string) => { const blob = studio.assets.find((a) => a.id === asset)?.blob; if (!blob) return;
    const url = URL.createObjectURL(blob), audio = new Audio(url); audio.onended = () => URL.revokeObjectURL(url); void audio.play(); };
  const run = (id: string, args: unknown) => { const r = studio.run(id, args); if (!r.ok) setError(r.reason); };
  return <div className="space-y-1 rounded-md bg-ink/5 p-1.5">
    <div className="flex items-center gap-1.5 text-[11px]"><span className="flex-1 text-ink/60">{person} records {lang.toUpperCase()}</span>
      {count ? <b className="rounded bg-red-500 px-1.5 text-white">{count}</b> : null}
      {recording ? <button type="button" className={`${icon} text-red-500 ring-1 ring-red-500/60`} aria-label="Stop recording" onClick={() => recorder.current?.stop()}><Square className="size-3.5 fill-current" /></button>
        : <button type="button" className={`${icon} text-red-500`} aria-label={`Record ${lang} take`} title="Record a take (3-2-1 first)" disabled={off || count > 0} onClick={() => void start()}><Circle className="size-3.5 fill-current" /></button>}
    </div>
    {takes.map((t, i) => <div key={t.id} className="flex items-center gap-1 text-[11px]">
      <span className={`size-1.5 rounded-full ${t.kept ? 'bg-green-500' : 'bg-ink/25'}`} /><span className="flex-1">Take {i + 1} · {t.seconds.toFixed(1)} s{t.kept ? ' · kept' : ''}</span>
      <button type="button" className={icon} aria-label={`Play take ${i + 1}`} onClick={() => play(t.asset)}><Play className="size-3.5" /></button>
      <button type="button" className={`${icon} text-green-600`} aria-label={`Keep take ${i + 1}`} disabled={off || t.kept} onClick={() => run('take.keep', { take: t.id })}><Check className="size-3.5" /></button>
      <button type="button" className={icon} aria-label={`Delete take ${i + 1}`} disabled={off} onClick={() => run('take.remove', { take: t.id })}><Trash2 className="size-3.5" /></button>
    </div>)}
    {error ? <p role="status" className="text-[11px] text-red-500">{error}</p> : null}
  </div>;
}
