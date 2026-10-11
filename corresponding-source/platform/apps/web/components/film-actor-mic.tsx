'use client';
import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { FILM_VOICE_MAX_BYTES, type FilmTakeEvent } from '@genvr/contracts';
import { filmRoom } from '../lib/film-room';

/** The longest voice an actor sends for one take (the film is at most 180 s). */
const MAX_SECONDS = 180;
const MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

/**
 * Live actors (FILM-11): when a director in this place's room starts a take, the player is asked once whether their
 * microphone may be recorded for the film. While a take runs the voice is recorded here, in this browser, and when the
 * director stops it the recording is sent to the director only. A dropped take is thrown away.
 */
export function FilmActorMic() {
  const [asked, setAsked] = useState<{ event: FilmTakeEvent; signal: number } | null>(null);
  const [consent, setConsent] = useState<'yes' | 'no' | null>(null);
  const [recording, setRecording] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const take = useRef<{ id: string; recorder: MediaRecorder; chunks: Blob[]; signal: number; started: number; mime: string } | null>(null);
  const consentRef = useRef(consent); consentRef.current = consent;

  const begin = async (event: FilmTakeEvent, signal: number) => {
    try {
      stream.current ??= await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = MIMES.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
      const recorder = new MediaRecorder(stream.current, mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : undefined);
      const current = { id: event.take, recorder, chunks: [] as Blob[], signal, started: performance.now(), mime: (recorder.mimeType || mime).split(';')[0] ?? 'audio/webm' };
      recorder.ondataavailable = (e) => { if (e.data.size) current.chunks.push(e.data); };
      recorder.start(1000);
      take.current = current; setRecording(event.name);
      window.setTimeout(() => { if (take.current === current && recorder.state === 'recording') recorder.stop(); }, MAX_SECONDS * 1000);
    } catch {
      setConsent('no'); setNote('The microphone could not be used; your voice is not recorded.');
    }
  };

  const finish = (send: boolean) => {
    const current = take.current; take.current = null; setRecording(null);
    if (!current) return;
    const done = async () => {
      if (!send) return;
      const blob = new Blob(current.chunks, { type: current.mime });
      if (!blob.size || blob.size > FILM_VOICE_MAX_BYTES) { setNote('Your voice of this take was too long or empty and was not sent.'); return; }
      const mime = (['audio/webm', 'audio/ogg', 'audio/mp4'] as const).find((m) => m === current.mime) ?? 'audio/webm';
      filmRoom.sendVoice({ take: current.id, mime, delay: Math.min(5000, Math.max(0, current.started - current.signal)), audio: new Uint8Array(await blob.arrayBuffer()) });
      setNote('Your voice was sent to the director.');
    };
    if (current.recorder.state === 'inactive') void done();
    else { current.recorder.onstop = () => void done(); current.recorder.stop(); }
  };

  useEffect(() => filmRoom.onTake((event) => {
    if (event.action === 'start') {
      const signal = performance.now();
      setNote(null);
      if (consentRef.current === 'yes') void begin(event, signal);
      else if (consentRef.current === null) setAsked({ event, signal });
    } else if (take.current?.id === event.take) finish(event.action === 'stop');
    else if (asked?.event.take === event.take) setAsked(null);
  }), [asked]);

  useEffect(() => () => { take.current?.recorder.stop(); stream.current?.getTracks().forEach((t) => t.stop()); }, []);

  if (!asked && !recording && !note) return null;
  return <div role="status" data-film-id="film.actor" className="pointer-events-auto fixed left-1/2 top-16 z-40 flex max-w-[92vw] -translate-x-1/2 items-center gap-2 rounded-xl bg-paper/95 px-3 py-2 text-xs text-ink shadow-lg ring-1 ring-ink/10">
    {recording ? <><span className="size-2.5 animate-pulse rounded-full bg-red-600" aria-hidden /><Mic className="size-3.5" /><span>Recording your voice for {recording}'s film</span></>
      : asked ? <>
        <Mic className="size-3.5" /><span>{asked.event.name} is filming. Record your voice for the film?</span>
        <button type="button" data-film-id="film.actor.yes" className="rounded-md bg-ink px-2 py-1 font-bold text-paper"
          onClick={() => { const { event, signal } = asked; setAsked(null); setConsent('yes'); void begin(event, signal); }}>Use my microphone</button>
        <button type="button" aria-label="Do not record my voice" title="Do not record my voice" className="rounded-md px-2 py-1 font-bold ring-1 ring-ink/15" onClick={() => { setAsked(null); setConsent('no'); }}><MicOff className="size-3.5" /></button>
      </> : <><span>{note}</span><button type="button" className="rounded-md px-2 py-1 ring-1 ring-ink/15" onClick={() => setNote(null)}>OK</button></>}
  </div>;
}
