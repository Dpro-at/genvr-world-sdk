/**
 * Animated values (FILM-06): keys with linear, hold, Bezier and auto interpolation. Bezier eases are
 * given as speed (value units per second) and influence (share of the segment, 0.001..1), the numbers
 * an editor shows; Easy Ease is speed 0 with influence 1/3. Position is spatial: it moves along a
 * curved path through its keys at an even speed (arc-length table), with its own ease on top.
 */
import type { Tick } from './time.js';
import { toSeconds } from './time.js';

export type KeyValue = number | [number, number];
export type Interp = 'linear' | 'hold' | 'bezier' | 'auto';
export interface Side { interp: Interp; speed?: number | undefined; influence?: number | undefined }
export interface Key { id: string; at: Tick; value: KeyValue; in: Side; out: Side }

export const EASE_PRESETS = ['linear', 'easy', 'in', 'out', 'hold'] as const;
export type EasePreset = (typeof EASE_PRESETS)[number];
/** What a preset does to the two sides of a key ("in" eases the arrival, "out" the departure, like an editor's Ease In / Ease Out). */
export function presetSides(preset: EasePreset): { in: Side; out: Side } {
  const easy: Side = { interp: 'bezier', speed: 0, influence: 1 / 3 }, line: Side = { interp: 'linear' };
  if (preset === 'easy') return { in: easy, out: easy };
  if (preset === 'in') return { in: easy, out: line };
  if (preset === 'out') return { in: line, out: easy };
  if (preset === 'hold') return { in: line, out: { interp: 'hold' } };
  return { in: line, out: line };
}

const isPoint = (v: KeyValue): v is [number, number] => Array.isArray(v);
const sorted = (keys: Key[]) => [...keys].sort((a, b) => a.at - b.at);

// ---------- 1D Bezier with speed + influence ----------

function cubic(p0: number, p1: number, p2: number, p3: number, u: number) {
  const m = 1 - u;
  return m * m * m * p0 + 3 * m * m * u * p1 + 3 * m * u * u * p2 + u * u * u * p3;
}
/** Solves x(u) = x for a cubic whose x grows monotonically (Newton with a bisection fallback). */
function solve(x0: number, x1: number, x2: number, x3: number, x: number) {
  let lo = 0, hi = 1, u = (x - x0) / (x3 - x0 || 1);
  for (let i = 0; i < 24; i++) {
    const value = cubic(x0, x1, x2, x3, u) - x;
    if (Math.abs(value) < 1e-9) return u;
    if (value > 0) hi = u; else lo = u;
    const m = 1 - u, slope = 3 * m * m * (x1 - x0) + 6 * m * u * (x2 - x1) + 3 * u * u * (x3 - x2);
    const next = slope > 1e-12 ? u - value / slope : (lo + hi) / 2;
    u = next > lo && next < hi ? next : (lo + hi) / 2;
  }
  return u;
}

/** Value between two scalar keys at time t (seconds); `before`/`after` are the neighbours for auto tangents. */
function segment(t: number, k0: { t: number; v: number; out: Side }, k1: { t: number; v: number; in: Side },
  before?: { t: number; v: number }, after?: { t: number; v: number }): number {
  const dt = k1.t - k0.t;
  if (dt <= 0 || k0.out.interp === 'hold') return k0.v;
  const slope = (k1.v - k0.v) / dt;
  if (k0.out.interp === 'linear' && k1.in.interp === 'linear') return k0.v + slope * (t - k0.t);
  const auto = (a?: { t: number; v: number }, b?: { t: number; v: number }) => a && b ? (b.v - a.v) / (b.t - a.t) : slope;
  const sideOut = k0.out.interp === 'linear' ? slope : k0.out.interp === 'auto' ? auto(before ?? k0, k1) : k0.out.speed ?? 0;
  const sideIn = k1.in.interp === 'linear' ? slope : k1.in.interp === 'auto' ? auto(k0, after ?? k1) : k1.in.speed ?? 0;
  const infOut = k0.out.interp === 'bezier' ? k0.out.influence ?? 1 / 3 : 1 / 3;
  const infIn = k1.in.interp === 'bezier' ? k1.in.influence ?? 1 / 3 : 1 / 3;
  const x1 = k0.t + infOut * dt, y1 = k0.v + sideOut * infOut * dt;
  const x2 = k1.t - infIn * dt, y2 = k1.v - sideIn * infIn * dt;
  const u = solve(k0.t, x1, x2, k1.t, t);
  return cubic(k0.v, y1, y2, k1.v, u);
}

/** A scalar animation at time t (ticks, in the same time base as the keys). */
export function evaluateScalar(keys: Key[], at: Tick): number {
  const list = sorted(keys), t = toSeconds(at);
  if (!list.length) return 0;
  const v = (k: Key) => k.value as number;
  if (t <= toSeconds(list[0]!.at)) return v(list[0]!);
  if (t >= toSeconds(list.at(-1)!.at)) return v(list.at(-1)!);
  const i = list.findIndex((k, n) => toSeconds(k.at) <= t && toSeconds(list[n + 1]!.at) > t);
  const a = list[i]!, b = list[i + 1]!, pa = list[i - 1], nb = list[i + 2];
  return segment(t, { t: toSeconds(a.at), v: v(a), out: a.out }, { t: toSeconds(b.at), v: v(b), in: b.in },
    pa && { t: toSeconds(pa.at), v: v(pa) }, nb && { t: toSeconds(nb.at), v: v(nb) });
}

// ---------- spatial (position) ----------

type P = [number, number];
/** Catmull-Rom control points for the curve from key i to i+1 (straight when a side is linear or hold). */
function spatialControls(points: P[], i: number, sides: { out: Side; in: Side }): [P, P, P, P] {
  const p0 = points[i]!, p3 = points[i + 1]!;
  const prev = points[i - 1] ?? p0, next = points[i + 2] ?? p3;
  const curvedOut = sides.out.interp === 'auto' || sides.out.interp === 'bezier';
  const curvedIn = sides.in.interp === 'auto' || sides.in.interp === 'bezier';
  const p1: P = curvedOut ? [p0[0] + (p3[0] - prev[0]) / 6, p0[1] + (p3[1] - prev[1]) / 6] : [p0[0] + (p3[0] - p0[0]) / 3, p0[1] + (p3[1] - p0[1]) / 3];
  const p2: P = curvedIn ? [p3[0] - (next[0] - p0[0]) / 6, p3[1] - (next[1] - p0[1]) / 6] : [p3[0] - (p3[0] - p0[0]) / 3, p3[1] - (p3[1] - p0[1]) / 3];
  return [p0, p1, p2, p3];
}
const point = (c: [P, P, P, P], u: number): P => [cubic(c[0][0], c[1][0], c[2][0], c[3][0], u), cubic(c[0][1], c[1][1], c[2][1], c[3][1], u)];
/** Arc-length table: 64 samples per segment, so a position moves at an even speed along the curve. */
function arcTable(c: [P, P, P, P]) {
  const lengths = [0];
  let last = c[0];
  for (let n = 1; n <= 64; n++) { const p = point(c, n / 64); lengths.push(lengths.at(-1)! + Math.hypot(p[0] - last[0], p[1] - last[1])); last = p; }
  return lengths;
}
function atDistance(c: [P, P, P, P], table: number[], distance: number): P {
  const total = table.at(-1)!;
  if (total <= 0) return c[0];
  const target = Math.min(total, Math.max(0, distance));
  const n = table.findIndex((l) => l >= target);
  if (n <= 0) return c[0];
  const f = (target - table[n - 1]!) / (table[n]! - table[n - 1]! || 1);
  return point(c, (n - 1 + f) / 64);
}

/** A 2D animation at time t: the spatial curve, travelled with the keys' temporal ease. */
export function evaluatePoint(keys: Key[], at: Tick): P {
  const list = sorted(keys), t = toSeconds(at);
  if (!list.length) return [0, 0];
  const pts = list.map((k) => k.value as P);
  if (t <= toSeconds(list[0]!.at)) return pts[0]!;
  if (t >= toSeconds(list.at(-1)!.at)) return pts.at(-1)!;
  const i = list.findIndex((k, n) => toSeconds(k.at) <= t && toSeconds(list[n + 1]!.at) > t);
  const a = list[i]!, b = list[i + 1]!;
  if (a.out.interp === 'hold') return pts[i]!;
  const curve = spatialControls(pts, i, { out: a.out, in: b.in }), table = arcTable(curve), length = table.at(-1)!;
  // Temporal ease along the path: distance 0 -> length; linear keys move at constant speed.
  const ease = (s: Side): Side => s.interp === 'auto' ? { interp: 'linear' } : s;
  const distance = segment(t, { t: toSeconds(a.at), v: 0, out: ease(a.out) }, { t: toSeconds(b.at), v: length, in: ease(b.in) });
  return atDistance(curve, table, distance);
}

export function evaluate(keys: Key[], at: Tick): KeyValue {
  return keys.length && isPoint(keys[0]!.value) ? evaluatePoint(keys, at) : evaluateScalar(keys, at);
}

/** Points along the whole motion path (for drawing it on the Program monitor). */
export function pathPoints(keys: Key[], perSegment = 24): P[] {
  const list = sorted(keys), pts = list.map((k) => k.value as P), out: P[] = [];
  for (let i = 0; i + 1 < list.length; i++) {
    const curve = spatialControls(pts, i, { out: list[i]!.out, in: list[i + 1]!.in });
    for (let n = 0; n < perSegment; n++) out.push(point(curve, n / perSegment));
  }
  if (pts.length) out.push(pts.at(-1)!);
  return out;
}

/** Rate of change at t (value units per second; for a point, its speed along the path). */
export function velocity(keys: Key[], at: Tick, tick = 254_016_000): number {
  const a = evaluate(keys, at - tick), b = evaluate(keys, at + tick), dt = (2 * tick) / 254_016_000_000;
  return isPoint(a) ? Math.hypot((b as P)[0] - a[0], (b as P)[1] - a[1]) / dt : ((b as number) - a) / dt;
}
