/**
 * Film time is a whole number of ticks. 254 016 000 000 ticks per second divides every common
 * frame duration (23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120) and every common audio
 * sample duration (8 kHz to 192 kHz, also the 44.1 kHz family), so trims, splits and frame math
 * never drift. Three hours are 2.7e15 ticks, inside Number.MAX_SAFE_INTEGER (9e15).
 * Seconds appear only at the edges: the UI, command arguments and the browser's video clock.
 */
export const TICKS_PER_SECOND = 254_016_000_000;
export type Tick = number;

export interface FrameRate { num: number; den: number }
export const DEFAULT_RATE: FrameRate = { num: 30, den: 1 };

export const isTick = (value: unknown): value is Tick => Number.isSafeInteger(value);
export const fromSeconds = (seconds: number): Tick => Math.round(seconds * TICKS_PER_SECOND);
export const toSeconds = (ticks: Tick): number => ticks / TICKS_PER_SECOND;

/** True when one frame of this rate is a whole number of ticks. */
export const validRate = (rate: FrameRate): boolean =>
  Number.isSafeInteger(rate.num) && Number.isSafeInteger(rate.den) && rate.num > 0 && rate.den > 0 &&
  (TICKS_PER_SECOND * rate.den) % rate.num === 0;

/** Ticks in one frame. */
export const frame = (rate: FrameRate): Tick => (TICKS_PER_SECOND * rate.den) / rate.num;

/** The nearest frame boundary. */
export const snap = (ticks: Tick, rate: FrameRate): Tick => Math.round(ticks / frame(rate)) * frame(rate);
/** The frame boundary at or before `ticks`. */
export const floorFrame = (ticks: Tick, rate: FrameRate): Tick => Math.floor(ticks / frame(rate)) * frame(rate);
export const onFrame = (ticks: Tick, rate: FrameRate): boolean => ticks % frame(rate) === 0;

/** Seconds from a person or an agent, turned into ticks on the nearest frame. */
export const secondsOnFrame = (seconds: number, rate: FrameRate): Tick => snap(fromSeconds(seconds), rate);

export interface TimeRange { start: Tick; duration: Tick }
export const end = (range: TimeRange): Tick => range.start + range.duration;
export const contains = (range: TimeRange, at: Tick): boolean => at >= range.start && at < end(range);
export const overlaps = (a: TimeRange, b: TimeRange): boolean => a.start < end(b) && b.start < end(a);

/** `00:00:12:15` (hours:minutes:seconds:frames); non-drop display only. */
export function timecode(ticks: Tick, rate: FrameRate): string {
  const fps = Math.round(rate.num / rate.den);
  const frames = Math.floor(ticks / frame(rate));
  const ff = frames % fps, total = Math.floor(frames / fps);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(Math.floor(total / 3600))}:${two(Math.floor(total / 60) % 60)}:${two(total % 60)}:${two(ff)}`;
}

/** Seconds with two decimals, for messages. */
export const label = (ticks: Tick): string => `${toSeconds(ticks).toFixed(2)} s`;
