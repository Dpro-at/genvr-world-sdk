import { toSeconds, type FilmProject } from '@genvr/film';
import type { Asset } from './model';

/**
 * Subtitles from the film's voice and their translations (FILM-12). Everything runs in this browser with free
 * models (see subtitle-worker.ts); nothing is sent to a paid service.
 */

/** A language people can pick. `opus`: the English-to-it Opus-MT model; otherwise M2M100 translates. */
export interface SubtitleLanguage { code: string; label: string; native: string; opus?: string; rtl?: boolean }
export const SUBTITLE_LANGUAGES: readonly SubtitleLanguage[] = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'ar', label: 'Arabic', native: 'العربية', opus: 'Xenova/opus-mt-en-ar', rtl: true },
  { code: 'de', label: 'German', native: 'Deutsch', opus: 'Xenova/opus-mt-en-de' },
  { code: 'fr', label: 'French', native: 'Français', opus: 'Xenova/opus-mt-en-fr' },
  { code: 'es', label: 'Spanish', native: 'Español', opus: 'Xenova/opus-mt-en-es' },
  { code: 'it', label: 'Italian', native: 'Italiano', opus: 'Xenova/opus-mt-en-it' },
  { code: 'ru', label: 'Russian', native: 'Русский', opus: 'Xenova/opus-mt-en-ru' },
  { code: 'zh', label: 'Chinese', native: '中文', opus: 'Xenova/opus-mt-en-zh' },
  { code: 'nl', label: 'Dutch', native: 'Nederlands', opus: 'Xenova/opus-mt-en-nl' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी', opus: 'Xenova/opus-mt-en-hi' },
  { code: 'ja', label: 'Japanese', native: '日本語', opus: 'Xenova/opus-mt-en-jap' },
  { code: 'tr', label: 'Turkish', native: 'Türkçe' },
  { code: 'pt', label: 'Portuguese', native: 'Português' },
  { code: 'fa', label: 'Persian', native: 'فارسی', rtl: true },
  { code: 'ur', label: 'Urdu', native: 'اردو', rtl: true },
] as const;
export const M2M100 = 'Xenova/m2m100_418M';
export const languageOf = (code: string) => SUBTITLE_LANGUAGES.find((l) => l.code === code);
/** About how much a first use downloads (shown before it starts). */
export const DOWNLOAD_NOTE = 'Speech: about 80 MB once. Translation: about 110 MB per language (Turkish, Portuguese, Persian, Urdu: one shared model of about 500 MB).';

export interface Line { start: number; end: number; text: string }
type Report = (text: string) => void;

let worker: Worker | null = null, next = 1;
const call = <T,>(message: Record<string, unknown>, report: Report, signal: AbortSignal, transfer: Transferable[] = []) => new Promise<T>((resolve, reject) => {
  worker ??= new Worker(new URL('./subtitle-worker.ts', import.meta.url), { type: 'module', name: 'genvr-subtitles' });
  const id = next++, w = worker;
  const files = new Map<string, { loaded: number; total: number }>();
  const stop = () => { w.removeEventListener('message', listen); signal.removeEventListener('abort', abort); };
  const abort = () => { stop(); w.terminate(); if (worker === w) worker = null; reject(new Error('Cancelled.')); };
  const listen = (event: MessageEvent) => {
    const data = event.data as { id: number; kind: string; [key: string]: unknown };
    if (data.id !== id) return;
    if (data.kind === 'progress') {
      files.set(String(data.file), { loaded: Number(data.loaded), total: Number(data.total) });
      const all = [...files.values()], loaded = all.reduce((n, f) => n + f.loaded, 0), total = all.reduce((n, f) => n + f.total, 0);
      if (total) report(`Downloading the model once: ${Math.round(loaded / 1048576)} / ${Math.round(total / 1048576)} MB…`);
    } else if (data.kind === 'lines') report(`Translating ${data.done} / ${data.total} lines…`);
    else if (data.kind === 'done') { stop(); resolve(data as T); }
    else if (data.kind === 'error') { stop(); reject(new Error(String(data.message))); }
  };
  w.addEventListener('message', listen); signal.addEventListener('abort', abort);
  w.postMessage({ ...message, id }, transfer);
});

/** Decodes a recording or sound file to mono 16 kHz, the rate Whisper hears. */
async function decode16k(blob: Blob): Promise<Float32Array> {
  const buffer = await new OfflineAudioContext(1, 1, 16000).decodeAudioData(await blob.arrayBuffer());
  const out = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) { const data = buffer.getChannelData(c); for (let i = 0; i < out.length; i++) out[i]! += data[i]! / buffer.numberOfChannels; }
  return out;
}

/** Whether a stretch of 16 kHz sound is louder than about -40 dBFS (speech), not only wind or room noise. */
export function loudEnough(audio: Float32Array, from: number, to: number): boolean {
  const a = Math.max(0, Math.floor(from * 16000)), b = Math.min(audio.length, Math.ceil(to * 16000));
  if (b - a < 160) return false;
  let sum = 0;
  for (let i = a; i < b; i++) sum += audio[i]! * audio[i]!;
  return Math.sqrt(sum / (b - a)) > 0.01;
}

/** The sounding clips of the film: imported sound and recordings with world sound, on tracks that are not muted. */
export function soundingClips(project: FilmProject) {
  const solo = project.tracks.some((t) => t.solo);
  // Spoken translations (voice tracks with a language, FILM-12b) are never listened to: only the original voices.
  return project.tracks.filter((t) => (t.kind === 'sound' || t.kind === 'picture') && !t.lang && !t.muted && (!solo || t.solo)).flatMap((t) => t.clips.flatMap((clip) => {
    if (clip.type !== 'media') return [];
    const media = project.media.find((m) => m.id === clip.media);
    return media && (media.kind === 'audio' || (media.kind === 'video' && media.hasSound)) && (clip.volume ?? 1) > 0 ? [{ clip, media }] : [];
  }));
}

/**
 * Timed lines of what is said in the film, in film seconds. `spoken`: the language spoken (null: Whisper finds it).
 * `toEnglish`: Whisper writes English whatever is spoken (its own translate task), the base for other languages.
 */
export async function transcribe(project: FilmProject, assets: Asset[], options: { spoken: string | null; toEnglish: boolean }, report: Report, signal: AbortSignal): Promise<Line[]> {
  const clips = soundingClips(project);
  if (!clips.length) throw new Error('The film has no sound to listen to: import a voice or record with "Record the world\'s sound" on.');
  const decoded = new Map<string, Float32Array>(), lines: Line[] = [];
  for (const [i, { clip, media }] of clips.entries()) {
    const blob = assets.find((a) => a.id === media.asset)?.blob;
    if (!blob) continue;
    report(`Listening to clip ${i + 1} of ${clips.length}…`);
    let audio = decoded.get(media.asset);
    if (!audio) { audio = await decode16k(blob); decoded.set(media.asset, audio); }
    const from = Math.floor(toSeconds(clip.in) * 16000), length = toSeconds(clip.duration);
    const part = audio.slice(from, Math.min(audio.length, from + Math.ceil(length * 16000)));
    if (part.length < 1600) continue;
    const out = await call<{ lines: { start: number; end: number | null; text: string }[] }>(
      { kind: 'transcribe', audio: part, task: options.toEnglish ? 'translate' : 'transcribe', language: options.spoken }, report, signal);
    const offset = toSeconds(clip.start);
    for (const l of out.lines) {
      const end = Math.min(length, l.end ?? length);
      // Whisper writes words ("you", "Thank you.") over wind and silence; a line needs real sound under it.
      if (l.text && l.start < length && loudEnough(part, l.start, end)) lines.push({ start: offset + l.start, end: offset + end, text: l.text });
    }
  }
  return lines.sort((a, b) => a.start - b.start);
}

/** The lines in another language, from English lines. */
export async function translateLines(lines: Line[], target: string, report: Report, signal: AbortSignal): Promise<Line[]> {
  const language = languageOf(target);
  if (!language) throw new Error(`Unknown language ${target}.`);
  if (target === 'en') return lines;
  const out = await call<{ texts: string[] }>(language.opus
    ? { kind: 'translate', texts: lines.map((l) => l.text), model: language.opus }
    : { kind: 'translate', texts: lines.map((l) => l.text), model: M2M100, src: 'en', tgt: target }, report, signal);
  return lines.map((l, i) => ({ ...l, text: out.texts[i] ?? l.text }));
}

/** The typed dialogue of the recordings where it shows on the film, as English lines (the script when there is no sound). */
export function dialogueLines(project: FilmProject): Line[] {
  return project.tracks.filter((t) => t.kind === 'picture').flatMap((t) => t.clips.flatMap((c) => {
    if (c.type !== 'media') return [];
    const media = project.media.find((m) => m.id === c.media);
    return (media?.cues ?? []).filter((cue) => cue.text.trim() && cue.end > c.in && cue.start < c.in + c.duration).map((cue) => ({
      start: toSeconds(c.start + Math.max(0, cue.start - c.in)), end: toSeconds(c.start + Math.min(c.duration, cue.end - c.in)), text: cue.text.trim() }));
  })).sort((a, b) => a.start - b.start);
}

/**
 * Subtitles for each chosen language (FILM-12): what is said is heard (or, with no sound, the typed dialogue is used),
 * written in English, and translated; the spoken language itself is written as heard. Used by the panel and MCP.
 */
export async function buildSubtitles(project: FilmProject, assets: Asset[], options: { spoken: string | null; languages: string[] }, report: Report, signal: AbortSignal) {
  const unknown = options.languages.find((code) => !languageOf(code));
  if (unknown) throw new Error(`Unknown language ${unknown}; use ${SUBTITLE_LANGUAGES.map((l) => l.code).join(', ')}.`);
  const sounding = soundingClips(project).length > 0;
  let english: Line[];
  if (sounding) english = await transcribe(project, assets, { spoken: options.spoken, toEnglish: true }, report, signal);
  else {
    english = dialogueLines(project);
    if (!english.length) throw new Error('No voice and no dialogue in the film yet: record with sound, import a voice, or type dialogue in the Scene.');
    report('No sound in the film: the typed dialogue is used.');
  }
  if (!english.length) throw new Error('No speech was heard in the film.');
  const out: { lang: string; name: string; lines: Line[] }[] = [];
  for (const code of options.languages) {
    const lines = code === options.spoken && code !== 'en' && sounding
      ? await transcribe(project, assets, { spoken: code, toEnglish: false }, report, signal)
      : await translateLines(english, code, report, signal);
    out.push({ lang: code, name: languageOf(code)!.native.slice(0, 40), lines });
  }
  return out;
}
