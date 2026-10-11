/*
 * Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC,
 * MIT (see ./LICENSE-tidewater.md). Source: src/audio/SoundScape.js (MIX L54-57, LIMITS L117, stations L122,
 * _field L733-752, _buildStations L778-850, _surf L852-927, _fakeSurf L929-948, _shot / _shotAt levels and air
 * L631-700, the surf_far bed L1046-1048) and src/audio/soundBank.js (the surf slices).
 *
 * The surf, wave by wave, as a pure scheduler: a row of stations on the waterline near the listener, each with a
 * transect out to sea, knows from the shore field and the shore clock when each wave breaks (a crash at its break
 * point), when its bore reaches the sand (the wash running up) and when the swash turns (the backwash draining
 * down). `tick(now, listener)` returns the events due within the look-ahead; `surf-audio.ts` plays them. The same
 * room time gives the same waves on every device, and the same waves the sea draws (tidewater-sea.ts).
 *
 * Where we differ: the wave heights and the wobble are the shared CPU mirror in shore-waves.ts (the formulas the
 * shader runs, not SoundScape's older copy); the along-shore position is on the swell's normal like our shader;
 * the break point uses `shoreBreakParams`' db; the station row starts at the nearest waterline (round an island the
 * line along the swell can cross the whole island from its lee side) and lee stations are kept, quiet by their
 * exposure, instead of dropped below 0.03; the rng is injected (tests); a station rebuilt near an old one keeps
 * what that one already played (no double crash when the listener walks); the shore clock wraps (sea-clock.ts) and
 * the scheduler starts over when it does; the distance fall-off is computed here (panners only pan) so it is
 * tested; the fake surf finds the nearest water from the ground itself (we have no fixed bay direction).
 */
import type { ShoreField } from './shore-field.js';
import { cpuShore as M, cpuShoreParams, type ShoreParams, shoreBreakParams, shoreWaveAmp, shoreWobble, SWASH_UP } from './shore-waves.js';

/** Stations and timing (SoundScape.js L122, L873-925). */
export const SURF = {
  stations: 9,
  /** m between stations */
  gap: 11,
  /** m of transect out to sea per station */
  transect: 110,
  /** the stations are rebuilt when the listener moved this far (m) */
  rebuild: 12,
  /** events are scheduled this far ahead (s) */
  lookAhead: 0.2,
  /** stations further than this from the listener are silent (m) */
  hearing: 160,
  crashHearing: 150,
  washHearing: 70,
  backHearing: 60,
  /** waves smaller than this (offshore amplitude, m) do not crash audibly */
  minCrash: 0.06,
} as const;

/** Target loudness (LUFS, momentary) in the reference situation (SoundScape.js MIX L54-57). */
export const SURF_MIX = {
  /** a wave breaking 10 m away (average wave; +-6 dB with its height) */
  crash: -15,
  /** the bore running up the sand, 5 m away */
  wash: -20,
  /** the swash draining back down, 5 m away */
  backwash: -23,
  /** distant roar at 50 m from the shore */
  surfFar: -31,
} as const;

/** Simultaneous voices per kind; the oldest fades out beyond (SoundScape.js LIMITS). */
export const SURF_LIMITS = { crash: 7, wash: 5, backwash: 5 } as const;

/** The surf sprites: slices [start s, duration s] and each slice's loudness (soundBank.js). */
export const SURF_BANK = {
  surf_crash: {
    slices: [[0.08, 3.254], [3.414, 2.504], [5.998, 2.554], [8.632, 1.304], [10.016, 2.804], [12.9, 2.204], [15.184, 2.7493]],
    lufs: [-13, -13.4, -14.1, -17, -13, -14, -12.7],
  },
  surf_wash: {
    slices: [[0.08, 1.404], [1.564, 2.054], [3.698, 1.504], [5.282, 1.354], [6.716, 1.904], [8.7, 1.154]],
    lufs: [-12.4, -11.3, -16.5, -13.7, -14.5, -22.3],
  },
  surf_backwash: {
    slices: [[0.08, 1.804], [1.964, 1.904], [3.948, 3.804], [7.832, 2.254], [10.166, 2.394], [12.64, 2.404]],
    lufs: [-13.1, -17.7, -22.1, -16.6, -14.4, -15.9],
  },
  surf_far: { loop: true, lufs: -23 },
} as const satisfies Record<string, { slices: ReadonlyArray<readonly [number, number]>; lufs: readonly number[] } | { loop: true; lufs: number }>;

export type SurfKind = 'crash' | 'wash' | 'backwash';
export type SurfBank = 'surf_crash' | 'surf_wash' | 'surf_backwash';
const BANK_OF: Record<SurfKind, SurfBank> = { crash: 'surf_crash', wash: 'surf_wash', backwash: 'surf_backwash' };

/** Distance model per kind: full level within `ref`, then inverse with `rolloff` (SoundScape.js _shotAt calls). */
const FALLOFF: Record<SurfKind, { ref: number; rolloff: number }> = {
  crash: { ref: 10, rolloff: 0.65 },
  wash: { ref: 5, rolloff: 0.8 },
  backwash: { ref: 5, rolloff: 0.8 },
};

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const dB = (d: number) => Math.pow(10, d / 20);
/** The files are mono: one channel on both ears is +3 dB against its measured loudness. */
const MONO = dB(-3);

/** Gain of a surf sound at `distance` m (Web Audio's inverse model); 0 beyond hearing. */
export function surfDistanceGain(distance: number, kind: SurfKind): number {
  if (distance > SURF.hearing) return 0;
  const { ref, rolloff } = FALLOFF[kind];
  return ref / (ref + rolloff * (Math.max(distance, ref) - ref));
}

/** Linear gain of a slice played at a target loudness, times the distance gain. */
export function surfEventGain(targetLufs: number, bank: SurfBank, slice: number, distanceGain: number): number {
  const lufs = SURF_BANK[bank].lufs[slice] ?? -15;
  return dB(clamp(targetLufs - lufs, -80, 24)) * MONO * distanceGain;
}

/** Air takes the highs away with distance: the low-pass on each event (Hz). */
export function surfAirLowpass(distance: number): number {
  return clamp(18000 / (1 + distance / 45), 1500, 18000);
}

/** The distant-surf bed's gain at `distance` m from the waterline (the waves themselves are events). */
export function surfFarGain(distance: number): number {
  const level = 0.6 + 0.7 * 0.5; // SoundScape's surf intensity at its default 0.5
  return (dB(SURF_MIX.surfFar - SURF_BANK.surf_far.lufs) * 1.25 * level * MONO) / (1 + Math.max(0, distance) / 200);
}

/** Ogg Opus where the browser can play it, AAC (m4a) elsewhere (older Safari). */
export function surfFormat(canPlay: (type: string) => string): 'ogg' | 'm4a' {
  return canPlay('audio/ogg; codecs=opus') ? 'ogg' : 'm4a';
}

/** What the surf sound needs to know about the shore. */
export interface SurfShore {
  field: ShoreField;
  heightAt: (x: number, z: number) => number;
  level: number;
  /** Unit xz direction the swell travels in (the shader's along-shore axis is its normal). */
  swellDir: [number, number];
  period: number;
  /** Offshore amplitude (m). */
  amplitude: number;
}

/** The ground alone (no field yet): enough for the fake surf. */
export interface SurfGround {
  heightAt: (x: number, z: number) => number;
  level: number;
}

/** Along-shore position as the shader has it: on the swell's normal. */
export function surfAlong(x: number, z: number, swellDir: readonly [number, number]): number {
  return -x * swellDir[1] + z * swellDir[0];
}

/** The shore field at (x, z): T, dir x exposure, Ts; bilinear between cell centres like `shoreFieldSample`. */
export function fieldAt(field: ShoreField, x: number, z: number, out: number[]): number[] {
  const { res, data, origin, size } = field;
  const fx = clamp(((x - origin) / size) * res - 0.5, 0, res - 1.001);
  const fz = clamp(((z - origin) / size) * res - 0.5, 0, res - 1.001);
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const tx = fx - i;
  const tz = fz - j;
  const k = (j * res + i) * 4;
  const kr = k + res * 4;
  for (let c = 0; c < 4; c += 1) {
    const a = data[k + c]!;
    const b = data[k + 4 + c]!;
    const cc = data[kr + c]!;
    const d = data[kr + 4 + c]!;
    out[c] = (a * (1 - tx) + b * tx) * (1 - tz) + (cc * (1 - tx) + d * tx) * tz;
  }
  return out;
}

export interface SurfStation {
  x: number;
  z: number;
  /** local wave direction (unit, landward) */
  dx: number;
  dz: number;
  /** arrival time at the shoreline */
  Ts: number;
  exposure: number;
  /** per metre out to sea: depth, arrival time, along-shore position */
  depth: Float32Array;
  T: Float32Array;
  along: Float32Array;
  last: Record<SurfKind, number>;
  /** events before this shore time are not this station's (it was just built) */
  since: number;
}

/** A row of stations along the waterline near the listener, each with its transect out to sea. */
export function buildSurfStations(shore: SurfShore, lx: number, lz: number): SurfStation[] {
  const { field, swellDir } = shore;
  const f = [0, 0, 0, 0];
  const h = (x: number, z: number) => shore.heightAt(x, z) - shore.level;
  fieldAt(field, lx, lz, f);
  let ex = Math.hypot(f[1]!, f[2]!);
  const dx = ex > 1e-3 ? f[1]! / ex : swellDir[0];
  const dz = ex > 1e-3 ? f[2]! / ex : swellDir[1];
  // The nearest waterline (Genvr: round an island the swell line through the listener can cross the whole island
  // from the lee side), the row along it; else Tidewater's: the waterline on the line through the listener
  // (seaward from land, landward from the water), the row across the swell.
  let w0: { x: number; z: number } | null = null;
  let tx = -dz;
  let tz = dx;
  const near = nearestWaterline(shore, lx, lz);
  if (near) {
    w0 = { x: near.x, z: near.z };
    tx = -near.sz;
    tz = near.sx;
  } else {
    const h0 = h(lx, lz);
    const sgn = h0 > 0 ? -1 : 1;
    for (let r = 1; r < 400; r += 1.5) {
      const x = lx + dx * sgn * r;
      const z = lz + dz * sgn * r;
      if (h(x, z) > 0 !== h0 > 0) {
        w0 = { x, z };
        break;
      }
    }
  }
  const out: SurfStation[] = [];
  if (!w0) return out;
  for (let k = 0; k < SURF.stations; k += 1) {
    const o = (k - (SURF.stations - 1) / 2) * SURF.gap;
    let x = w0.x + tx * o;
    let z = w0.z + tz * o;
    // snap to the waterline along the local wave direction
    fieldAt(field, x, z, f);
    ex = Math.hypot(f[1]!, f[2]!);
    // (Tidewater skips exposure < 0.03; our lee sides keep their faint surf: the level follows the exposure)
    if (ex < 1e-3) continue;
    const ldx = f[1]! / ex;
    const ldz = f[2]! / ex;
    const s0 = h(x, z) > 0 ? -1 : 1;
    let ok = false;
    for (let r = 0; r < 60; r += 0.5) {
      const xx = x + ldx * s0 * r;
      const zz = z + ldz * s0 * r;
      if (h(xx, zz) > 0 !== s0 < 0) {
        x = xx;
        z = zz;
        ok = true;
        break;
      }
    }
    if (!ok) continue;
    fieldAt(field, x, z, f);
    const n = SURF.transect;
    const st: SurfStation = {
      x,
      z,
      dx: ldx,
      dz: ldz,
      Ts: f[3]!,
      exposure: clamp(ex * 1.4, 0, 1),
      depth: new Float32Array(n),
      T: new Float32Array(n),
      along: new Float32Array(n),
      last: { crash: -Infinity, wash: -Infinity, backwash: -Infinity },
      since: -Infinity,
    };
    for (let r = 0; r < n; r += 1) {
      const xx = x - ldx * r;
      const zz = z - ldz * r;
      st.depth[r] = -h(xx, zz);
      st.T[r] = fieldAt(field, xx, zz, f)[0]!;
      st.along[r] = surfAlong(xx, zz, swellDir);
    }
    if (st.T[0]! < 1e4 && st.Ts < 1e4) out.push(st);
  }
  return out;
}

/** One sound to play. Times are on the shore clock; `delay` is from the `now` of the tick (>= 0). */
export interface SurfEvent {
  kind: SurfKind;
  /** the wave's index m (-1 for the fake surf) */
  wave: number;
  time: number;
  delay: number;
  x: number;
  y: number;
  z: number;
  /** the wave's travel direction there (landward unit xz) */
  dx: number;
  dz: number;
  station: number;
  stationX: number;
  stationZ: number;
  /** the wave's offshore amplitude (m) */
  amplitude: number;
  /** target loudness at the reference distance (LUFS) */
  loudness: number;
  rate: number;
  bank: SurfBank;
  slice: number;
  /** from the listener (m) and the gain for it (distance and level together) */
  distance: number;
  gain: number;
}

type Listener = { x: number; y: number; z: number };

/** The wave-by-wave surf scheduler (SoundScape.js _surf; _fakeSurf until the shore field is there). */
export class SurfScheduler {
  #shore: SurfShore | null = null;
  #ground: SurfGround | null = null;
  #params: ShoreParams = cpuShoreParams();
  #stations: SurfStation[] = [];
  #builtAt = { x: Infinity, z: Infinity };
  #lastNow: number | null = null;
  readonly #lastSlice: Partial<Record<SurfBank, number>> = {};
  #fakeT = 3;
  #fakeShore: { x: number; z: number; sx: number; sz: number; d: number } | null = null;
  #fakeAt = { x: Infinity, z: Infinity };

  constructor(private readonly rng: () => number = Math.random) {}

  /** The shore field to listen to (null: none yet), and the ground for the fake surf meanwhile (null: no sea). */
  setShore(shore: SurfShore | null, ground: SurfGround | null = shore): void {
    if (shore !== this.#shore) {
      this.#shore = shore;
      this.#stations = [];
      this.#builtAt = { x: Infinity, z: Infinity };
      if (shore) this.#params = cpuShoreParams({ period: shore.period, amplitude: shore.amplitude });
    }
    if (ground !== this.#ground) {
      this.#ground = ground;
      this.#fakeAt = { x: Infinity, z: Infinity };
    }
  }

  get stations(): readonly SurfStation[] {
    return this.#stations;
  }

  /** Distance (m, xz) from the last listener to the nearest waterline point known, Infinity when none. */
  shoreDistance = Infinity;
  /** The nearest waterline point known (for the far bed), or null. */
  shorePoint: { x: number; z: number } | null = null;

  /** The events due between `now` and `now + lookAhead` (shore clock, s) for a listener at `at`. */
  tick(now: number, at: Listener): SurfEvent[] {
    const last = this.#lastNow;
    this.#lastNow = now;
    const dt = last === null ? 0 : clamp(now - last, 0, 0.25);
    const shore = this.#shore;
    if (!shore) return this.#fake(dt, at);
    // the shore clock wrapped (sea-clock.ts): the wave numbers start over
    if (last !== null && now < last - 1)
      for (const st of this.#stations) {
        st.last = { crash: -Infinity, wash: -Infinity, backwash: -Infinity };
        st.since = now;
      }
    if (Math.hypot(at.x - this.#builtAt.x, at.z - this.#builtAt.z) > SURF.rebuild) this.#rebuild(shore, at, now);
    this.#nearest(at);
    const P = Math.max(1, shore.period);
    const A0 = Math.max(0.05, shore.amplitude);
    const out: SurfEvent[] = [];
    const end = now + SURF.lookAhead;
    for (const [index, st] of this.#stations.entries()) {
      const d = Math.hypot(st.x - at.x, st.z - at.z);
      if (d > SURF.hearing) continue;
      const alongS = st.along[0]!;
      const wob = shoreWobble(M, M.c(alongS)).v;
      const mw = Math.floor((now - st.Ts) / P + wob);
      const from = Math.max(now - 0.1, st.since);
      for (let m = mw; m <= mw + 2; m += 1) {
        const A: number = shoreWaveAmp(M, M.c(m), M.c(alongS), this.#params).v;
        const rel = A / A0;
        const lvl = 16 * Math.log10(clamp(rel * st.exposure, 0.05, 3));
        // breaking: the crest reaches the depth where this wave plunges (H = gamma d, the lip lands ~8% in)
        const db = shoreBreakParams(M, M.c(A), M.c(5), this.#params).db.v * 0.92;
        let rb = 0;
        while (rb < SURF.transect - 1 && st.depth[rb]! < db) rb += 1;
        const tc = st.T[rb]! + (m - shoreWobble(M, M.c(st.along[rb]!)).v) * P;
        if (m > st.last.crash && tc >= from && tc < end) {
          st.last.crash = m;
          const x = st.x - st.dx * rb;
          const z = st.z - st.dz * rb;
          if (Math.hypot(x - at.x, z - at.z) < SURF.crashHearing && A > SURF.minCrash) {
            const rate = clamp(1.06 - 0.25 * rel, 0.82, 1.08) * (0.96 + this.rng() * 0.08);
            out.push(this.#event('crash', m, tc, now, x, shore.level + 0.4, z, st, index, A, SURF_MIX.crash + lvl + (this.rng() - 0.5) * 3, rate, at));
          }
        }
        // the bore reaches the sand and runs up; then the swash turns and drains back
        const tw = st.Ts + (m - wob) * P;
        const tb = tw + SWASH_UP * P;
        if (m > st.last.wash && tw >= from && tw < end) {
          st.last.wash = m;
          if (d < SURF.washHearing)
            out.push(
              this.#event('wash', m, tw, now, st.x - st.dx, shore.level + 0.1, st.z - st.dz, st, index, A, SURF_MIX.wash + lvl + (this.rng() - 0.5) * 3, 0.95 + this.rng() * 0.1, at),
            );
        }
        if (m > st.last.backwash && tb >= from && tb < end) {
          st.last.backwash = m;
          if (d < SURF.backHearing)
            out.push(
              this.#event('backwash', m, tb, now, st.x - st.dx * 2, shore.level, st.z - st.dz * 2, st, index, A, SURF_MIX.backwash + lvl + (this.rng() - 0.5) * 3, 0.95 + this.rng() * 0.1, at),
            );
        }
      }
    }
    return out;
  }

  #rebuild(shore: SurfShore, at: Listener, now: number): void {
    const old = this.#stations;
    const next = buildSurfStations(shore, at.x, at.z);
    // a new station on (nearly) the spot of an old one keeps what that one already played; the others only take
    // waves after the look-ahead the old ones may already have scheduled
    for (const st of next) {
      let best: SurfStation | null = null;
      let bestD = SURF.gap / 2;
      for (const o of old) {
        const dd = Math.hypot(o.x - st.x, o.z - st.z);
        if (dd < bestD) {
          bestD = dd;
          best = o;
        }
      }
      if (best) {
        st.last = { ...best.last };
        st.since = best.since;
      } else st.since = old.length > 0 ? now + SURF.lookAhead : -Infinity;
    }
    this.#stations = next;
    this.#builtAt = { x: at.x, z: at.z };
  }

  #nearest(at: Listener): void {
    let best = Infinity;
    let point: { x: number; z: number } | null = null;
    for (const st of this.#stations) {
      const d = Math.hypot(st.x - at.x, st.z - at.z);
      if (d < best) {
        best = d;
        point = { x: st.x, z: st.z };
      }
    }
    this.shoreDistance = best;
    this.shorePoint = point;
  }

  #pick(bank: SurfBank): number {
    const n = SURF_BANK[bank].slices.length;
    let i = Math.floor(this.rng() * n) % n;
    if (n > 1 && i === this.#lastSlice[bank]) i = (i + 1 + Math.floor(this.rng() * (n - 1))) % n;
    this.#lastSlice[bank] = i;
    return i;
  }

  #event(
    kind: SurfKind,
    wave: number,
    time: number,
    now: number,
    x: number,
    y: number,
    z: number,
    st: { x: number; z: number; dx: number; dz: number },
    station: number,
    amplitude: number,
    loudness: number,
    rate: number,
    at: Listener,
  ): SurfEvent {
    const bank = BANK_OF[kind];
    const slice = this.#pick(bank);
    const distance = Math.hypot(x - at.x, y - at.y, z - at.z);
    return {
      kind,
      wave,
      time,
      delay: Math.max(0, time - now),
      x,
      y,
      z,
      dx: st.dx,
      dz: st.dz,
      station,
      stationX: st.x,
      stationZ: st.z,
      amplitude,
      loudness,
      rate,
      bank,
      slice,
      distance,
      gain: surfEventGain(loudness, bank, slice, surfDistanceGain(distance, kind)),
    };
  }

  /** Without the shore field: waves on a ~9 s cycle at the nearest water (SoundScape.js _fakeSurf). */
  #fake(dt: number, at: Listener): SurfEvent[] {
    const ground = this.#ground;
    if (!ground) {
      this.shoreDistance = Infinity;
      this.shorePoint = null;
      return [];
    }
    if (Math.hypot(at.x - this.#fakeAt.x, at.z - this.#fakeAt.z) > SURF.rebuild) {
      this.#fakeAt = { x: at.x, z: at.z };
      this.#fakeShore = nearestWaterline(ground, at.x, at.z);
    }
    const s = this.#fakeShore;
    this.shoreDistance = s ? s.d : Infinity;
    this.shorePoint = s ? { x: s.x, z: s.z } : null;
    if (!s) return [];
    this.#fakeT -= dt;
    if (this.#fakeT > 0) return [];
    this.#fakeT = 2.5 + this.rng() * 4;
    const side = (this.rng() - 0.5) * 60;
    // (sx, sz) points out to sea; the shore runs across it
    const px = s.x - s.sz * side;
    const pz = s.z + s.sx * side;
    const now = this.#lastNow ?? 0;
    const st = { x: px, z: pz, dx: -s.sx, dz: -s.sz };
    const out: SurfEvent[] = [];
    const ev = (kind: SurfKind, delay: number, x: number, y: number, z: number, loudness: number, rate: number) => {
      const e = this.#event(kind, -1, now + delay, now, x, y, z, st, -1, 0, loudness, rate, at);
      out.push(e);
    };
    ev('crash', 0, px + s.sx * 12, ground.level + 0.4, pz + s.sz * 12, SURF_MIX.crash + (this.rng() - 0.5) * 6, 0.92 + this.rng() * 0.12);
    if (Math.max(6, s.d) < SURF.washHearing) {
      ev('wash', 3.5, px, ground.level + 0.1, pz, SURF_MIX.wash + (this.rng() - 0.5) * 4, 1);
      ev('backwash', 7, px, ground.level, pz, SURF_MIX.backwash + (this.rng() - 0.5) * 4, 1);
    }
    return out;
  }
}

/**
 * The nearest waterline within 150 m (16 directions, 2 m steps): its point, the unit direction out to sea there,
 * and the distance. Null when there is no water (or no land) in reach.
 */
export function nearestWaterline(
  ground: SurfGround,
  x: number,
  z: number,
): { x: number; z: number; sx: number; sz: number; d: number } | null {
  const h = (px: number, pz: number) => ground.heightAt(px, pz) - ground.level;
  const wet0 = h(x, z) < 0;
  let best: { x: number; z: number; sx: number; sz: number; d: number } | null = null;
  for (let k = 0; k < 16; k += 1) {
    const a = (k / 16) * Math.PI * 2;
    const ux = Math.cos(a);
    const uz = Math.sin(a);
    for (let r = 2; r <= 150 && (!best || r < best.d); r += 2) {
      const px = x + ux * r;
      const pz = z + uz * r;
      if (h(px, pz) < 0 !== wet0) {
        // out to sea = down the slope there (the ray's own direction is only one of 16)
        const gx = h(px + 2, pz) - h(px - 2, pz);
        const gz = h(px, pz + 2) - h(px, pz - 2);
        const g = Math.hypot(gx, gz);
        const sx = g > 1e-6 ? -gx / g : wet0 ? -ux : ux;
        const sz = g > 1e-6 ? -gz / g : wet0 ? -uz : uz;
        best = { x: px, z: pz, sx, sz, d: r };
        break;
      }
    }
  }
  return best;
}
