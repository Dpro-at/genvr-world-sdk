/**
 * The effects the editor can apply (FILM-05), as plain data: ids, labels and parameter ranges.
 * The GPU code that draws them lives with the compositor; the CPU references here define what each
 * one must do (tests compare against them) and the film checks parameters against the ranges.
 */
export type EffectParam =
  | { type: 'number'; label: string; min: number; max: number; step: number; default: number }
  | { type: 'color'; label: string; default: string }
  | { type: 'choice'; label: string; options: readonly string[]; default: string };
export interface EffectInfo { label: string; params: Record<string, EffectParam> }

export const EFFECTS = {
  blur: { label: 'Blur', params: { radius: { type: 'number', label: 'Radius (px)', min: 0, max: 40, step: 0.5, default: 6 } } },
  brightness_contrast: { label: 'Brightness / contrast', params: {
    brightness: { type: 'number', label: 'Brightness', min: -1, max: 1, step: 0.01, default: 0 },
    contrast: { type: 'number', label: 'Contrast', min: 0, max: 3, step: 0.01, default: 1 },
  } },
  tint: { label: 'Tint', params: {
    color: { type: 'color', label: 'Colour', default: '#ff9a3c' },
    amount: { type: 'number', label: 'Amount', min: 0, max: 1, step: 0.01, default: 0.5 },
  } },
  colour: { label: 'Colour', params: {
    exposure: { type: 'number', label: 'Exposure (stops)', min: -3, max: 3, step: 0.05, default: 0 },
    contrast: { type: 'number', label: 'Contrast', min: 0, max: 2, step: 0.01, default: 1 },
    saturation: { type: 'number', label: 'Saturation', min: 0, max: 2, step: 0.01, default: 1 },
    temperature: { type: 'number', label: 'Temperature', min: -1, max: 1, step: 0.01, default: 0 },
    tint: { type: 'number', label: 'Tint (green / magenta)', min: -1, max: 1, step: 0.01, default: 0 },
    highlights: { type: 'number', label: 'Highlights', min: -1, max: 1, step: 0.01, default: 0 },
    shadows: { type: 'number', label: 'Shadows', min: -1, max: 1, step: 0.01, default: 0 },
    vignette: { type: 'number', label: 'Vignette', min: 0, max: 1, step: 0.01, default: 0 },
  } },
  // Scene effects (FILM-03a): seeded, the same in every playback and export.
  shake: { label: 'Camera shake', params: {
    amount: { type: 'number', label: 'Amount', min: 0, max: 1, step: 0.01, default: 0.5 },
    frequency: { type: 'number', label: 'Speed (Hz)', min: 0.5, max: 20, step: 0.1, default: 6 },
    seed: { type: 'number', label: 'Seed', min: 0, max: 9999, step: 1, default: 1 },
  } },
  light_burst: { label: 'Light burst', params: {
    x: { type: 'number', label: 'Centre X', min: 0, max: 1, step: 0.01, default: 0.5 },
    y: { type: 'number', label: 'Centre Y', min: 0, max: 1, step: 0.01, default: 0.5 },
    strength: { type: 'number', label: 'Strength', min: 0, max: 2, step: 0.01, default: 0.8 },
    decay: { type: 'number', label: 'Spread', min: 0, max: 1, step: 0.01, default: 0.4 },
    color: { type: 'color', label: 'Colour', default: '#fff2c4' },
  } },
  shockwave: { label: 'Shockwave', params: {
    x: { type: 'number', label: 'Centre X', min: 0, max: 1, step: 0.01, default: 0.5 },
    y: { type: 'number', label: 'Centre Y', min: 0, max: 1, step: 0.01, default: 0.5 },
    radius: { type: 'number', label: 'Radius (animate it)', min: 0, max: 1.5, step: 0.01, default: 0.3 },
    thickness: { type: 'number', label: 'Thickness', min: 0.01, max: 0.5, step: 0.01, default: 0.08 },
    strength: { type: 'number', label: 'Strength', min: 0, max: 2, step: 0.01, default: 1 },
  } },
  particles: { label: 'Particles', params: {
    kind: { type: 'choice', label: 'Kind', options: ['confetti', 'snow', 'bubbles'], default: 'confetti' },
    count: { type: 'number', label: 'Count', min: 1, max: 600, step: 1, default: 150 },
    speed: { type: 'number', label: 'Speed', min: 0.1, max: 4, step: 0.05, default: 1 },
    size: { type: 'number', label: 'Size', min: 0.2, max: 4, step: 0.05, default: 1 },
    seed: { type: 'number', label: 'Seed', min: 0, max: 9999, step: 1, default: 1 },
  } },
  vignette: { label: 'Vignette', params: {
    amount: { type: 'number', label: 'Amount', min: 0, max: 1, step: 0.01, default: 0.5 },
    size: { type: 'number', label: 'Size', min: 0.1, max: 1, step: 0.01, default: 0.6 },
  } },
} as const satisfies Record<string, EffectInfo>;
export type EffectId = keyof typeof EFFECTS;
export const EFFECT_IDS = Object.keys(EFFECTS) as EffectId[];
export const MAX_CLIP_EFFECTS = 8;
export type EffectValues = Record<string, number | string | boolean>;

export const isEffect = (id: string): id is EffectId => Object.hasOwn(EFFECTS, id);
const COLOR = /^#[0-9a-f]{6}$/i;

/** Defaults merged with the given values; throws with a readable reason on an unknown key or a value out of range. */
export function effectParams(effect: string, values: EffectValues = {}): EffectValues {
  if (!isEffect(effect)) throw new Error(`Unknown effect ${effect}. Effects: ${EFFECT_IDS.join(', ')}.`);
  const specs = EFFECTS[effect].params as Record<string, EffectParam>, out: EffectValues = {};
  for (const key of Object.keys(values)) if (!specs[key]) throw new Error(`${EFFECTS[effect].label} has no setting "${key}".`);
  for (const [key, spec] of Object.entries(specs)) {
    const value = values[key] ?? spec.default;
    if (spec.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value) || value < spec.min || value > spec.max))
      throw new Error(`${spec.label} must be between ${spec.min} and ${spec.max}.`);
    if (spec.type === 'color' && (typeof value !== 'string' || !COLOR.test(value))) throw new Error(`${spec.label} must be a colour like #ff8800.`);
    if (spec.type === 'choice' && (typeof value !== 'string' || !spec.options.includes(value))) throw new Error(`${spec.label} must be one of ${spec.options.join(', ')}.`);
    out[key] = value;
  }
  return out;
}

// ---------- CPU references (linear 0..1 RGB; the GPU must match within 1/255) ----------

export type Rgb = [number, number, number];
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const hexToRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as Rgb;
export const luma = (c: Rgb) => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;

export function brightnessContrast(c: Rgb, brightness: number, contrast: number): Rgb {
  return c.map((v) => clamp01((v - 0.5) * contrast + 0.5 + brightness)) as Rgb;
}
export function tint(c: Rgb, color: string, amount: number): Rgb {
  const t = hexToRgb(color), l = luma(c);
  return c.map((v, i) => clamp01(v + (l * t[i]! - v) * amount)) as Rgb;
}
/** Darkens towards the corners; `uv` is 0..1 across the frame, `size` is where darkening starts. */
export function vignette(c: Rgb, uv: [number, number], amount: number, size: number): Rgb {
  const d = Math.hypot(uv[0] - 0.5, uv[1] - 0.5) / Math.SQRT1_2;
  const edge = Math.min(1, Math.max(0, (d - size) / Math.max(1e-3, 1 - size)));
  const k = 1 - amount * edge * edge * (3 - 2 * edge);
  return c.map((v) => v * k) as Rgb;
}

export const BLEND_MODES = ['normal', 'add', 'multiply', 'screen'] as const;
export type BlendMode = (typeof BLEND_MODES)[number];
/** A layer colour `src` with coverage `alpha` over `dst`. */
export function blend(mode: BlendMode, dst: Rgb, src: Rgb, alpha: number): Rgb {
  const mixed = src.map((s, i) => {
    const d = dst[i]!;
    return mode === 'add' ? Math.min(1, d + s) : mode === 'multiply' ? d * s : mode === 'screen' ? 1 - (1 - d) * (1 - s) : s;
  });
  return dst.map((d, i) => d + (mixed[i]! - d) * alpha) as Rgb;
}

// ---------- colour grade (FILM-07) ----------

/**
 * The Colour effect: exposure in stops, white balance (temperature warm/cool like `final-math.ts`
 * warmth, tint green/magenta), highlights and shadows by brightness, saturation around luminance,
 * contrast around middle grey, then a soft vignette. Linear 0..1 RGB in and out.
 */
export function grade(c: Rgb, uv: [number, number], p: Record<string, number>): Rgb {
  let v = c.map((x) => x * 2 ** (p.exposure ?? 0)) as Rgb;
  const warm = (p.temperature ?? 0) * 0.15, green = (p.tint ?? 0) * 0.15;
  v = [v[0] * (1 + warm) * (1 + green * 0.5), v[1] * (1 - green), v[2] * (1 - warm) * (1 + green * 0.5)];
  const l0 = luma(v);
  const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const lift = 1 + (p.highlights ?? 0) * 0.5 * smooth(0.5, 1, l0) + (p.shadows ?? 0) * 0.5 * (1 - smooth(0, 0.5, l0));
  v = v.map((x) => x * lift) as Rgb;
  const l = luma(v), sat = p.saturation ?? 1;
  v = v.map((x) => l + (x - l) * sat) as Rgb;
  v = v.map((x) => (x - 0.5) * (p.contrast ?? 1) + 0.5) as Rgb;
  const amount = p.vignette ?? 0;
  if (amount > 0) v = vignette(v.map((x) => Math.min(1, Math.max(0, x))) as Rgb, uv, amount, 0.5);
  return v.map((x) => Math.min(1, Math.max(0, x))) as Rgb;
}

/** Starting points for the Colour effect; applying one sets its settings and stays editable. */
export const LOOKS: Record<string, { label: string; params: Record<string, number> }> = {
  warm_afternoon: { label: 'Warm afternoon', params: { temperature: 0.5, saturation: 1.1, contrast: 1.05, highlights: -0.1 } },
  cool_night: { label: 'Cool night', params: { temperature: -0.6, exposure: -0.4, saturation: 0.85, tint: 0.1, vignette: 0.4 } },
  faded: { label: 'Faded', params: { contrast: 0.8, saturation: 0.7, shadows: 0.3, exposure: 0.1 } },
  punchy: { label: 'Punchy', params: { contrast: 1.3, saturation: 1.25, vignette: 0.25 } },
  black_white: { label: 'Black and white', params: { saturation: 0, contrast: 1.15 } },
};
