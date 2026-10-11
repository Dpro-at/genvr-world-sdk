'use client';
import { useEffect, useState } from 'react';

/**
 * What the timeline draws inside clips (FILM-09): picture strips from recordings and sound
 * waveforms. Each is made once per asset, in this tab, and shared by every clip that uses it.
 */

/** Peak values per second of sound kept for waveforms (enough for the widest zoom). */
export const PEAKS_PER_SECOND = 200;

/** Loudest absolute sample of all channels in each 1/`perSecond` slice, 0..1. */
export function peaksOf(channels: Float32Array[], sampleRate: number, perSecond = PEAKS_PER_SECOND): Float32Array {
  const length = channels[0]?.length ?? 0, size = sampleRate / perSecond;
  const out = new Float32Array(Math.ceil(length / size));
  for (let i = 0; i < out.length; i++) {
    const from = Math.floor(i * size), to = Math.min(length, Math.floor((i + 1) * size));
    let peak = 0;
    for (const c of channels) for (let s = from; s < to; s++) { const v = Math.abs(c[s]!); if (v > peak) peak = v; }
    out[i] = Math.min(1, peak);
  }
  return out;
}

/** Waveform display gain: the clip gain, with the source raised to full scale but by at most +12 dB, so quiet speech stays readable and near-silence still looks silent. */
export function displayGain(sourcePeak: number, clipGain: number): number {
  return clipGain * Math.min(3.981072, 1 / Math.max(1e-9, sourcePeak));
}

/**
 * Bar heights (0..1), one per pixel column of a clip `width` px wide showing seconds `from`..`to` of
 * the sound: the loudest peak under each column, on a dB scale (-48 dB empty, 0 dB full) when
 * `dynamic`, otherwise linear. `gain(seconds)` multiplies the peaks (display gain, fades).
 */
export function waveformColumns(peaks: Float32Array, from: number, to: number, width: number,
  gain: (seconds: number) => number = () => 1, dynamic = true, perSecond = PEAKS_PER_SECOND): Float32Array {
  const columns = Math.max(0, Math.min(16384, Math.floor(width))), out = new Float32Array(columns);
  if (!columns || to <= from) return out;
  const per = (to - from) / columns;
  for (let x = 0; x < columns; x++) {
    const t0 = from + x * per, a = Math.floor(t0 * perSecond), b = Math.max(a + 1, Math.floor((t0 + per) * perSecond));
    let m = 0;
    for (let k = Math.max(0, a); k < Math.min(peaks.length, b); k++) if (peaks[k]! > m) m = peaks[k]!;
    const v = m * Math.max(0, gain(t0));
    out[x] = dynamic ? Math.max(0, Math.min(1, (20 * Math.log10(Math.max(1e-5, v)) + 48) / 48)) : Math.min(1, v);
  }
  return out;
}

/** Loudest peak of a whole sound (for the display gain). */
export const sourcePeak = (peaks: Float32Array) => peaks.reduce((m, v) => (v > m ? v : m), 0);

/** Seconds between strip frames for a recording of `duration` seconds: at most 60 frames, at least half a second apart. */
export const frameStep = (duration: number) => Math.max(0.5, duration / 60);

/** Which strip frame to show at `seconds` of the recording. */
export const frameIndex = (seconds: number, step: number, count: number) => Math.max(0, Math.min(count - 1, Math.floor(seconds / step + 0.5)));

export interface Strip { url: string; count: number; step: number; width: number; height: number }

const strips = new Map<string, Promise<Strip | null>>();
const peaks = new Map<string, Promise<Float32Array | null>>();
const STRIP_HEIGHT = 48;

/** One image holding the frames of a recording side by side (made once, in the background). */
export function stripOf(id: string, blob: Blob, duration: number): Promise<Strip | null> {
  let job = strips.get(id);
  if (!job) {
    job = (async () => {
      // A recording never changes under its id, so its strip is kept in this browser and made only once.
      const kept = await cacheGet<{ image: Blob; count: number; step: number; width: number; height: number }>(`strip:${id}`);
      if (kept) return { url: URL.createObjectURL(kept.image), count: kept.count, step: kept.step, width: kept.width, height: kept.height };
      const made = await makeStrip(blob, duration);
      if (made) void cachePut(`strip:${id}`, { image: made.image, count: made.count, step: made.step, width: made.width, height: made.height });
      return made ? { url: URL.createObjectURL(made.image), count: made.count, step: made.step, width: made.width, height: made.height } : null;
    })().catch(() => null);
    strips.set(id, job);
  }
  return job;
}

async function makeStrip(blob: Blob, duration: number): Promise<(Omit<Strip, 'url'> & { image: Blob }) | null> {
  const url = URL.createObjectURL(blob), video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = url;
  try {
    await new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(new Error('unreadable')); });
    const height = STRIP_HEIGHT, width = Math.round(height * ((video.videoWidth || 16) / (video.videoHeight || 9)));
    const step = frameStep(duration), count = Math.max(1, Math.ceil(duration / step));
    const canvas = document.createElement('canvas'); canvas.width = width * count; canvas.height = height;
    const context = canvas.getContext('2d'); if (!context) return null;
    for (let i = 0; i < count; i++) {
      // Recorded WebM has no seek index, so frames are taken in order; each seek waits for its frame.
      const at = Math.min(Math.max(0.05, i * step), Math.max(0.05, duration - 0.05));
      await new Promise<void>((resolve) => { const done = () => { clearTimeout(timer); resolve(); }; const timer = setTimeout(done, 1500); video.onseeked = done; video.currentTime = at; });
      context.drawImage(video, i * width, 0, width, height);
    }
    const image = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.7));
    return image ? { image, count, step, width, height } : null;
  } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
}

/** Waveform peaks of a sound or a recording with sound (decoded once, in the background). */
export function peaksFor(id: string, blob: Blob): Promise<Float32Array | null> {
  let job = peaks.get(id);
  if (!job) {
    job = (async () => {
      const kept = await cacheGet<Float32Array>(`peaks:${id}`);
      if (kept) return kept;
      const context = new OfflineAudioContext(1, 1, 44100);
      const buffer = await context.decodeAudioData(await blob.arrayBuffer());
      const made = peaksOf(Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c)), buffer.sampleRate);
      void cachePut(`peaks:${id}`, made);
      return made;
    })().catch(() => null);
    peaks.set(id, job);
  }
  return job;
}

/**
 * A small store in this browser for timeline pictures and waveforms (FILM-09), keyed by recording
 * id. Losing it only means they are made again; every failure is treated as a miss.
 */
const CACHE_DB = 'genvr-film-timeline', CACHE_STORE = 'previews';
let cacheDb: Promise<IDBDatabase | null> | null = null;
function openCache(): Promise<IDBDatabase | null> {
  cacheDb ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(CACHE_DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(CACHE_STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return cacheDb;
}
async function cacheGet<T>(key: string): Promise<T | null> {
  const db = await openCache(); if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(CACHE_STORE).objectStore(CACHE_STORE).get(key);
      request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
      request.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function cachePut(key: string, value: unknown): Promise<void> {
  const db = await openCache(); if (!db) return;
  try { db.transaction(CACHE_STORE, 'readwrite').objectStore(CACHE_STORE).put(value, key); } catch { /* Full or blocked: they are made again next time. */ }
}

/** Resolves a background job into React state; null while it runs or when it cannot be made. */
export function useJob<T>(make: (() => Promise<T | null>) | null, key: string): T | null {
  const [value, setValue] = useState<{ key: string; value: T | null } | null>(null);
  useEffect(() => {
    if (!make) return;
    let live = true;
    void make().then((v) => { if (live) setValue({ key, value: v }); });
    return () => { live = false; };
  }, [key]);
  return value?.key === key ? value.value : null;
}
