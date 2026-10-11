/**
 * Transitions (FILM-01): a soft change on the cut between a clip and the clip right before it on the
 * same track. Stored on the second clip. Every kind is one function of progress 0..1 (the GPU code
 * lives with the compositor; `transitionMask` here is the CPU reference for the mask kinds).
 */
import type { FilmProject, MediaClip, Track } from './model.js';
import { mediaEnd } from './invariants.js';
import { end, fromSeconds, toSeconds, type Tick } from './time.js';

export type TransitionParam = { type: 'number'; label: string; min: number; max: number; step: number; default: number }
  | { type: 'choice'; label: string; options: readonly string[]; default: string };
export const TRANSITIONS = {
  dissolve: { label: 'Dissolve', params: {} },
  dip_black: { label: 'Dip to black', params: {} },
  dip_white: { label: 'Dip to white', params: {} },
  wipe: { label: 'Wipe', params: {
    angle: { type: 'number', label: 'Angle', min: -180, max: 180, step: 1, default: 0 },
    softness: { type: 'number', label: 'Softness', min: 0, max: 0.5, step: 0.01, default: 0.05 } } },
  iris: { label: 'Iris', params: {
    x: { type: 'number', label: 'Centre X', min: 0, max: 1, step: 0.01, default: 0.5 },
    y: { type: 'number', label: 'Centre Y', min: 0, max: 1, step: 0.01, default: 0.5 },
    softness: { type: 'number', label: 'Softness', min: 0, max: 0.5, step: 0.01, default: 0.05 } } },
  shape: { label: 'Shape wipe', params: {
    shape: { type: 'choice', label: 'Shape', options: ['star', 'heart', 'diamond', 'circle'], default: 'star' },
    softness: { type: 'number', label: 'Softness', min: 0, max: 0.5, step: 0.01, default: 0.05 } } },
  blocks: { label: 'Block dissolve', params: {
    size: { type: 'number', label: 'Block size (px)', min: 4, max: 200, step: 1, default: 32 },
    seed: { type: 'number', label: 'Seed', min: 0, max: 9999, step: 1, default: 1 } } },
} as const satisfies Record<string, { label: string; params: Record<string, TransitionParam> }>;
export type TransitionKind = keyof typeof TRANSITIONS;
export const TRANSITION_KINDS = Object.keys(TRANSITIONS) as TransitionKind[];
export interface TransitionSpec { kind: TransitionKind; duration: Tick; align: 'centre' | 'start' | 'end'; params: Record<string, number | string> }

export function transitionParams(kind: string, values: Record<string, number | string> = {}): Record<string, number | string> {
  if (!Object.hasOwn(TRANSITIONS, kind)) throw new Error(`Unknown transition ${kind}. Kinds: ${TRANSITION_KINDS.join(', ')}.`);
  const specs = TRANSITIONS[kind as TransitionKind].params as Record<string, TransitionParam>, out: Record<string, number | string> = {};
  for (const key of Object.keys(values)) if (!specs[key]) throw new Error(`${TRANSITIONS[kind as TransitionKind].label} has no setting "${key}".`);
  for (const [key, spec] of Object.entries(specs)) {
    const value = values[key] ?? spec.default;
    if (spec.type === 'number' && (typeof value !== 'number' || value < spec.min || value > spec.max)) throw new Error(`${spec.label} must be between ${spec.min} and ${spec.max}.`);
    if (spec.type === 'choice' && !spec.options.includes(String(value))) throw new Error(`${spec.label} must be one of ${spec.options.join(', ')}.`);
    out[key] = value;
  }
  return out;
}

/** The clip right before `clip` on its track when they touch (a cut), otherwise undefined. */
export function previousClip(track: Track, clip: MediaClip): MediaClip | undefined {
  const before = track.clips.find((c) => c.type === 'media' && end(c) === clip.start);
  return before as MediaClip | undefined;
}

/** Film time span of a transition: centred on the cut, starting at it, or ending at it. */
export function transitionWindow(clip: MediaClip, t: TransitionSpec): { from: Tick; to: Tick } {
  const cut = clip.start;
  return t.align === 'centre' ? { from: cut - t.duration / 2, to: cut + t.duration / 2 } : t.align === 'start' ? { from: cut, to: cut + t.duration } : { from: cut - t.duration, to: cut };
}

/**
 * Why a transition cannot sit on this cut, or null. It needs recording beyond the cut: the clip before
 * must go on after its end, the clip after must start earlier than its in point (handles).
 */
export function transitionProblem(project: FilmProject, track: Track, clip: MediaClip, t: TransitionSpec): string | null {
  const before = previousClip(track, clip);
  if (!before) return 'A transition needs a clip right before this one on the same track (no gap).';
  const w = transitionWindow(clip, t);
  const afterCut = w.to - clip.start, beforeCut = clip.start - w.from;
  // Before the cut the outgoing clip must still be playing, after it the incoming one.
  if (beforeCut > before.duration || afterCut > clip.duration) return 'The transition is longer than one of its clips.';
  const beforeEnd = mediaEnd(project, before.media);
  const needAfter = afterCut, haveAfter = beforeEnd === undefined ? Infinity : beforeEnd - (before.in + before.duration);
  const needBefore = beforeCut, haveBefore = clip.in;
  const name = (c: MediaClip) => c.name ?? project.media.find((m) => m.id === c.media)?.name ?? 'the clip';
  if (needAfter > haveAfter) return `${name(before)} has only ${toSeconds(Math.max(0, haveAfter)).toFixed(2)} s of recording after its end; use a shorter transition or align it to the end of the cut.`;
  if (needBefore > haveBefore) return `${name(clip)} has only ${toSeconds(haveBefore).toFixed(2)} s of recording before its start; use a shorter transition or align it to the start of the cut.`;
  return null;
}

// ---------- CPU references for the mask kinds (progress p: 0 = all A, 1 = all B) ----------

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-6))); return t * t * (3 - 2 * t); };
/** How much of B shows at uv (0..1) for progress p. */
export function transitionMask(kind: TransitionKind, params: Record<string, number | string>, uv: [number, number], p: number, aspect = 16 / 9): number {
  if (kind === 'dissolve' || kind === 'dip_black' || kind === 'dip_white') return p;
  const soft = Number(params.softness ?? 0.05);
  if (kind === 'wipe') {
    const a = (Number(params.angle ?? 0) * Math.PI) / 180, d = (uv[0] - 0.5) * Math.cos(a) + (uv[1] - 0.5) * Math.sin(a) + 0.5;
    const edge = p * (1 + soft);
    return 1 - smooth(edge - soft, edge, d);
  }
  if (kind === 'iris') {
    const r = Math.hypot((uv[0] - Number(params.x ?? 0.5)) * aspect, uv[1] - Number(params.y ?? 0.5));
    const edge = p * (Math.hypot(aspect, 1) + soft);
    return 1 - smooth(edge - soft, edge, r);
  }
  if (kind === 'blocks') {
    const size = Number(params.size ?? 32) / 720, bx = Math.floor((uv[0] * aspect) / size), by = Math.floor(uv[1] / size);
    let h = (bx * 374761393 + by * 668265263 + Number(params.seed ?? 1) * 2147483647) >>> 0;
    h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296 < p ? 1 : 0;
  }
  return p; // shape: drawn on the GPU (signed distance), the reference only checks the ends
}

/**
 * Bright full-frame changes closer than 1/3 s (kids rule: no strobing, a flash never repeats faster than
 * about three times a second): dip to white transitions and block dissolves shorter than 1/3 s.
 */
export function flashWarnings(project: FilmProject): string[] {
  const flashes: { at: Tick; what: string }[] = [];
  for (const track of project.tracks) for (const clip of track.clips) {
    if (clip.type !== 'media' || !clip.transition) continue;
    const t = clip.transition as TransitionSpec;
    if (t.kind === 'dip_white') flashes.push({ at: clip.start, what: 'dip to white' });
    if (t.kind === 'blocks' && t.duration < fromSeconds(1 / 3)) flashes.push({ at: clip.start, what: 'fast block dissolve' });
  }
  // Strong light bursts (FILM-03a) flash the frame as well.
  for (const track of project.tracks) for (const clip of track.clips) {
    const bursts = clip.type === 'effect' ? (clip.effect === 'light_burst' ? [clip.params] : [])
      : clip.type === 'media' ? (clip.effects ?? []).filter((e) => e.enabled && e.effect === 'light_burst').map((e) => e.params) : [];
    for (const p of bursts) if (Number(p.strength ?? 0.8) >= 1) flashes.push({ at: clip.start, what: 'strong light burst' });
  }
  flashes.sort((a, b) => a.at - b.at);
  const out: string[] = [];
  for (let i = 1; i < flashes.length; i++) if (flashes[i]!.at - flashes[i - 1]!.at < fromSeconds(1 / 3))
    out.push(`Flashing: ${flashes[i - 1]!.what} at ${toSeconds(flashes[i - 1]!.at).toFixed(2)} s and ${flashes[i]!.what} at ${toSeconds(flashes[i]!.at).toFixed(2)} s are closer than 1/3 s.`);
  for (const f of flashes) if (f.what === 'fast block dissolve') out.push(`Flashing: a block dissolve shorter than 1/3 s at ${toSeconds(f.at).toFixed(2)} s.`);
  return out;
}
