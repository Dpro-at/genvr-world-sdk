'use client';
import { useEffect, useRef } from 'react';
import { fadeGain, toSeconds, type Media, type MediaClip } from '@genvr/film';
import { displayGain, frameIndex, peaksFor, sourcePeak, stripOf, useJob, waveformColumns } from '../../../lib/video-studio/thumbs';

/** Waveform colour, as in professional editors: light blue bars on the clip colour. */
export const WAVE = '#79c0f9';

/**
 * Pictures of a recording in a timeline clip (FILM-09). `head`: one frame at the clip's in point,
 * left-aligned at its true shape (as FilmCraft and Premiere); otherwise frames repeat across the clip.
 */
export function ClipStrip({ clip, media, blob, zoom, height, head }: { clip: MediaClip; media: Media; blob: Blob | undefined; zoom: number; height: number; head: boolean }) {
  const strip = useJob(blob && media.kind === 'video' ? () => stripOf(media.asset, blob, toSeconds(media.duration)) : null, `${media.asset}:${!!blob}`);
  if (!strip || height < 12) return null;
  const tile = Math.max(8, Math.round(strip.width * (height / strip.height))), from = toSeconds(clip.in), width = toSeconds(clip.duration) * zoom;
  const tiles = head ? 1 : Math.min(400, Math.ceil(width / tile));
  return <div aria-hidden className="pointer-events-none absolute inset-x-px overflow-hidden" style={{ height }}>
    {Array.from({ length: tiles }, (_, k) => <span key={k} className="absolute top-0"
      style={{ left: k * tile, width: tile, height, backgroundImage: `url(${strip.url})`, backgroundSize: `${strip.count * tile}px ${height}px`,
        backgroundPosition: `${-frameIndex(head ? from : from + (k * tile + tile / 2) / zoom, strip.step, strip.count) * tile}px 0` }} />)}
  </div>;
}

/**
 * The sound of a clip (FILM-09): one bar per pixel column rising from the bottom, the loudest peak
 * under it on a dB scale, the source raised to full scale by at most +12 dB, shaped by the clip
 * volume and fades. A channel badge sits in the corner.
 */
export function ClipWave({ clip, media, blob, zoom, height, dynamic = true }: { clip: MediaClip; media: Media; blob: Blob | undefined; zoom: number; height: number; dynamic?: boolean }) {
  const sounding = media.kind === 'audio' || !!media.hasSound;
  const peaks = useJob(blob && sounding ? () => peaksFor(media.asset, blob) : null, `${media.asset}:${!!blob && sounding}`);
  const canvas = useRef<HTMLCanvasElement>(null);
  const from = toSeconds(clip.in), length = toSeconds(clip.duration), width = Math.max(1, Math.min(16384, Math.floor(length * zoom)));
  const fadeIn = toSeconds(clip.fade?.in ?? 0), fadeOut = toSeconds(clip.fade?.out ?? 0);
  useEffect(() => {
    const c = canvas.current, context = c?.getContext('2d');
    if (!c || !context || !peaks) return;
    const scale = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(width * scale); c.height = Math.round(height * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0); context.clearRect(0, 0, width, height);
    const gain = displayGain(sourcePeak(peaks), clip.volume);
    const bars = waveformColumns(peaks, from, from + length, width, (t) => gain * fadeGain(t - from, length, fadeIn, fadeOut), dynamic);
    context.fillStyle = WAVE;
    for (let x = 0; x < bars.length; x++) { const h = bars[x]! * height; if (h > 0.3) context.fillRect(x, height - h, 1, h); }
  }, [peaks, width, height, from, length, fadeIn, fadeOut, clip.volume, dynamic]);
  if (!peaks || height < 6) return null;
  return <>
    <canvas ref={canvas} aria-hidden className="pointer-events-none absolute bottom-0 left-0" style={{ width, height }} />
    {width > 30 ? <span aria-hidden className="pointer-events-none absolute bottom-0.5 left-[3px] flex h-[9px] w-2 items-center justify-center rounded-[1px] bg-black/60 text-[7px] leading-none text-[#d9d9d9]">1</span> : null}
  </>;
}
