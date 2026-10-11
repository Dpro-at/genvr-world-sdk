import { DEFAULT_SUBTITLE_STYLE, type SubtitleStyle, duckGain, fadeGain, filmLength, particlesAt, type ParticleKind, fromSeconds, missingAssets, previousClip, resolveAt, toSeconds, transitionWindow, type CaptionClip, type EffectClip, type TransitionSpec, type FilmProject, type Media, type MediaClip, type Track } from '@genvr/film';
import { compositorFor, type FilmCompositor, type Layer, type MediaLayer } from './compositor';
import { drawTitle } from './titles-draw';
import type { Asset } from './model';

function event(target: EventTarget, name: string, signal: AbortSignal): Promise<void> {
  return new Promise((ok, fail) => {
    const finish = (error?: unknown) => {
      clearTimeout(timer); target.removeEventListener(name, done); target.removeEventListener('error', failed);
      signal.removeEventListener('abort', failed); if (error) fail(error); else ok();
    };
    const done = () => finish(), failed = () => finish(new Error(signal.aborted ? 'Cancelled.' : 'Video decode failed.'));
    const timer = setTimeout(() => finish(new Error(`Video ${name} timed out.`)), 15000);
    target.addEventListener(name, done, { once: true }); target.addEventListener('error', failed, { once: true });
    signal.addEventListener('abort', failed, { once: true }); if (signal.aborted) failed();
  });
}

/** One stretch of the film (seconds) and the picture clip on top during it (none: black). */
export interface Segment { start: number; end: number; clip?: MediaClip; media?: Media }

/** What the picture shows over time: the top visible picture track wins (no blending before FILM-05). */
export function pictureSegments(project: FilmProject): Segment[] {
  const tracks = project.tracks.filter((t) => t.kind === 'picture' && !t.hidden);
  const cuts = new Set([0, filmLength(project)]);
  for (const t of tracks) for (const c of t.clips) { cuts.add(c.start); cuts.add(c.start + c.duration); }
  const times = [...cuts].sort((a, b) => a - b), out: Segment[] = [];
  for (let i = 0; i + 1 < times.length; i++) {
    const from = times[i]!, to = times[i + 1]!;
    let clip: MediaClip | undefined;
    for (const t of tracks) {
      const found = t.clips.find((c) => c.type === 'media' && c.start <= from && c.start + c.duration > from);
      if (found) { clip = found as MediaClip; break; }
    }
    const last = out.at(-1);
    if (last && last.clip?.id === clip?.id && last.end === toSeconds(from)) { last.end = toSeconds(to); continue; }
    const media = clip ? project.media.find((m) => m.id === clip.media) : undefined;
    out.push({ start: toSeconds(from), end: toSeconds(to), ...(clip ? { clip } : {}), ...(media ? { media } : {}) });
  }
  return out;
}
const mediaTime = (segment: Segment, at: number) => toSeconds(segment.clip!.in) + at - toSeconds(segment.clip!.start);

/** Text on the film at a moment: caption clips, then the dialogue of the recording on top. */
export function captionsAt(project: FilmProject, segment: Segment | undefined, at: number): string[] {
  const lines: string[] = [];
  for (const t of project.tracks) if (t.kind === 'caption' && !t.hidden) for (const c of t.clips)
    if (c.type === 'caption' && !c.title && toSeconds(c.start) <= at && toSeconds(c.start + c.duration) > at) lines.push(c.text);
  // Once subtitles exist (FILM-12) they carry what is said; the typed dialogue is not drawn twice.
  if (segment?.media && !project.tracks.some((t) => t.kind === 'caption' && t.lang)) {
    const time = mediaTime(segment, at);
    for (const cue of segment.media.cues) if (cue.text && toSeconds(cue.start) <= time && toSeconds(cue.end) > time) lines.push(`${cue.label}: ${cue.text}`);
  }
  return lines.slice(0, 3);
}

/** Sounds to play: cue sounds of what is on screen and sound-track recordings, in film seconds. */
interface SoundEvent {
  asset: string; at: number; offset: number; duration: number; volume: number; volumeAt?: (film: number) => number;
  /** Meter lane (a sound track id, or "dialogue" for cue sounds) and how the sound is treated (FILM-08). */
  lane: string; type: 'dialogue' | 'music' | 'effects' | 'ambience'; fadeIn: number; fadeOut: number;
}
/** Every clip id of the film. */
const clipIds = (project: FilmProject) => new Set(project.tracks.flatMap((t) => t.clips.map((c) => c.id)));

export function soundEvents(project: FilmProject, segments: Segment[]): SoundEvent[] {
  const events: SoundEvent[] = [];
  for (const segment of segments) {
    if (!segment.media) continue;
    const from = mediaTime(segment, segment.start), to = mediaTime(segment, segment.end);
    for (const cue of segment.media.cues) {
      const start = toSeconds(cue.start), stop = Math.min(toSeconds(cue.end), to);
      if (!cue.audio || stop <= from || start >= to) continue;
      const begin = Math.max(start, from);
      events.push({ asset: cue.audio, at: segment.start + begin - from, offset: begin - start, duration: stop - begin, volume: cue.volume,
        lane: 'dialogue', type: 'dialogue', fadeIn: 0, fadeOut: 0 });
    }
  }
  const sound = project.tracks.filter((t) => t.kind === 'sound');
  const soloed = sound.some((t) => t.solo);
  const audible = (t: Track) => !t.muted && (!soloed || t.solo);
  for (const t of sound.filter(audible)) for (const c of t.clips) {
    if (c.type !== 'media') continue;
    const media = project.media.find((m) => m.id === c.media);
    // Sound files, and recordings that carry the world's sound (FILM-08) when placed on a sound track.
    if (!media || !(media.kind === 'audio' || (media.kind === 'video' && media.hasSound))) continue;
    events.push({ asset: media.asset, at: toSeconds(c.start), offset: toSeconds(c.in), duration: toSeconds(c.duration), volume: c.volume,
      ...(c.keys?.volume?.length ? { volumeAt: (film: number) => resolveAt(c, fromSeconds(film)).volume } : {}),
      lane: t.id, type: c.soundType ?? 'music', fadeIn: toSeconds(c.fade?.in ?? 0), fadeOut: toSeconds(c.fade?.out ?? 0) });
  }
  return events;
}

/** What is drawn at a moment, bottom first: picture clips, transitions, titles and adjustment layers, in track order. */
export type MediaPlan = { kind: 'media'; clip: MediaClip; media: Media; time: number };
export type PlanLayer = MediaPlan
  | { kind: 'adjust'; clip: EffectClip; local: number }
  | { kind: 'title'; clip: CaptionClip; progress: number }
  /** Seeded particles (FILM-03a) on an effect track, drawn over everything below. */
  | { kind: 'particles'; clip: EffectClip; local: number }
  | { kind: 'transition'; clip: MediaClip; spec: TransitionSpec; progress: number; a: MediaPlan; b: MediaPlan };
export function layersAt(project: FilmProject, at: number): PlanLayer[] {
  const out: PlanLayer[] = [], film = fromSeconds(at);
  // Animated values (FILM-06) are resolved for this moment, so the compositor only draws plain values.
  const plan = (clip: MediaClip): MediaPlan | undefined => {
    const media = project.media.find((m) => m.id === clip.media);
    return media ? { kind: 'media', clip: resolveAt(clip, film), media, time: toSeconds(clip.in) + at - toSeconds(clip.start) } : undefined;
  };
  // Pictures and adjustment layers in track order, bottom first; titles (caption tracks) always on top of them.
  const reversed = [...project.tracks].reverse();
  const ordered = [...reversed.filter((t) => t.kind !== 'caption'), ...reversed.filter((t) => t.kind === 'caption')];
  for (const track of ordered) {
    if (track.hidden || track.kind === 'sound') continue;
    if (track.kind === 'picture') {
      // A transition shows both clips around its cut (FILM-01).
      const mixing = track.clips.find((c) => {
        if (c.type !== 'media' || !c.transition) return false;
        const w = transitionWindow(c, c.transition as TransitionSpec);
        return film >= w.from && film < w.to;
      }) as MediaClip | undefined;
      const before = mixing && previousClip(track, mixing);
      if (mixing && before) {
        const spec = mixing.transition as TransitionSpec, w = transitionWindow(mixing, spec);
        const a = plan(before), b = plan(mixing);
        if (a && b) { out.push({ kind: 'transition', clip: b.clip, spec, progress: (film - w.from) / (w.to - w.from), a, b }); continue; }
      }
    }
    const clip = track.clips.find((c) => toSeconds(c.start) <= at && toSeconds(c.start + c.duration) > at);
    if (!clip) continue;
    if (clip.type === 'media' && track.kind === 'picture') { const p = plan(clip); if (p) out.push(p); }
    else if (clip.type === 'effect') out.push({ kind: clip.effect === 'particles' ? 'particles' : 'adjust', clip: resolveAt(clip, film), local: at - toSeconds(clip.start) });
    else if (clip.type === 'caption' && clip.title) out.push({ kind: 'title', clip: resolveAt(clip, film), progress: (film - clip.start) / clip.duration });
  }
  return out;
}
/** Every recording that must play or be seeked at a moment (both sides of a transition included). */
const videoPlans = (layers: PlanLayer[]): MediaPlan[] =>
  layers.flatMap((l) => l.kind === 'media' ? [l] : l.kind === 'transition' ? [l.a, l.b] : []);
/** The top picture layer as a segment, for dialogue captions. */
const topSegment = (layers: PlanLayer[], at: number): Segment | undefined => {
  const top = videoPlans([...layers].reverse())[0];
  return top ? { start: at, end: at, clip: top.clip, media: top.media } : undefined;
};

/** A colour with an opacity, for canvas fills. */
const rgba = (hex: string, opacity: number) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${opacity})`;

function drawFrame(ctx: CanvasRenderingContext2D, picture: HTMLCanvasElement | HTMLVideoElement | undefined, lines: string[], style: SubtitleStyle = DEFAULT_SUBTITLE_STYLE) {
  const canvas = ctx.canvas;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const w0 = picture instanceof HTMLVideoElement ? picture.videoWidth : picture?.width ?? 0;
  const h0 = picture instanceof HTMLVideoElement ? picture.videoHeight : picture?.height ?? 0;
  if (picture && w0) {
    const ratio = Math.min(canvas.width / w0, canvas.height / h0);
    const w = w0 * ratio, h = h0 * ratio;
    ctx.drawImage(picture, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  }
  const size = Math.max(14, Math.round(canvas.height / 24));
  ctx.font = `bold ${size}px sans-serif`; ctx.textAlign = 'center';
  // The subtitle look (FILM-12d): a band across the picture, a box around each line, or text with an outline.
  const widest = canvas.width - size * 2.6;
  lines.forEach((text, index) => {
    const y = canvas.height - size - (lines.length - index - 1) * size * 1.45;
    if (style.box !== 'none' && style.boxOpacity > 0) {
      ctx.fillStyle = rgba(style.boxColor, style.boxOpacity);
      if (style.box === 'band') ctx.fillRect(size, y - size * 1.05, canvas.width - size * 2, size * 1.4);
      else { const w = Math.min(widest, ctx.measureText(text).width) + size * 0.8; ctx.fillRect((canvas.width - w) / 2, y - size * 1.05, w, size * 1.4); }
    } else {
      ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, size / 6); ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(text, canvas.width / 2, y, widest);
    }
    ctx.fillStyle = style.textColor; ctx.fillText(text, canvas.width / 2, y, widest);
  });
}

/**
 * Which player each picture clip uses during playback: clips of the same recording that never show
 * at the same moment (the parts of a cut-up shot) share one, so a film with many cuts stays within the
 * browser's few dozen media players. Clips that can overlap (other tracks, transitions, which also
 * show the time around a cut) get their own. Returns clip id -> player key.
 */
export function playerSlots(project: FilmProject): Map<string, string> {
  const pad = Math.max(0, ...project.tracks.flatMap((t) => t.clips.map((c) => c.type === 'media' && c.transition ? toSeconds(c.transition.duration) : 0)));
  const clips = project.tracks.filter((t) => t.kind === 'picture' && !t.hidden).flatMap((t) => t.clips)
    .filter((c): c is MediaClip => c.type === 'media').sort((a, b) => a.start - b.start);
  const free = new Map<string, number[]>(), out = new Map<string, string>(); // media -> end of each player's last clip
  for (const c of clips) {
    const from = toSeconds(c.start) - pad, to = toSeconds(c.start + c.duration) + pad, ends = free.get(c.media) ?? [];
    let slot = ends.findIndex((end) => end <= from);
    if (slot < 0) { slot = ends.length; ends.push(0); }
    ends[slot] = to; free.set(c.media, ends); out.set(c.id, `${c.media}#${slot}`);
  }
  return out;
}

/** A loaded <video> for `key` (a clip id, or a shared player key), made once per key. */
async function videoFor(clip: MediaClip, media: Media, assets: Asset[], cache: Map<string, HTMLVideoElement>, urls: string[], signal: AbortSignal, key = clip.id) {
  const ready = cache.get(key); if (ready) return ready;
  const video = document.createElement('video'); video.muted = true; video.playsInline = true;
  const url = URL.createObjectURL(assets.find((a) => a.id === media.asset)!.blob); urls.push(url);
  video.src = url; const loaded = event(video, 'loadeddata', signal); video.load(); await loaded;
  if (!Number.isFinite(video.duration)) { const indexed = event(video, 'seeked', signal); video.currentTime = 1e9; await indexed; }
  cache.set(key, video);
  return video;
}
async function seek(video: HTMLVideoElement, seconds: number, signal: AbortSignal) {
  if (Math.abs(video.currentTime - seconds) < 1e-3) return;
  const sought = event(video, 'seeked', signal); video.currentTime = seconds; await sought;
}

function checkPlayable(project: FilmProject, assets: Asset[]) {
  const seconds = toSeconds(filmLength(project));
  if (!seconds) throw new Error('Add shots to the timeline first.');
  if (missingAssets(project, assets.map((a) => a.id)).length) throw new Error('A source recording is missing.');
  return seconds;
}

/** Particles drawn into a transparent frame-sized canvas (positions from `particlesAt`, frame fractions). */
function drawParticles(canvas: HTMLCanvasElement, particles: ReturnType<typeof particlesAt>) {
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const H = canvas.height;
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha)); ctx.fillStyle = p.color;
    const x = p.x * canvas.width, y = p.y * H, r = p.size * H;
    if (p.rotation !== 0) { ctx.save(); ctx.translate(x, y); ctx.rotate((p.rotation * Math.PI) / 180); ctx.fillRect(-r, -r * 0.5, r * 2, r); ctx.restore(); }
    else { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); if (p.color === '#bfe9ff') { ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1, r * 0.15); ctx.stroke(); } else ctx.fill(); }
  }
  ctx.globalAlpha = 1;
}

/** Frame-sized canvases that titles are drawn into, one per title clip. */
const titleCanvases = new Map<string, HTMLCanvasElement>();
/** Drops the drawing canvases of titles that left the film. */
function forgetTitles(live: Set<string>) { for (const id of [...titleCanvases.keys()]) if (!live.has(id)) titleCanvases.delete(id); }
type Fonts = typeof import('./fonts');
let fonts: Promise<Fonts> | undefined;
/** Loads the title faces a moment needs (canvas text does not wait for web fonts by itself). */
async function titleFonts(layers: PlanLayer[]): Promise<Fonts> {
  const loaded = await (fonts ??= import('./fonts'));
  await Promise.all(layers.flatMap((l) => l.kind === 'title' && l.clip.title ? [loaded.fontReady(l.clip.title.font, l.clip.title.weight, 64)] : []));
  return loaded;
}

/** The picture of one moment: GPU layers when the compositor runs, otherwise the top picture only. */
async function picture(compositor: FilmCompositor | null, layers: PlanLayer[], videos: Map<string, HTMLVideoElement>, size: { width: number; height: number }) {
  if (!compositor) { const top = videoPlans(layers).filter((l) => videos.has(l.clip.id)).at(-1); return top ? videos.get(top.clip.id) : undefined; }
  const face = layers.some((l) => l.kind === 'title') ? await titleFonts(layers) : undefined;
  const media = (l: MediaPlan): MediaLayer | undefined => videos.has(l.clip.id)
    ? { kind: 'media', clip: l.clip, video: videos.get(l.clip.id)!, local: l.time - toSeconds(l.clip.in) } : undefined;
  const canvasFor = (id: string) => {
    let c = titleCanvases.get(id);
    if (!c || c.width !== size.width || c.height !== size.height) { c = document.createElement('canvas'); c.width = size.width; c.height = size.height; titleCanvases.set(id, c); }
    return c;
  };
  return compositor.compose(layers.flatMap((l): Layer[] => {
    if (l.kind === 'adjust') return [{ kind: 'adjust', clip: l.clip, local: l.local }];
    if (l.kind === 'particles') {
      const canvas = canvasFor(`fx:${l.clip.id}`), p = l.clip.params;
      drawParticles(canvas, particlesAt(String(p.kind) as ParticleKind, Number(p.seed), Math.round(Number(p.count)), l.local, Number(p.speed), Number(p.size)));
      return [{ kind: 'title', clip: l.clip, canvas }];
    }
    if (l.kind === 'media') { const m = media(l); return m ? [m] : []; }
    if (l.kind === 'transition') { const a = media(l.a), b = media(l.b); return a && b ? [{ kind: 'transition', clip: l.clip, spec: l.spec, progress: l.progress, a, b }] : []; }
    const canvas = canvasFor(l.clip.id);
    drawTitle(canvas, l.clip, l.progress, face!.fontFamily);
    return [{ kind: 'title', clip: l.clip, canvas }];
  }));
}
const sizeOf = (canvas: HTMLCanvasElement) => ({ width: canvas.width, height: canvas.height });

/** Preview and export share one timeline plan and clock. Output is real-time WebM. */
export async function render(project: FilmProject, assets: Asset[], canvas: HTMLCanvasElement,
  signal: AbortSignal, progress: (seconds: number) => void, record: boolean, from = 0,
  /** Peak level per meter lane in dBFS, about 30 times a second (FILM-08 meters). */
  levels?: (lanes: Record<string, number>) => void,
  /** Only this part (seconds), e.g. the film's In / Out (FILM-09); the whole film when absent. */
  range?: { from: number; to: number }): Promise<Blob | null> {
  const length = checkPlayable(project, assets);
  const first = Math.max(0, Math.min(range?.from ?? 0, length - .05)), duration = Math.max(first + .05, Math.min(length, range?.to ?? length));
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Video canvas unavailable.');
  if (document.hidden) throw new Error('Keep the editor visible during real-time playback/export.');
  const segments = pictureSegments(project), sounds = soundEvents(project, segments);
  const compositor = await compositorFor(sizeOf(canvas).width, sizeOf(canvas).height);
  compositor?.prune(clipIds(project)); // shaders of deleted or split-away clips are freed
  const urls: string[] = [], videos = new Map<string, HTMLVideoElement>(), chunks: Blob[] = [];
  const playing = new Set<AudioBufferSourceNode>();
  let audio: AudioContext | undefined, destination: MediaStreamAudioDestinationNode | undefined;
  let recorder: MediaRecorder | undefined, stream: MediaStream | undefined;
  const start = record ? first : Math.max(first, Math.min(from, duration - .05));
  try {
    const buffers = new Map<string, AudioBuffer>();
    const withSound = project.media.some((m) => m.hasSound);
    if (sounds.length || withSound) {
      audio = new AudioContext(); await audio.resume(); destination = audio.createMediaStreamDestination();
      for (const asset of new Set(sounds.map((s) => s.asset))) {
        if (signal.aborted) throw new Error('Cancelled.');
        buffers.set(asset, await audio.decodeAudioData(await assets.find((a) => a.id === asset)!.blob.arrayBuffer()));
      }
    }
    const slots = playerSlots(project), players = new Map<string, HTMLVideoElement>();
    for (const track of project.tracks) if (track.kind === 'picture' && !track.hidden) for (const clip of track.clips) {
      const media = clip.type === 'media' ? project.media.find((m) => m.id === clip.media) : undefined;
      if (clip.type === 'media' && media) videos.set(clip.id, await videoFor(clip, media, assets, players, urls, signal, slots.get(clip.id)));
    }
    const firstLayers = layersAt(project, start);
    for (const l of videoPlans(firstLayers)) if (videos.has(l.clip.id)) await seek(videos.get(l.clip.id)!, l.time, signal);
    drawFrame(ctx, await picture(compositor, firstLayers, videos, sizeOf(canvas)), []);
    if (record) {
      const mime = (audio ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'] :
        ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']).find(MediaRecorder.isTypeSupported);
      if (!mime) throw new Error('WebM recording is unavailable in this browser.');
      stream = canvas.captureStream(0);
      if (destination) destination.stream.getTracks().forEach((t) => stream!.addTrack(t));
      recorder = new MediaRecorder(stream, { mimeType: mime });
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); }; recorder.start(100);
    }
    // Sounds are scheduled on the audio clock against the same start as the picture clock.
    const clock = performance.now(), audioStart = audio ? audio.currentTime : 0;
    // Ducking (FILM-08): music and ambience go down while dialogue sounds play.
    const ducking = project.ducking ?? { on: true, amount: 10, fade: 0.3 };
    const dialogue = sounds.filter((x) => x.type === 'dialogue').map((x): [number, number] => [x.at, x.at + x.duration]);
    const meters = new Map<string, AnalyserNode>();
    const meter = (lane: string) => {
      let node = meters.get(lane);
      if (!node) { node = audio!.createAnalyser(); node.fftSize = 1024; meters.set(lane, node); }
      return node;
    };
    if (audio) for (const s of sounds) {
      const buffer = buffers.get(s.asset)!, skip = Math.max(0, start - s.at), offset = s.offset + skip;
      const length = Math.min(s.duration - skip, buffer.duration - offset);
      if (length <= 0) continue;
      const source = audio.createBufferSource(), gain = audio.createGain(); source.buffer = buffer;
      // One gain curve: animated volume x fades x ducking, sampled every 50 ms on the audio clock.
      const ducks = ducking.on && (s.type === 'music' || s.type === 'ambience') && dialogue.length;
      const gainAt = (t: number) => (s.volumeAt ? s.volumeAt(t) : s.volume) * fadeGain(t - s.at, s.duration, s.fadeIn, s.fadeOut)
        * (ducks ? duckGain(t, dialogue, ducking.amount, ducking.fade) : 1);
      const first = Math.max(start, s.at);
      gain.gain.setValueAtTime(gainAt(first), audioStart + Math.max(0, first - start));
      if (s.volumeAt || s.fadeIn || s.fadeOut || ducks) for (let t = first + 0.05; t <= s.at + s.duration; t += 0.05)
        gain.gain.linearRampToValueAtTime(gainAt(t), audioStart + Math.max(0, t - start));
      const lane = meter(s.lane);
      source.connect(gain); gain.connect(lane); gain.connect(destination!); if (!record) gain.connect(audio.destination);
      source.onended = () => { source.disconnect(); gain.disconnect(); playing.delete(source); };
      playing.add(source); source.start(audioStart + Math.max(0, s.at - start), offset, length);
    }
    // Recordings with the world's sound (FILM-08) play through the same mix: one gain per clip video,
    // set every frame from the clip volume, its fades, ducking under dialogue (it counts as ambience
    // unless typed) and, during a transition, a crossfade.
    const clipGain = new Map<string, GainNode>(), sources = new Map<HTMLVideoElement, MediaElementAudioSourceNode>();
    // A soloed sound track silences them, as it silences every other track; a muted track stays silent.
    const soloing = project.tracks.some((t) => t.kind === 'sound' && t.solo);
    if (audio && withSound && !soloing) for (const track of project.tracks) if (track.kind === 'picture' && !track.muted) for (const c of track.clips) {
      if (c.type !== 'media' || !project.media.find((m) => m.id === c.media)?.hasSound) continue;
      const video = videos.get(c.id); if (!video) continue;
      video.muted = false;
      // A shared player has one sound source (a media element allows only one); each clip has its own gain.
      let source = sources.get(video);
      if (!source) { source = audio.createMediaElementSource(video); sources.set(video, source); }
      const gain = audio.createGain(); gain.gain.value = 0;
      source.connect(gain); gain.connect(meter(track.id)); gain.connect(destination!); if (!record) gain.connect(audio.destination);
      clipGain.set(c.id, gain);
    }
    const soundOf = (layers: PlanLayer[], at: number) => {
      const level = new Map<string, number>();
      const add = (l: MediaPlan, k: number) => {
        if (!clipGain.has(l.clip.id)) return;
        const local = l.time - toSeconds(l.clip.in), type = l.clip.soundType ?? 'ambience';
        const g = l.clip.volume * fadeGain(local, toSeconds(l.clip.duration), toSeconds(l.clip.fade?.in ?? 0), toSeconds(l.clip.fade?.out ?? 0))
          * (ducking.on && (type === 'music' || type === 'ambience') && dialogue.length ? duckGain(at, dialogue, ducking.amount, ducking.fade) : 1);
        level.set(l.clip.id, (level.get(l.clip.id) ?? 0) + g * k);
      };
      for (const l of layers) {
        if (l.kind === 'media') add(l, 1);
        else if (l.kind === 'transition') { add(l.a, 1 - l.progress); add(l.b, l.progress); }
      }
      return level;
    };
    // Every visible clip under the playhead plays in step with the clock; a clip that drifts is put back.
    const stalled = new Map<string, { time: number; since: number }>();
    for (;;) {
      if (signal.aborted) throw new Error('Cancelled.');
      if (document.hidden) throw new Error('Playback stopped because the editor became hidden.');
      const at = start + (performance.now() - clock) / 1000;
      if (at >= duration) break;
      const layers = layersAt(project, at), live = new Set<string>();
      for (const l of videoPlans(layers)) {
        const video = videos.get(l.clip.id); if (!video) continue;
        live.add(l.clip.id);
        if (video.paused) { video.currentTime = l.time; void video.play().catch(() => {}); }
        else if (Math.abs(video.currentTime - l.time) > 0.25) video.currentTime = l.time;
        const seen = stalled.get(l.clip.id);
        if (!seen || seen.time !== video.currentTime) stalled.set(l.clip.id, { time: video.currentTime, since: performance.now() });
        else if (performance.now() - seen.since > 5000) throw new Error('Source video playback stalled.');
      }
      // A player shared by several clips keeps playing while any of them shows.
      const playing = new Set([...live].map((id) => videos.get(id)));
      for (const [id, video] of videos) if (!live.has(id)) { stalled.delete(id); if (!playing.has(video) && !video.paused) video.pause(); }
      if (clipGain.size) { const level = soundOf(layers, at); for (const [id, gain] of clipGain) gain.gain.setTargetAtTime(level.get(id) ?? 0, audio!.currentTime, 0.02); }
      drawFrame(ctx, await picture(compositor, layers, videos, sizeOf(canvas)), captionsAt(project, topSegment(layers, at), at), project.subtitleStyle); progress(at);
      if (levels && meters.size) {
        const data = new Float32Array(1024), out: Record<string, number> = {};
        for (const [lane, node] of meters) { node.getFloatTimeDomainData(data); let peak = 0; for (const v of data) peak = Math.max(peak, Math.abs(v)); out[lane] = 20 * Math.log10(peak || 1e-6); }
        levels(out);
      }
      if (stream) (stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack).requestFrame();
      await new Promise<void>((ok) => setTimeout(ok, 1000 / 30));
    }
    progress(duration);
    if (!recorder) return null;
    const stopped = event(recorder, 'stop', signal); recorder.stop(); await stopped;
    // The container is WebM; codec parameters belong inside it, not the artifact protocol MIME.
    const blob = new Blob(chunks, { type: 'video/webm' });
    if (!blob.size) throw new Error('Encoder returned an empty video.'); return blob;
  } finally {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    stream?.getTracks().forEach((t) => t.stop());
    const players = new Set(videos.values());
    for (const video of players) { video.pause(); video.removeAttribute('src'); video.load(); }
    compositor?.releaseVideos(players);
    urls.forEach(URL.revokeObjectURL);
    for (const sound of playing) { try { sound.stop(); } catch { /* Already ended. */ } sound.disconnect(); }
    if (audio) await audio.close();
  }
}

/** Video elements kept between moments while scrubbing (one per clip), so each frame only seeks. */
const still = new Map<string, { asset: string; video: HTMLVideoElement; url: string }>();
/** Still videos kept for scrubbing; browsers allow only a few dozen media players per page. */
const STILL_VIDEOS = 16;
function dropStill(id: string, compositor: FilmCompositor | null) {
  const kept = still.get(id); if (!kept) return;
  compositor?.releaseVideos([kept.video]); kept.video.removeAttribute('src'); kept.video.load(); URL.revokeObjectURL(kept.url); still.delete(id);
}
async function stillVideo(clip: MediaClip, media: Media, assets: Asset[], signal: AbortSignal) {
  const kept = still.get(clip.id);
  if (kept && kept.asset === media.asset) { still.delete(clip.id); still.set(clip.id, kept); return kept.video; } // most recently used last
  if (kept) { kept.video.removeAttribute('src'); kept.video.load(); URL.revokeObjectURL(kept.url); still.delete(clip.id); }
  const urls: string[] = [], cache = new Map<string, HTMLVideoElement>();
  const video = await videoFor(clip, media, assets, cache, urls, signal);
  still.set(clip.id, { asset: media.asset, video, url: urls[0]! });
  return video;
}

let drawing: Promise<unknown> = Promise.resolve();
/**
 * Draws the film at one moment onto a canvas; nothing plays and the editor's playhead is not touched.
 * Calls run one after another: the editor's scrubbing and an MCP `frame` share the still videos and
 * the compositor, so two draws at once could seek the same video or overwrite the same output.
 */
export function drawAt(project: FilmProject, assets: Asset[], canvas: HTMLCanvasElement, seconds: number, signal: AbortSignal,
  options: { ungraded?: boolean } = {}): Promise<void> {
  const run = drawing.then(() => drawOnce(project, assets, canvas, seconds, signal, options));
  drawing = run.catch(() => {});
  return run;
}
async function drawOnce(project: FilmProject, assets: Asset[], canvas: HTMLCanvasElement, seconds: number, signal: AbortSignal,
  options: { ungraded?: boolean }): Promise<void> {
  if (signal.aborted) throw new Error('Cancelled.');
  const duration = checkPlayable(project, assets);
  const at = Math.max(0, Math.min(seconds, duration - 1e-6));
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Video canvas unavailable.');
  const compositor = await compositorFor(sizeOf(canvas).width, sizeOf(canvas).height);
  compositor?.prune(clipIds(project)); // shaders of deleted or split-away clips are freed
  forgetTitles(clipIds(project));
  // Before / after (FILM-07): the same moment without Colour effects.
  const strip = <C extends MediaClip>(c: C): C => options.ungraded && c.effects ? { ...c, effects: c.effects.filter((e) => e.effect !== 'colour') } : c;
  const layers = layersAt(project, at).map((l): PlanLayer => !options.ungraded ? l : l.kind === 'media' ? { ...l, clip: strip(l.clip) }
    : l.kind === 'transition' ? { ...l, a: { ...l.a, clip: strip(l.a.clip) }, b: { ...l.b, clip: strip(l.b.clip) } } : l);
  const videos = new Map<string, HTMLVideoElement>();
  for (const l of videoPlans(layers)) {
    const video = await stillVideo(l.clip, l.media, assets, signal);
    await seek(video, l.time, signal);
    videos.set(l.clip.id, video);
  }
  // Clips that left the film give their video back, and only the most recently used few are kept.
  const live = new Set(project.tracks.flatMap((t) => t.clips.map((c) => c.id)));
  for (const id of [...still.keys()]) if (!live.has(id)) dropStill(id, compositor);
  for (const id of [...still.keys()]) if (still.size > STILL_VIDEOS && !videos.has(id)) dropStill(id, compositor);
  drawFrame(ctx, await picture(compositor, layers, videos, sizeOf(canvas)), captionsAt(project, topSegment(layers, at), at), project.subtitleStyle);
}

/** A PNG of the film at one moment (MCP `frame`). */
export async function renderFrame(project: FilmProject, assets: Asset[], seconds: number, width: number, height: number, signal: AbortSignal): Promise<Blob> {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  await drawAt(project, assets, canvas, seconds, signal);
  return new Promise((ok, fail) => canvas.toBlob((blob) => blob ? ok(blob) : fail(new Error('Frame could not be encoded.')), 'image/png'));
}

/** MediaRecorder WebM can initially lack duration metadata; force an end seek then return to start. */
export async function mediaDuration(blob: Blob, signal: AbortSignal): Promise<number> {
  const url = URL.createObjectURL(blob), video = document.createElement('video'); video.muted = true;
  try {
    video.src = url; const loaded = event(video, 'loadeddata', signal); video.load(); await loaded;
    if (!Number.isFinite(video.duration)) {
      const sought = event(video, 'seeked', signal); video.currentTime = 1e9; await sought;
    }
    if (!Number.isFinite(video.duration) || video.duration <= .1) throw new Error('Recording duration could not be read.');
    return video.duration;
  } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
}
