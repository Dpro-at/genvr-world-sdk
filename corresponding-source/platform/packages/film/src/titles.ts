/**
 * Titles (FILM-01): style, templates, text animators with a range selector, and presets as data.
 * An animator says what changes (opacity, offset, scale, rotation, spacing) and the selector says how
 * much each character / word / line is affected (0..1). "In" presets animate the selector offset from
 * covering everything (hidden state) to covering nothing (normal text), so letters arrive in order.
 */
import { presetSides, type Key } from './animate.js';
import { fromSeconds, type Tick } from './time.js';

export const TITLE_FONTS = ['nunito', 'serif', 'mono', 'display'] as const;
export type TitleFont = (typeof TITLE_FONTS)[number];
export interface TitleStyle {
  font: TitleFont; size: number; color: string; weight: 400 | 700 | 900; align: 'left' | 'center' | 'right';
  outline?: { color: string; width: number } | undefined; shadow: boolean; box?: { color: string; opacity: number } | undefined;
}
export const DEFAULT_TITLE: TitleStyle = { font: 'nunito', size: 72, color: '#ffffff', weight: 900, align: 'center', shadow: true };

export const TEMPLATES = {
  card: { label: 'Title card', style: { ...DEFAULT_TITLE, size: 96 }, subtitleSize: 0.4, position: [0, 0] as [number, number] },
  strip: { label: 'Name strip', style: { ...DEFAULT_TITLE, size: 44, weight: 700, align: 'left', box: { color: '#111827', opacity: 0.75 } } as TitleStyle,
    subtitleSize: 0.6, position: [-0.55, -0.68] as [number, number] },
  credits: { label: 'End credits', style: { ...DEFAULT_TITLE, size: 40, weight: 700 } as TitleStyle, subtitleSize: 0.7, position: [0, 0] as [number, number] },
} as const;
export type TemplateId = keyof typeof TEMPLATES;

export const SELECTOR_SHAPES = ['square', 'rampUp', 'rampDown', 'triangle', 'round', 'smooth'] as const;
export type SelectorShape = (typeof SELECTOR_SHAPES)[number];
export interface Selector {
  based: 'chars' | 'words' | 'lines'; shape: SelectorShape;
  /** Range in percent of the units; offset moves the range (all animatable). */
  start: number; end: number; offset: number;
  random: boolean; seed: number;
}
/** What changes at full amount: opacity is added (-1 hides), x/y in pixels at 1080p, scale added (-1 = zero size), rotation in degrees, tracking in pixels. */
export interface AnimatorProps { opacity?: number | undefined; x?: number | undefined; y?: number | undefined; scale?: number | undefined; rotation?: number | undefined; tracking?: number | undefined }
export interface Animator { id: string; preset?: string | undefined; props: AnimatorProps; selector: Selector }

const hash = (a: number, b: number) => { let x = (a * 374761393 + b * 668265263) >>> 0; x = ((x ^ (x >>> 13)) * 1274126177) >>> 0; return x ^ (x >>> 16); };
/** A fixed shuffled order of `n` units for a seed (same order every time). */
export function randomOrder(n: number, seed: number): number[] {
  return Array.from({ length: n }, (_, i) => i).sort((a, b) => hash(seed, a) - hash(seed, b));
}

/** How strongly a unit is affected (0..1) by a selector; `index` of `count` units. */
export function selectorAmount(s: Selector, index: number, count: number): number {
  if (count <= 0) return 0;
  const slot = s.random ? randomOrder(count, s.seed).indexOf(index) : index;
  const from = Math.min(s.start, s.end) + s.offset, to = Math.max(s.start, s.end) + s.offset;
  const width = to - from;
  // Position of the unit in percent, measured at its centre.
  const at = ((slot + 0.5) / count) * 100;
  if (width <= 0) return 0;
  const f = (at - from) / width; // 0..1 inside the range
  if (s.shape === 'square') return at >= from && at < to ? 1 : 0;
  if (s.shape === 'smooth') {
    // Full inside the range; fades over one unit just outside it, so edges never pop.
    const soft = 100 / count, e = at < from ? 1 - (from - at) / soft : at >= to ? 1 - (at - to) / soft : 1;
    const c = Math.min(1, Math.max(0, e));
    return c * c * (3 - 2 * c);
  }
  if (f < 0 || f >= 1) return 0;
  if (s.shape === 'rampUp') return f;
  if (s.shape === 'rampDown') return 1 - f;
  if (s.shape === 'triangle') return 1 - Math.abs(f * 2 - 1);
  return Math.sqrt(Math.max(0, 1 - (f * 2 - 1) ** 2)); // round
}

/** Splits text into units for a selector: characters (no spaces), words, or lines; each unit lists its character indexes. */
export function units(text: string, based: Selector['based']): number[][] {
  const out: number[][] = [];
  if (based === 'chars') { for (let i = 0; i < text.length; i++) if (!/\s/.test(text[i]!)) out.push([i]); return out; }
  const pattern = based === 'words' ? /\S+/g : /[^\n]+/g;
  for (const m of text.matchAll(pattern)) out.push(Array.from({ length: m[0].length }, (_, k) => m.index! + k).filter((i) => !/\s/.test(text[i]!)));
  return out;
}

/** Per character: the sum of every animator's props times its amount (characters in no unit get 0). */
export function glyphOffsets(text: string, animators: { props: AnimatorProps; selector: Selector }[]) {
  const out = Array.from({ length: text.length }, () => ({ opacity: 0, x: 0, y: 0, scale: 0, rotation: 0, tracking: 0 }));
  for (const a of animators) {
    const list = units(text, a.selector.based);
    list.forEach((unit, i) => {
      const k = selectorAmount(a.selector, i, list.length);
      if (!k) return;
      for (const c of unit) for (const key of ['opacity', 'x', 'y', 'scale', 'rotation', 'tracking'] as const) out[c]![key] += (a.props[key] ?? 0) * k;
    });
  }
  return out;
}

// ---------- presets (data) ----------

export interface TitlePreset { label: string; props: AnimatorProps; selector: Omit<Selector, 'offset' | 'seed'>; ease: 'linear' | 'easy' | 'in' | 'out'; seconds: number }
export const TITLE_PRESETS: Record<string, TitlePreset> = {
  typewriter: { label: 'Typewriter', props: { opacity: -1 }, selector: { based: 'chars', shape: 'square', start: 0, end: 100, random: false }, ease: 'linear', seconds: 1.5 },
  words_bounce: { label: 'Words bounce in', props: { opacity: -1, y: 60, scale: -0.6 }, selector: { based: 'words', shape: 'smooth', start: 0, end: 100, random: false }, ease: 'out', seconds: 1 },
  fade_up: { label: 'Fade up', props: { opacity: -1, y: 40 }, selector: { based: 'chars', shape: 'smooth', start: 0, end: 100, random: false }, ease: 'easy', seconds: 1 },
  drop_in: { label: 'Drop in', props: { opacity: -1, y: -220, rotation: -12 }, selector: { based: 'chars', shape: 'smooth', start: 0, end: 100, random: false }, ease: 'out', seconds: 1 },
};
export const TITLE_PRESET_IDS = Object.keys(TITLE_PRESETS);

/**
 * The animator and offset keys a preset adds. `edge` "in": offset 0 -> 100 from the clip start (the range
 * slides off the text, so letters arrive in reading order); "out": -100 -> 0 ending at the clip end (the
 * range slides onto the text from the start, so letters leave in reading order).
 * Key times are clip time (ticks since the clip start).
 */
export function presetAnimator(id: string, edge: 'in' | 'out', clipDuration: Tick, newId: () => string): { animator: Animator; keys: Key[] } {
  const preset = TITLE_PRESETS[id];
  if (!preset) throw new Error(`Unknown title preset ${id}. Presets: ${TITLE_PRESET_IDS.join(', ')}.`);
  const length = Math.min(fromSeconds(preset.seconds), clipDuration);
  const sides = presetSides(preset.ease);
  const animator: Animator = { id: newId(), preset: `${id}:${edge}`, props: { ...preset.props }, selector: { ...preset.selector, offset: 0, seed: 1 } };
  const keys: Key[] = edge === 'in'
    ? [{ id: newId(), at: 0, value: 0, ...sides }, { id: newId(), at: length, value: 100, ...sides }]
    : [{ id: newId(), at: clipDuration - length, value: -100, ...sides }, { id: newId(), at: clipDuration, value: 0, ...sides }];
  animator.selector = { ...animator.selector, offset: edge === 'in' ? 0 : -100 };
  return { animator, keys };
}
