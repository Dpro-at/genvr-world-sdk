/**
 * Scene effects for films (FILM-03a): seeded, so every playback and export is identical. Shake is a
 * trauma-style offset of the picture; particles (confetti, snow, bubbles) are computed from seed and
 * time only; light burst and shockwave are screen-space effects drawn on the GPU (references here).
 */

const hash = (a: number, b: number) => {
  let x = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

/**
 * Camera shake at `t` seconds: offset in frame fractions and turn in degrees. Three sine layers per axis
 * with seeded phases and frequencies around `frequency`, scaled by amount squared (trauma model).
 */
export function shakeOffset(seed: number, t: number, amount: number, frequency: number): { x: number; y: number; rotation: number } {
  const trauma = Math.max(0, Math.min(1, amount)) ** 2;
  const axis = (k: number) => {
    let v = 0;
    for (let i = 0; i < 3; i++) {
      const f = frequency * (0.7 + hash(seed, k * 10 + i) * 0.9) * (i + 1), p = hash(seed + 7, k * 10 + i) * Math.PI * 2;
      v += Math.sin(t * f * Math.PI * 2 + p) / (i + 1);
    }
    return v / 1.833; // sum of 1, 1/2, 1/3
  };
  return { x: axis(1) * 0.04 * trauma, y: axis(2) * 0.04 * trauma, rotation: axis(3) * 3 * trauma };
}

export type ParticleKind = 'confetti' | 'snow' | 'bubbles';
export interface Particle { x: number; y: number; size: number; rotation: number; color: string; alpha: number }
const CONFETTI = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];

/** Every particle at `t` seconds, in frame fractions (0..1, y down); depends only on seed, kind, count, speed, size and t. */
export function particlesAt(kind: ParticleKind, seed: number, count: number, t: number, speed = 1, size = 1): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const r = (k: number) => hash(seed * 131 + i, k);
    const life = kind === 'confetti' ? 3 : kind === 'snow' ? 8 : 5;
    const age = (t * speed + r(1) * life) % life, f = age / life;
    if (kind === 'confetti') {
      // Thrown up from the bottom, falling back with drift and spin.
      const vx = (r(2) - 0.5) * 0.5, vy = -(0.9 + r(3) * 0.6), g = 1.2;
      const x = 0.5 + (r(4) - 0.5) * 0.6 + vx * age, y = 1.05 + vy * age + 0.5 * g * age * age;
      out.push({ x, y, size: (0.008 + r(5) * 0.01) * size, rotation: age * (r(6) * 720 - 360), color: CONFETTI[Math.floor(r(7) * CONFETTI.length)]!, alpha: 1 - Math.max(0, f - 0.8) * 5 });
    } else if (kind === 'snow') {
      const x = (r(2) + Math.sin(age * (0.5 + r(3)) + r(4) * 6) * 0.03) % 1;
      out.push({ x, y: -0.05 + f * 1.1, size: (0.003 + r(5) * 0.006) * size, rotation: 0, color: '#ffffff', alpha: 0.9 });
    } else {
      const x = r(2) + Math.sin(age * 2 + r(3) * 6) * 0.02;
      out.push({ x, y: 1.05 - f * 1.15, size: (0.008 + r(5) * 0.02) * size, rotation: 0, color: '#bfe9ff', alpha: 0.6 * (1 - Math.max(0, f - 0.85) * 6) });
    }
  }
  return out.filter((p) => p.alpha > 0);
}

/** Light burst reference: brightness added at uv for a burst centred at (cx, cy). */
export function burstGlow(uv: [number, number], cx: number, cy: number, strength: number, decay: number): number {
  const d = Math.hypot(uv[0] - cx, uv[1] - cy);
  return strength * Math.exp(-d * (2 + decay * 10));
}

/** Shockwave reference: how far (frame fraction) a pixel at uv is pushed outward by a ring of `radius`. */
export function shockPush(uv: [number, number], cx: number, cy: number, radius: number, thickness: number, strength: number): number {
  const d = Math.hypot(uv[0] - cx, uv[1] - cy), x = (d - radius) / Math.max(1e-4, thickness);
  return Math.abs(x) >= 1 ? 0 : strength * (1 - x * x) * Math.sign(x || 1) * 0.05;
}

/** Scene-effect cue actions (FILM-03b): put on a cue of the "scene" actor while filming. */
export const SCENE_FX_ACTIONS = [
  { id: 'fx_shake', label: 'Camera shake' }, { id: 'fx_confetti', label: 'Confetti' }, { id: 'fx_snow', label: 'Snow' },
  { id: 'fx_bubbles', label: 'Bubbles' }, { id: 'fx_burst', label: 'Light burst' }, { id: 'fx_shockwave', label: 'Shockwave' },
] as const;
export const SCENE_ACTOR = 'scene';

/**
 * Timeline steps that add the effects of a take's scene cues as adjustment layers at the cue times
 * (`clipStart` seconds on the film, cue times in seconds of the take). Shake is filmed live by the
 * camera, so it adds nothing here. Overlapping effects land on separate effect tracks.
 */
export function sceneFxSteps(cues: { actor: string; action: string; start: number; end: number }[], clipStart: number, seed = 1): { id: string; args: Record<string, unknown> }[] {
  const steps: { id: string; args: Record<string, unknown> }[] = [];
  for (const c of cues) {
    if (c.actor !== SCENE_ACTOR || c.action === 'fx_shake' || c.action === 'none') continue;
    const start = clipStart + c.start, duration = Math.max(0.1, c.end - c.start);
    if (c.action === 'fx_confetti' || c.action === 'fx_snow' || c.action === 'fx_bubbles')
      steps.push({ id: 'adjustment.add', args: { effect: 'particles', start, duration, params: { kind: c.action.slice(3), seed } } });
    else if (c.action === 'fx_burst') steps.push({ id: 'adjustment.add', args: { effect: 'light_burst', start, duration, params: { strength: 0.9 } } });
    else if (c.action === 'fx_shockwave') steps.push({ id: 'adjustment.add', args: { effect: 'shockwave', start, duration } });
  }
  return steps;
}
