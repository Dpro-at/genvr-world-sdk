import { toSeconds } from './time.js';
import type { FilmProject } from './model.js';

/** A subtitle line in seconds of the film (FILM-12). */
export interface TimedLine { start: number; end: number; text: string }

/** The lines of one language's subtitle track, in film seconds and time order. */
export function subtitleLines(project: FilmProject, lang: string): TimedLine[] {
  const track = project.tracks.find((t) => t.kind === 'caption' && t.lang === lang);
  return (track?.clips ?? []).flatMap((c) => c.type === 'caption' ? [{ start: toSeconds(c.start), end: toSeconds(c.start + c.duration), text: c.text }] : [])
    .sort((a, b) => a.start - b.start);
}

const stamp = (seconds: number, comma: boolean) => {
  const ms = Math.max(0, Math.round(seconds * 1000)), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}${comma ? ',' : '.'}${pad(ms % 1000, 3)}`;
};
const clean = (text: string) => text.replace(/\r/g, '').replace(/\n{2,}/g, '\n').trim();

/** SubRip (.srt) text of the lines. */
export function toSrt(lines: TimedLine[]): string {
  return lines.filter((l) => clean(l.text)).map((l, i) => `${i + 1}\n${stamp(l.start, true)} --> ${stamp(l.end, true)}\n${clean(l.text)}\n`).join('\n');
}
/** WebVTT (.vtt) text of the lines. */
export function toVtt(lines: TimedLine[]): string {
  return `WEBVTT\n\n${lines.filter((l) => clean(l.text)).map((l) => `${stamp(l.start, false)} --> ${stamp(l.end, false)}\n${clean(l.text)}\n`).join('\n')}`;
}
