import type { Line } from './subtitles';

/**
 * Spoken voices for subtitle languages (FILM-12b): Piper voices run in this browser (piper-tts-web, MIT; the voice
 * files come once from Hugging Face and stay in the browser's private storage). Only voices with a licence that allows
 * commercial use ship; `check` marks a voice whose licence is not clear yet (testing only, decide before release).
 */
export interface Voice { id: string; licence: string; check?: boolean }
export const VOICES: Readonly<Record<string, Voice>> = {
  en: { id: 'en_US-joe-medium', licence: 'CC0' },
  de: { id: 'de_DE-thorsten-medium', licence: 'CC0' },
  es: { id: 'es_ES-davefx-medium', licence: 'CC0' },
  ru: { id: 'ru_RU-denis-medium', licence: 'CC0' },
  pt: { id: 'pt_BR-faber-medium', licence: 'CC0' },
  fa: { id: 'fa_IR-amir-medium', licence: 'CC0' },
  fr: { id: 'fr_FR-siwis-medium', licence: 'CC-BY 4.0' },
  nl: { id: 'nl_NL-mls-medium', licence: 'CC-BY 4.0' },
  ar: { id: 'ar_JO-kareem-medium', licence: 'dataset licence not stated', check: true },
};

/** A WAV file (16-bit mono) of samples. */
export function wav(samples: Float32Array, rate: number): Blob {
  const data = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (at: number, s: string) => { for (let i = 0; i < s.length; i++) data.setUint8(at + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); data.setUint32(4, 36 + samples.length * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true); data.setUint32(24, rate, true);
  data.setUint32(28, rate * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true); text(36, 'data'); data.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) data.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i]!)) * 0x7fff, true);
  return new Blob([data.buffer], { type: 'audio/wav' });
}

/**
 * Places spoken lines on one sound track of the film's length (FILM-12b): each line starts at its subtitle's time,
 * or right after the line before when that one is still speaking, so no two lines talk over each other.
 */
export function layLines(spoken: Array<{ start: number; samples: Float32Array }>, rate: number): Float32Array {
  let cursor = 0;
  const placed = spoken.map((line) => { const at = Math.max(Math.round(line.start * rate), cursor); cursor = at + line.samples.length; return { at, samples: line.samples }; });
  const out = new Float32Array(cursor);
  for (const p of placed) out.set(p.samples, p.at);
  return out;
}

let worker: Worker | null = null, next = 1;

/** The whole film's lines spoken in one language, as one WAV from the film's start. */
export async function speak(lines: Line[], lang: string, report: (text: string) => void, signal: AbortSignal): Promise<Blob> {
  const voice = VOICES[lang];
  if (!voice) throw new Error('No free voice for this language yet.');
  const said = lines.filter((l) => l.text.trim());
  if (!said.length) throw new Error('No lines to speak.');
  const wavs = await new Promise<ArrayBuffer[]>((resolve, reject) => {
    worker ??= new Worker(new URL('./dubbing-worker.ts', import.meta.url), { type: 'module', name: 'genvr-voices' });
    const id = next++, w = worker, out: ArrayBuffer[] = [];
    const stop = () => { w.removeEventListener('message', listen); signal.removeEventListener('abort', abort); };
    const abort = () => { stop(); w.terminate(); if (worker === w) worker = null; reject(new Error('Cancelled.')); };
    const listen = (event: MessageEvent) => {
      const data = event.data as { id: number; kind: string; [key: string]: unknown };
      if (data.id !== id) return;
      if (data.kind === 'progress' && Number(data.total)) report(`Downloading the voice once: ${Math.round(Number(data.loaded) / 1048576)} / ${Math.round(Number(data.total) / 1048576)} MB…`);
      else if (data.kind === 'line') { out[Number(data.index)] = data.wav as ArrayBuffer; report(`Speaking line ${Number(data.index) + 1} of ${said.length}…`); }
      else if (data.kind === 'done') { stop(); resolve(out); }
      else if (data.kind === 'error') { stop(); reject(new Error(String(data.message))); }
    };
    w.addEventListener('message', listen); signal.addEventListener('abort', abort);
    w.postMessage({ id, voiceId: voice.id, texts: said.map((l) => l.text) });
  });
  const rate = 22050, context = new OfflineAudioContext(1, 1, rate), spoken: Array<{ start: number; samples: Float32Array }> = [];
  for (const [i, data] of wavs.entries()) spoken.push({ start: said[i]!.start, samples: (await context.decodeAudioData(data)).getChannelData(0).slice() });
  return wav(layLines(spoken, rate), rate);
}
