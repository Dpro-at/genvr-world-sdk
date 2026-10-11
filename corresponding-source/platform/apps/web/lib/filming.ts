import { FilmCommand, type FilmStudioOperation } from '@genvr/contracts';
import { captureFilm, type FilmRig } from '@genvr/runtime';
import { API_URL } from './api';

/** Explicit opt-in page session; heartbeats continue while a video command is running. */
export async function connectFilming(place: string, rig: FilmRig, canvas: HTMLCanvasElement,
  subscribe: (draw: () => void) => () => void, report: (text: string) => void,
  disconnected: () => void, available: () => boolean = () => true,
  activity: (busy: boolean, command?: FilmCommand) => void = () => {},
  studio?: (operation: FilmStudioOperation, signal: AbortSignal) => Promise<Blob>): Promise<() => void> {
  const base = `${API_URL}/v1/capture/${encodeURIComponent(place)}/sessions`;
  const response = await fetch(base, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studio: Boolean(studio) }) });
  if (!response.ok) throw new Error('You must be signed in as an owner or builder to connect filming.');
  const { id } = await response.json() as { id: string };
  const url = `${base}/${id}`;
  const abort = new AbortController();
  let busy = false;
  let polling = false;
  let nextPoll = 0;
  const execute = async (job: { id: string; command: unknown }) => {
    busy = true;
    activity(true);
    let blob: Blob | undefined, error: string | undefined;
    let view = rig.view;
    const frames = (draw: () => void) => subscribe(() => { view = rig.view; draw(); });
    try {
      const command = FilmCommand.parse(job.command);
      activity(true, command);
      report(`Running ${command.kind}…`);
      if (command.kind === 'studio') {
        if (!studio) throw new Error('Open the world Filming editor for studio operations.');
        blob = await studio(command.operation, abort.signal);
      }
      if (command.kind === 'camera') {
        rig.set(command.camera);
        try { localStorage.setItem(`genvr-film-${place}`, JSON.stringify(command.camera)); } catch { /* Camera still applies when storage is unavailable. */ }
      } else if (command.kind === 'reset') rig.reset();
      if (command.kind === 'photo' || command.kind === 'video') blob = await captureFilm(canvas, command, abort.signal, frames);
      else if (command.kind !== 'studio') await new Promise<void>((resolve, reject) => {
        const cleanup = () => { unsubscribe(); clearTimeout(timer); abort.signal.removeEventListener('abort', cancel); };
        const cancel = () => { cleanup(); reject(new Error('Capture cancelled.')); };
        const timer = setTimeout(() => { cleanup(); reject(new Error('No rendered frame available.')); }, 10000);
        const unsubscribe = frames(() => { cleanup(); resolve(); });
        abort.signal.addEventListener('abort', cancel, { once: true });
      });
    } catch (e) { error = e instanceof Error ? e.message : 'Capture failed.'; }
    if (!abort.signal.aborted) {
      try {
        const completed = await fetch(`${url}/jobs/${job.id}`, { method: 'POST', credentials: 'include',
          signal: abort.signal, headers: { 'Content-Type': 'application/octet-stream',
            'X-Capture-Camera': JSON.stringify(rig.settings),
            'X-Capture-View': JSON.stringify(view),
            ...(blob ? { 'X-Capture-Mime': blob.type } : {}),
            ...(error ? { 'X-Capture-Error': error.replace(/[^\x20-\x7E]/g, '?').slice(0, 250) } : {}) },
          body: blob ?? new Uint8Array() });
        report(completed.ok ? error ?? 'Capture completed.' : 'Capture result could not be saved.');
      } catch { report('Capture connection lost.'); }
    }
    busy = false;
    activity(false);
  };
  const poll = async () => {
    if (polling || abort.signal.aborted || Date.now() < nextPoll) return;
    polling = true;
    const leasing = !busy && available();
    // Reserve the shared camera before the lease fetch, so local capture cannot race its reply.
    if (leasing) activity(true);
    try {
      const reply = await fetch(leasing ? url : `${url}?heartbeat=1`, { credentials: 'include', signal: abort.signal });
      if (reply.status === 429) {
        const retry = Number(reply.headers.get('retry-after'));
        nextPoll = Date.now() + Math.min(60000, Math.max(1000, Number.isFinite(retry) ? retry * 1000 : 5000));
        report('Capture connection is waiting for the request limit.'); return;
      }
      if (!reply.ok) { report('Capture session disconnected. Reconnect to continue.'); cleanup(); return; }
      const data = await reply.json() as { job: { id: string; command: unknown } | null };
      if (data.job && !busy) void execute(data.job);
    } catch { if (!abort.signal.aborted) report('Capture connection lost.'); }
    finally { polling = false; if (leasing && !busy) activity(false); }
  };
  const interval = setInterval(() => void poll(), 1000);
  const cleanup = () => {
    clearInterval(interval); abort.abort(); rig.reset(); disconnected();
    void fetch(url, { method: 'DELETE', credentials: 'include', keepalive: true });
  };
  report(`Connected: ${id}`);
  return cleanup;
}
