'use client';

import { getSettings } from './settings';

/**
 * Short feedback sounds for building (task P3-05), made with the Web Audio API so they need no
 * files. The audio system with library sounds comes with P2-08; these are the UI blips.
 * As loud as the player's master and effects volume (settings, P3-21).
 */
export type Sound = 'place' | 'remove' | 'build' | 'tap' | 'magic' | 'error';

let context: AudioContext | null = null;
/** When each sound last played: a burst of edits (a whole real place, a pasted row) sounds once, not once per edit. */
const lastPlayed = new Map<Sound, number>();
const REPEAT_GAP_MS = 150;

/** Loudness of effect sounds from the player settings (master times effects, P3-21). */
function effectsVolume(): number {
  const { master, effects } = getSettings().audio;
  return (master / 100) * (effects / 100);
}

/** Tone: frequency glide from `from` to `to` Hz over `duration` seconds. */
function tone(
  audio: AudioContext,
  at: number,
  wave: OscillatorType,
  from: number,
  to: number,
  duration: number,
  volume: number,
) {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(from, at);
  oscillator.frequency.exponentialRampToValueAtTime(to, at + duration);
  gain.gain.setValueAtTime(Math.max(0.0001, volume * effectsVolume()), at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.02);
}

export function playSound(sound: Sound): void {
  if (typeof window === 'undefined' || effectsVolume() === 0) return;
  const now = performance.now();
  if (now - (lastPlayed.get(sound) ?? -Infinity) < REPEAT_GAP_MS) return;
  lastPlayed.set(sound, now);
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume();
    const t = context.currentTime;
    switch (sound) {
      case 'place':
        tone(context, t, 'sine', 520, 900, 0.09, 0.18);
        break;
      case 'remove':
        tone(context, t, 'triangle', 260, 110, 0.14, 0.2);
        break;
      case 'build':
        tone(context, t, 'square', 330, 330, 0.05, 0.05);
        tone(context, t + 0.06, 'square', 440, 440, 0.06, 0.05);
        break;
      case 'tap':
        tone(context, t, 'sine', 1200, 900, 0.03, 0.06);
        break;
      case 'magic':
        tone(context, t, 'sine', 660, 990, 0.12, 0.1);
        tone(context, t + 0.08, 'sine', 990, 1320, 0.16, 0.08);
        break;
      case 'error':
        tone(context, t, 'triangle', 200, 180, 0.09, 0.16);
        tone(context, t + 0.12, 'triangle', 160, 140, 0.12, 0.16);
        break;
    }
  } catch {
    // Audio is not available (blocked or unsupported): building works without sounds.
  }
}

/** The sound of a world command (terrain strokes stay silent: they repeat many times a second). */
export function commandSound(type: string): Sound | null {
  if (type === 'place_item' || type === 'add_water') return 'place';
  if (type.startsWith('remove_')) return 'remove';
  if (
    type === 'draw_road' ||
    type === 'draw_wall' ||
    type === 'add_wall_opening' ||
    type === 'transform_item'
  )
    return 'build';
  if (type === 'set_sky' || type === 'set_weather' || type === 'set_style') return 'magic';
  return null;
}
