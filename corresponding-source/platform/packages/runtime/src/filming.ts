import { FilmCamera, type FilmCommand, type FilmView, type FilmWaypoint } from '@genvr/contracts';
import { PerspectiveCamera, Vector3 } from 'three/webgpu';

export const FILM_PRESETS = {
  static: { responsiveness: 30, shake: 0 },
  handheld: { responsiveness: 6, shake: 0.025 },
  running: { responsiveness: 3, shake: 0.09 },
  drone: { responsiveness: 2, shake: 0 },
  follow: { responsiveness: 5, shake: 0 },
  side: { responsiveness: 5, shake: 0 },
  orbit: { responsiveness: 4, shake: 0 },
} as const;

const EASES = {
  linear: (u: number) => u,
  in: (u: number) => u * u,
  out: (u: number) => 1 - (1 - u) * (1 - u),
  in_out: (u: number) => u * u * (3 - 2 * u),
} as const;

/** Catmull-Rom through the stops, so a flight bends smoothly instead of turning sharp corners. */
function spline(a: number, b: number, c: number, d: number, u: number): number {
  return 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (3 * b - a - 3 * c + d) * u * u * u);
}

/** Where the camera is, what it looks at and its lens `time` seconds into a flight. */
export function sampleFilmPath(path: readonly FilmWaypoint[], time: number): { position: Vector3; target: Vector3; fov: number | undefined } {
  const last = path.length - 1;
  let i = 0;
  while (i < last - 1 && time >= path[i + 1]!.at) i++;
  const from = path[i]!, to = path[i + 1]!;
  const raw = Math.min(1, Math.max(0, (time - from.at) / (to.at - from.at)));
  const u = EASES[from.ease](raw);
  const p0 = path[Math.max(0, i - 1)]!, p3 = path[Math.min(last, i + 2)]!;
  const point = (key: 'position' | 'target') => new Vector3(
    ...[0, 1, 2].map((axis) => spline(p0[key][axis]!, from[key][axis]!, to[key][axis]!, p3[key][axis]!, u)) as [number, number, number]);
  const fov = from.fov !== undefined && to.fov !== undefined ? from.fov + (to.fov - from.fov) * u : from.fov ?? to.fov;
  return { position: point('position'), target: point('target'), fov };
}

/** A reusable filming rig; the runtime calls update after its gameplay camera. */
export class FilmRig {
  settings: FilmCamera | null = null;
  view: FilmView | null = null;
  #time = 0;
  #position = new Vector3();
  #target = new Vector3();
  #startPlayer = new Vector3();
  #started = false;
  #cut = false;

  set(raw: unknown): FilmCamera {
    this.settings = FilmCamera.parse(raw);
    this.#time = 0;
    this.#started = false;
    this.#cut = true;
    return this.settings;
  }

  reset(): void { this.settings = null; this.#cut = true; }

  consumeCut(): boolean { const cut = this.#cut; this.#cut = false; return cut; }

  update(camera: PerspectiveCamera, dt: number, player: { x: number; y: number; z: number }): void {
    const s = this.settings;
    if (!s) return;
    if (!this.#started) {
      this.#startPlayer.set(player.x, player.y, player.z);
      const start = s.path ? sampleFilmPath(s.path, 0) : null;
      this.#position.copy(start?.position ?? new Vector3().fromArray(s.position));
      this.#target.copy(start?.target ?? new Vector3().fromArray(s.target));
      this.#started = true;
    }
    this.#time += Math.max(0, dt);
    const flight = s.path ? sampleFilmPath(s.path, this.#time) : null;
    const target = flight?.target ?? new Vector3().fromArray(s.target);
    const position = flight?.position ?? new Vector3().fromArray(s.position);
    if (s.follow_player) {
      const move = new Vector3(player.x, player.y, player.z).sub(this.#startPlayer);
      target.add(move);
      position.add(move);
    }
    const angle = this.#time * s.speed * Math.PI / 180;
    if (!flight && (s.preset === 'orbit' || s.preset === 'drone')) {
      const offset = position.clone().sub(target);
      position.set(target.x + offset.x * Math.cos(angle) + offset.z * Math.sin(angle),
        position.y, target.z + offset.z * Math.cos(angle) - offset.x * Math.sin(angle));
    }
    const defaults = FILM_PRESETS[s.preset];
    const blend = 1 - Math.exp(-(s.responsiveness ?? defaults.responsiveness) * Math.max(0, dt));
    this.#position.lerp(position, blend);
    this.#target.lerp(target, blend);
    camera.position.copy(this.#position);
    const shake = s.shake ?? defaults.shake;
    const t = this.#time, phase = s.seed * 0.71;
    const frequency = s.preset === 'running' ? 12 : 2;
    camera.position.x += Math.sin(t * frequency + phase) * shake;
    camera.position.y += Math.sin(t * frequency * 2 + phase) * shake * 0.6;
    camera.lookAt(this.#target);
    camera.rotateZ(s.roll * Math.PI / 180 + Math.sin(t * frequency * 0.7 + phase) * shake * 0.2);
    const fov = flight?.fov ?? s.fov;
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }
}

/** Browser capture encodes the runtime's own canvas, without HTML UI. Silent video for v1. */
export async function captureFilm(
  canvas: HTMLCanvasElement,
  command: Extract<FilmCommand, { kind: 'photo' | 'video' }>,
  signal: AbortSignal,
  subscribe: (draw: () => void) => () => void,
  onStart?: () => void,
  /** Seconds recorded so far (video only), about four times a second. */
  onProgress?: (seconds: number) => void,
  /** Sound recorded with the picture (FILM-08: the world's mix); silent video when absent. */
  sound?: MediaStream | null,
  /** Finish normally and retain the take; cancellation still discards it. */
  finish?: AbortSignal,
): Promise<Blob> {
  const settings = command.settings;
  const out = document.createElement('canvas');
  out.width = settings.width;
  out.height = settings.height;
  const context = out.getContext('2d');
  if (!context) throw new Error('Canvas capture is unavailable.');
  const draw = () => {
    const scale = Math.min(out.width / canvas.width, out.height / canvas.height);
    const width = canvas.width * scale, height = canvas.height * scale;
    context.fillStyle = '#000'; context.fillRect(0, 0, out.width, out.height);
    context.drawImage(canvas, (out.width - width) / 2, (out.height - height) / 2, width, height);
  };
  const delay = (ms: number) => new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new Error('Capture cancelled.')); return; }
    const abort = () => { clearTimeout(timer); reject(new Error('Capture cancelled.')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
  await delay(settings.settle_seconds * 1000);
  // Warm-up (FILM-02d): a world that is still loading drops the timed frames of a take, which then comes
  // out far shorter than asked. Wait (up to 5 s) until 10 frames in a row arrive less than 100 ms apart.
  if (command.kind === 'video') await new Promise<void>((resolve, reject) => {
    let steady = 0, last = performance.now();
    const cleanup = () => { unsubscribe(); clearTimeout(timeout); signal.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); reject(new Error('Capture cancelled.')); };
    const timeout = setTimeout(() => { cleanup(); resolve(); }, 5000);
    const unsubscribe = subscribe(() => {
      const now = performance.now();
      steady = now - last < 100 ? steady + 1 : 0; last = now;
      if (steady >= 10) { cleanup(); resolve(); }
    });
    signal.addEventListener('abort', abort, { once: true });
  });
  // Read only in the render task; stalled/hidden runtimes fail rather than exporting a blank picture.
  await new Promise<void>((resolve, reject) => {
      const cleanup = () => { unsubscribe(); clearTimeout(timeout); signal.removeEventListener('abort', abort); };
      const abort = () => { cleanup(); reject(new Error('Capture cancelled.')); };
      const timeout = setTimeout(() => { cleanup(); reject(new Error('No rendered frame available.')); }, 10000);
      const unsubscribe = subscribe(() => {
        cleanup();
        try { draw(); resolve(); } catch { reject(new Error('The canvas cannot be captured.')); }
      });
      signal.addEventListener('abort', abort, { once: true });
  });
  if (command.kind === 'photo') {
    return new Promise((resolve, reject) => {
      out.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Image encoding failed.')), 'image/png');
    });
  }
  if (typeof MediaRecorder === 'undefined' || !out.captureStream)
    throw new Error('Video recording is unavailable in this browser.');
  const audioTracks = sound?.getAudioTracks().filter((t) => t.readyState === 'live') ?? [];
  const mimeType = (audioTracks.length ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'] : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'])
    .find((mime) => MediaRecorder.isTypeSupported(mime));
  if (!mimeType) throw new Error('A WebM encoder is unavailable.');
  // Explicit requests retain timed frames even when a static shot's pixels are identical.
  const stream = out.captureStream(0);
  // Clones, so stopping the recording never stops the world's own sound stream.
  for (const t of audioTracks) stream.addTrack(t.clone());
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
  if (typeof track?.requestFrame !== 'function') {
    stream.getTracks().forEach((item) => item.stop()); throw new Error('Timed canvas capture is unavailable in this browser.');
  }
  const held = document.createElement('canvas'); held.width = out.width; held.height = out.height;
  // CPU backing avoids a GPU texture feedback chain between the encoder canvas and its snapshot.
  const hold = held.getContext('2d', { willReadFrequently: true });
  if (!hold) { stream.getTracks().forEach((item) => item.stop()); throw new Error('Frame buffer unavailable.'); }
  hold.drawImage(out, 0, 0);
  let recorder: MediaRecorder;
  try { recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 }); }
  catch { stream.getTracks().forEach((track) => track.stop()); throw new Error('Video recorder could not start.'); }
  const chunks: Blob[] = [];
  let frames = 0, lastFrame = performance.now();
  let fail: (error: Error) => void = () => {};
  const result = new Promise<Blob>((resolve, reject) => {
    fail = reject;
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => reject(new Error('Video encoding failed.'));
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
  });
  const unsubscribe = subscribe(() => { try {
    draw(); hold.drawImage(out, 0, 0); frames++; lastFrame = performance.now();
  }
    catch { fail(new Error('The canvas cannot be captured.')); } });
  // Hold the last rendered image between slow world frames, without reading a cleared WebGL buffer.
  const pulse = setInterval(() => {
    if (document.hidden) { fail(new Error('Recording stopped because the editor became hidden.')); return; }
    try { context.drawImage(held, 0, 0); track.requestFrame(); }
    catch { fail(new Error('Timed frame capture failed.')); }
  }, 1000 / command.settings.fps);
  const watchdog = setInterval(() => { if (performance.now() - lastFrame > 10000)
    fail(new Error('Rendering stalled during video capture.')); }, 1000);
  let began = 0;
  const progress = setInterval(() => { if (began) onProgress?.(Math.min(command.settings.seconds, (performance.now() - began) / 1000)); }, 250);
  try {
    recorder.start(250);
    began = performance.now();
    onStart?.();
    track.requestFrame();
    await Promise.race([recordingWindow(command.settings.seconds * 1000, signal, finish), result.then(() => undefined)]);
    if (frames === 0) throw new Error('No frames rendered during video capture.');
    context.drawImage(held, 0, 0); track.requestFrame();
    await delay(50);
    recorder.stop();
    return await result;
  } finally {
    unsubscribe();
    clearInterval(pulse);
    clearInterval(watchdog);
    clearInterval(progress);
    if (recorder.state !== 'inactive') recorder.stop();
    stream.getTracks().forEach((track) => track.stop());
  }
}

/** A normal End scene is different from cancelling/discarding a capture. */
export function recordingWindow(ms:number,cancel:AbortSignal,finish?:AbortSignal):Promise<void>{
 return new Promise((resolve,reject)=>{let timer:ReturnType<typeof setTimeout>;const clean=()=>{clearTimeout(timer);cancel.removeEventListener('abort',abort);finish?.removeEventListener('abort',done);};const done=()=>{clean();resolve();};const abort=()=>{clean();reject(new Error('Capture cancelled.'));};timer=setTimeout(done,ms);cancel.addEventListener('abort',abort,{once:true});finish?.addEventListener('abort',done,{once:true});if(cancel.aborted)abort();else if(finish?.aborted)done();});
}
