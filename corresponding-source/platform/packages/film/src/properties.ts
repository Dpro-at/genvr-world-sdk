/**
 * Which clip values can change over time (FILM-06), their ranges, and how a clip looks at a moment.
 * Key times use the clip's own clock: media time for recordings (so trims keep keys on their picture
 * and moving a clip moves its animation) and time since the start for adjustment layers.
 */
import { evaluate, type Key, type KeyValue } from './animate.js';
import { EFFECTS, isEffect, type EffectParam } from './effects.js';
import { IDENTITY_TRANSFORM, type CaptionClip, type EffectClip, type MediaClip } from './model.js';
import type { Tick } from './time.js';

export interface PropertyInfo { path: string; label: string; kind: 'number' | 'point'; min: number; max: number; step: number }
type Animated = MediaClip | EffectClip | CaptionClip;

/** Every value of this clip that can be animated, with its range. */
export function properties(clip: Animated): PropertyInfo[] {
  const effectProps = (prefix: string, effect: string, labelPrefix = '') => isEffect(effect)
    ? Object.entries(EFFECTS[effect].params as Record<string, EffectParam>).flatMap(([key, spec]) => spec.type === 'number'
      ? [{ path: `${prefix}${key}`, label: `${labelPrefix}${spec.label}`, kind: 'number' as const, min: spec.min, max: spec.max, step: spec.step }] : [])
    : [];
  if (clip.type === 'effect') return effectProps('params.', clip.effect);
  const place: PropertyInfo[] = [
    { path: 'position', label: 'Position', kind: 'point', min: -4, max: 4, step: 0.01 },
    { path: 'scale', label: 'Scale', kind: 'number', min: 0.01, max: 10, step: 0.01 },
    { path: 'rotation', label: 'Rotation', kind: 'number', min: -3600, max: 3600, step: 1 },
    { path: 'opacity', label: 'Opacity', kind: 'number', min: 0, max: 1, step: 0.01 },
  ];
  if (clip.type === 'caption') return clip.title ? [...place, ...(clip.animators ?? []).flatMap((a, n) => (['start', 'end', 'offset'] as const).map((key) => ({
    path: `animators.${a.id}.${key}`, label: `Animator ${n + 1}: ${key}`, kind: 'number' as const, min: key === 'offset' ? -300 : -200, max: 300, step: 1 })))] : [];
  return [
    { path: 'position', label: 'Position', kind: 'point', min: -4, max: 4, step: 0.01 },
    { path: 'scale', label: 'Scale', kind: 'number', min: 0.01, max: 10, step: 0.01 },
    { path: 'rotation', label: 'Rotation', kind: 'number', min: -3600, max: 3600, step: 1 },
    { path: 'opacity', label: 'Opacity', kind: 'number', min: 0, max: 1, step: 0.01 },
    { path: 'volume', label: 'Volume', kind: 'number', min: 0, max: 2, step: 0.01 },
    ...(clip.effects ?? []).flatMap((e) => effectProps(`effects.${e.id}.`, e.effect, `${isEffect(e.effect) ? EFFECTS[e.effect].label : e.effect}: `)),
  ];
}
export const property = (clip: Animated, path: string) => properties(clip).find((p) => p.path === path);

/** The value a property has when it is not animated. */
export function staticValue(clip: Animated, path: string): KeyValue | undefined {
  if (clip.type === 'effect') { const v = clip.params[path.slice('params.'.length)]; return typeof v === 'number' ? v : undefined; }
  if (clip.type === 'caption' && path.startsWith('animators.')) {
    const [, id, key] = path.split('.');
    const a = clip.animators?.find((x) => x.id === id);
    return a && (key === 'start' || key === 'end' || key === 'offset') ? a.selector[key] : undefined;
  }
  const t = clip.transform ?? IDENTITY_TRANSFORM;
  if (path === 'position') return [t.x, t.y];
  if (path === 'scale' || path === 'rotation' || path === 'opacity') return t[path];
  if (path === 'volume') return clip.type === 'media' ? clip.volume : undefined;
  if (clip.type !== 'media') return undefined;
  const [, id, key] = path.split('.');
  const v = clip.effects?.find((e) => e.id === id)?.params[key ?? ''];
  return typeof v === 'number' ? v : undefined;
}
export function setStaticValue(clip: Animated, path: string, value: KeyValue) {
  if (clip.type === 'effect') { clip.params = { ...clip.params, [path.slice('params.'.length)]: value as number }; return; }
  if (clip.type === 'caption' && path.startsWith('animators.')) {
    const [, id, key] = path.split('.');
    const a = clip.animators?.find((x) => x.id === id);
    if (a && (key === 'start' || key === 'end' || key === 'offset')) a.selector = { ...a.selector, [key]: value as number };
    return;
  }
  const t = { ...(clip.transform ?? IDENTITY_TRANSFORM) };
  if (path === 'position') { [t.x, t.y] = value as [number, number]; clip.transform = t; }
  else if (path === 'scale' || path === 'rotation' || path === 'opacity') { t[path] = value as number; clip.transform = t; }
  else if (path === 'volume') { if (clip.type === 'media') clip.volume = value as number; }
  else if (clip.type === 'media') {
    const [, id, key] = path.split('.');
    const effect = clip.effects?.find((e) => e.id === id);
    if (effect && key) effect.params = { ...effect.params, [key]: value as number };
  }
}

/** Film time -> the clip's key clock, and back. */
export const keyTime = (clip: Animated, film: Tick): Tick => clip.type === 'media' ? clip.in + film - clip.start : film - clip.start;
// Captions and adjustment layers count from their own start.
export const filmTime = (clip: Animated, key: Tick): Tick => clip.type === 'media' ? clip.start + key - clip.in : clip.start + key;

export function valueAt(clip: Animated, path: string, film: Tick): KeyValue | undefined {
  const keys: Key[] | undefined = clip.keys?.[path];
  return keys?.length ? evaluate(keys, keyTime(clip, film)) : staticValue(clip, path);
}

/** The clip as it looks at a film moment: every animated value replaced by its value then (for drawing and sound). */
export function resolveAt<C extends Animated>(clip: C, film: Tick): C {
  if (!clip.keys || !Object.values(clip.keys).some((k) => k.length)) return clip;
  const copy = structuredClone(clip);
  for (const [path, keys] of Object.entries(clip.keys)) if (keys.length) setStaticValue(copy, path, evaluate(keys, keyTime(clip, film)));
  return copy;
}
