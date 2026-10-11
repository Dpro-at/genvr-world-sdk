import type { Track } from '@genvr/film';

/**
 * How the timeline is laid out (FILM-09), as in professional editors: captions on top, then effect
 * layers, then picture tracks with the highest on top (V1 sits just above the divider), then the
 * sound tracks with A1 just under it.
 */
export function trackOrder(tracks: Track[]): { above: Track[]; below: Track[] } {
  // Subtitle languages and their voices (FILM-12c, owner N-062) live in the Subtitles panel; the timeline draws only
  // the shown language's subtitle row and voice row.
  const shown = tracks.find((t) => t.kind === 'caption' && t.lang && !t.hidden)?.lang;
  const of = (kind: Track['kind']) => tracks.filter((t) => t.kind === kind && (!t.lang || t.lang === shown));
  return { above: [...of('caption').reverse(), ...of('effect').reverse(), ...of('picture').reverse()], below: of('sound') };
}

/**
 * Ruler steps in seconds for `zoom` px per second at `fps` frames per second: labels on the first
 * step at least 110 px wide, small ticks on the first step at least 12 px wide.
 */
export function rulerSteps(zoom: number, fps: number): { label: number; tick: number } {
  const frame = 1 / fps;
  const steps = [frame, 2 * frame, 5 * frame, 10 * frame, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];
  const first = (px: number) => steps.find((s) => s * zoom >= px) ?? steps[steps.length - 1]!;
  return { label: first(110), tick: first(12) };
}

/** Row heights (px) the timeline can show; picture and sound rows share one size each, as in pro editors. */
export interface RowSizes { picture: number; sound: number }
export const ROWS_DEFAULT: RowSizes = { picture: 60, sound: 56 };
export const ROW_MIN = 22, ROW_MAX = 220, CAPTION_ROW = 28, EFFECT_ROW = 30;
export const rowHeight = (kind: Track['kind'], sizes: RowSizes) =>
  kind === 'caption' ? CAPTION_ROW : kind === 'effect' ? EFFECT_ROW : Math.max(ROW_MIN, Math.min(ROW_MAX, sizes[kind]));
