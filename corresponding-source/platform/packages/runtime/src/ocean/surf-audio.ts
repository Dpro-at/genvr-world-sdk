/*
 * Plays the surf (Tidewater sea, plan task 6). Genvr's own code around the ported scheduler in ./surf-sound.ts
 * (Tidewater, MIT, see ./LICENSE-tidewater.md). Sounds: Tidewater's CC0 recordings in the web app's
 * /audio/sea/ (sources in platform/apps/web/public/audio/sea/CREDITS.md).
 *
 * About 30 times a second the scheduler is asked what is due within its 0.2 s look-ahead on the shore clock (room
 * time, so every device hears the same wave the sea draws); each event plays as a positional one-shot at
 * `audio clock + delay`. A quiet distant-surf bed carries the sound further inland. Every quality level and every
 * device plays it (sound is cheap); phones and WebGL2 use a shore field solved for the sound alone (water-view.ts).
 *
 * A short log of what was scheduled and whether it played (`log`) is kept for checks: automated browser runs are
 * muted, so the sound is verified by its timing, not by listening.
 */
import type { WorldAudio } from '../audio.js';
import { SHORE_DEFAULTS } from './shore-waves.js';
import { shoreClock } from './sea-clock.js';
import {
  SURF_BANK,
  SURF_LIMITS,
  surfAirLowpass,
  surfFarGain,
  surfFormat,
  SurfScheduler,
  type SurfEvent,
  type SurfGround,
  type SurfShore,
} from './surf-sound.js';

/** Where the sea sounds are served (the web app's public folder). */
export const SEA_AUDIO_BASE = '/audio/sea/';

export interface SurfLogEntry {
  kind: SurfEvent['kind'];
  wave: number;
  /** shore-clock time the event belongs to, and the audio-clock time it was started for */
  time: number;
  audioAt: number | null;
  distance: number;
  gain: number;
  played: boolean;
  /** true for the fake surf (no shore field yet) */
  fake: boolean;
}

const LOG_SIZE = 200;
type Point = { x: number; y: number; z: number };

export class SurfAudio {
  readonly scheduler: SurfScheduler;
  readonly log: SurfLogEntry[] = [];
  #acc = 0;
  #loading = false;
  readonly #ext: 'ogg' | 'm4a';

  constructor(
    private readonly audio: WorldAudio,
    private readonly base = SEA_AUDIO_BASE,
    rng: () => number = Math.random,
  ) {
    this.scheduler = new SurfScheduler(rng);
    const probe = typeof document !== 'undefined' ? document.createElement('audio') : null;
    this.#ext = surfFormat((type) => probe?.canPlayType(type) ?? 'maybe');
  }

  /** The file for a bank, in the format this browser plays. */
  url(bank: keyof typeof SURF_BANK): string {
    return `${this.base}${bank}.${this.#ext}`;
  }

  /** Every frame: the listener (the camera), the room time (ms) and the shore to listen to (null: none yet). */
  update(dt: number, listener: Point, roomMs: number, shore: SurfShore | null, ground: SurfGround | null): void {
    this.#acc += Math.min(Math.max(dt, 0), 0.25);
    if (this.#acc < 1 / 30) return;
    this.#acc = 0;
    this.scheduler.setShore(shore, ground);
    if (!ground) {
      this.audio.setLoop(this.url('surf_far'), 0, listener);
      return;
    }
    const audioNow = this.audio.audioTime;
    if (audioNow !== null && !this.#loading) {
      this.#loading = true;
      for (const bank of Object.keys(SURF_BANK) as Array<keyof typeof SURF_BANK>) void this.audio.loadSample(this.url(bank));
    }
    const now = shoreClock(roomMs, shore?.period ?? SHORE_DEFAULTS.period);
    for (const e of this.scheduler.tick(now, listener)) {
      const [offset, duration] = SURF_BANK[e.bank].slices[e.slice]!;
      const played =
        audioNow !== null &&
        e.gain > 1e-4 &&
        this.audio.playSample(this.url(e.bank), {
          offset,
          duration,
          delay: e.delay,
          position: { x: e.x, y: e.y, z: e.z },
          gain: e.gain,
          rate: e.rate,
          lowpass: surfAirLowpass(e.distance),
          group: `surf:${e.kind}`,
          limit: SURF_LIMITS[e.kind],
        });
      this.log.push({
        kind: e.kind,
        wave: e.wave,
        time: e.time,
        audioAt: audioNow === null ? null : audioNow + e.delay,
        distance: e.distance,
        gain: e.gain,
        played,
        fake: !shore,
      });
      if (this.log.length > LOG_SIZE) this.log.shift();
    }
    // the distant roar: from the waterline's side, quieter further from it
    const p = this.scheduler.shorePoint;
    if (p) {
      const dx = p.x - listener.x;
      const dz = p.z - listener.z;
      const d = Math.hypot(dx, dz) || 1;
      this.audio.setLoop(this.url('surf_far'), surfFarGain(this.scheduler.shoreDistance), {
        x: listener.x + (dx / d) * 40,
        y: listener.y - 1.5,
        z: listener.z + (dz / d) * 40,
      });
    } else this.audio.setLoop(this.url('surf_far'), 0, listener);
  }
}
