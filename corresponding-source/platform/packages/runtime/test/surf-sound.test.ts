import { describe, expect, it } from 'vitest';
import { computeShoreField } from '../src/ocean/shore-field.js';
import { shoreDepthGrid } from '../src/ocean/shore-field-worker.js';
import { cpuShore as M, cpuShoreParams, shoreBreakParams, shorePhase, shoreWaveAmp, shoreWobble, SWASH_UP } from '../src/ocean/shore-waves.js';
import {
  buildSurfStations,
  fieldAt,
  SURF,
  SURF_BANK,
  surfAirLowpass,
  surfAlong,
  surfDistanceGain,
  surfEventGain,
  surfFarGain,
  surfFormat,
  SurfScheduler,
  type SurfEvent,
  type SurfShore,
} from '../src/ocean/surf-sound.js';

// Tidewater sea, plan task 6: the surf sound's timing is a pure function of the room clock and the shore field.
// A straight beach: sea level 0, the ground rises towards -z with Tidewater's slope; the swell travels -z.
const SLOPE = 0.066;
const EXTENT = 300;
const RES = 256;
const heightAt = (_x: number, z: number) => Math.max(-30, -z * SLOPE);
const swellDir: [number, number] = [0, -1];
const field = computeShoreField({
  depth: shoreDepthGrid(heightAt, 0, EXTENT, RES),
  res: RES,
  origin: -EXTENT,
  size: EXTENT * 2,
  swellDir,
});
const shore: SurfShore = { field, heightAt, level: 0, swellDir, period: 9, amplitude: 0.34 };
const P = cpuShoreParams({ period: 9, amplitude: 0.34 });
const c = M.c;
const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};
/** A scheduler listening to the test beach. */
const withShore = (rng: () => number) => {
  const s = new SurfScheduler(rng);
  s.setShore(shore);
  return s;
};

/** Runs the scheduler at 30 Hz from t0 for `seconds`, the listener at `at` (or moving along `path`). */
function run(
  scheduler: SurfScheduler,
  t0: number,
  seconds: number,
  at: (t: number) => { x: number; y: number; z: number },
): SurfEvent[] {
  const out: SurfEvent[] = [];
  for (let t = t0; t < t0 + seconds; t += 1 / 30) out.push(...scheduler.tick(t, at(t)));
  return out;
}

describe('surf sound: stations on the waterline (SoundScape.js _buildStations)', () => {
  it('puts 9 stations 11 m apart on the waterline nearest the listener, each with a transect out to sea', () => {
    const stations = buildSurfStations(shore, 0, -6);
    expect(stations.length).toBe(SURF.stations);
    for (const st of stations) {
      expect(Math.abs(st.z)).toBeLessThan(1);
      expect(st.dx).toBeCloseTo(0, 2);
      expect(st.dz).toBeCloseTo(-1, 2);
      // the transect runs seaward: deeper and earlier the further out
      expect(st.depth[50]!).toBeGreaterThan(st.depth[5]!);
      expect(st.T[50]!).toBeLessThan(st.T[5]!);
    }
    const xs = stations.map((s) => s.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i += 1) expect(xs[i]! - xs[i - 1]!).toBeCloseTo(SURF.gap, 0);
  });

  it('on a round island finds the nearest beach, also on the lee side (not across the island)', () => {
    const isle = (x: number, z: number) => Math.max(-30, (150 - Math.hypot(x, z)) * SLOPE);
    const f = computeShoreField({ depth: shoreDepthGrid(isle, 0, EXTENT, RES), res: RES, origin: -EXTENT, size: EXTENT * 2, swellDir });
    const island: SurfShore = { ...shore, field: f, heightAt: isle };
    // the swell travels -z: z = -140 is the lee side
    for (const [x, z] of [[0, -140], [0, 140], [140, 0]] as const) {
      const stations = buildSurfStations(island, x, z);
      expect(stations.length).toBeGreaterThan(4);
      for (const st of stations) expect(Math.hypot(st.x - x, st.z - z)).toBeLessThan(60);
    }
  });

  it('works from the water side too', () => {
    expect(buildSurfStations(shore, 0, 20).length).toBe(SURF.stations);
  });

  it('reads the field like the shader (bilinear at cell centres)', () => {
    const o = [0, 0, 0, 0];
    fieldAt(field, 0, 50, o);
    // straight fronts: arrival time grows towards the beach, the direction is the swell's
    const o2 = [0, 0, 0, 0];
    fieldAt(field, 0, 20, o2);
    expect(o2[0]!).toBeGreaterThan(o[0]!);
    expect(o[2]! / Math.hypot(o[1]!, o[2]!)).toBeCloseTo(-1, 3);
  });
});

describe('surf sound: wave by wave (SoundScape.js _surf)', () => {
  const listener = { x: 0, y: 1.7, z: -6 };
  const events = run(withShore(seeded(7)), 1000, 60, () => listener);
  const crashes = events.filter((e) => e.kind === 'crash');
  const washes = events.filter((e) => e.kind === 'wash');
  const backs = events.filter((e) => e.kind === 'backwash');

  it('has crashes, washes and backwashes, about one of each per wave per near station', () => {
    expect(crashes.length).toBeGreaterThan(20);
    expect(washes.length).toBeGreaterThan(20);
    expect(backs.length).toBeGreaterThan(20);
  });

  it('schedules a crash when the crest reaches the break depth (within 0.1 s)', () => {
    for (const e of crashes) {
      // at the crash point the CPU shore phase says the crest (s = m) is here at the event time
      const f = [0, 0, 0, 0];
      fieldAt(field, e.x, e.z, f);
      const s = shorePhase(M, c(e.time), c(f[0]!), c(surfAlong(e.x, e.z, swellDir)), c(9)).v;
      expect(Math.abs(s - e.wave) * 9).toBeLessThan(0.1);
      // and the water there is (just) deep enough for this wave to plunge: depth >= db x 0.92, one metre less is not
      const A = e.amplitude;
      expect(A).toBeCloseTo(shoreWaveAmp(M, c(e.wave), c(surfAlong(e.x, e.z, swellDir)), P).v, 6);
      const db = shoreBreakParams(M, c(A), c(5), P).db.v * 0.92;
      expect(-heightAt(e.x, e.z)).toBeGreaterThanOrEqual(db - 1e-6);
      expect(-heightAt(e.x + e.dx, e.z + e.dz)).toBeLessThan(db);
    }
  });

  it('schedules the wash at Ts + (m - wobble) P and the backwash 0.4 P later', () => {
    for (const e of washes) {
      const f = [0, 0, 0, 0];
      fieldAt(field, e.stationX, e.stationZ, f);
      const wob = shoreWobble(M, c(surfAlong(e.stationX, e.stationZ, swellDir))).v;
      expect(Math.abs(e.time - (f[3]! + (e.wave - wob) * 9))).toBeLessThan(0.1);
    }
    for (const b of backs) {
      const w = washes.find((e) => e.wave === b.wave && e.station === b.station);
      if (w) expect(b.time - w.time).toBeCloseTo(SWASH_UP * 9, 6);
    }
  });

  it('plays each wave once only, also when the stations are rebuilt as the listener walks', () => {
    const walk = run(withShore(seeded(3)), 2000, 90, (t) => ({ x: (t - 2000) * 1.4, y: 1.7, z: -6 }));
    expect(walk.filter((e) => e.kind === 'crash').length).toBeGreaterThan(40);
    // the same wave is never scheduled twice at (nearly) the same place, even right after a rebuild
    for (const a of walk)
      for (const b of walk)
        if (a !== b && a.kind === b.kind && a.wave === b.wave) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(3);
  });

  it('schedules ahead by at most the look-ahead, never in the past', () => {
    for (const e of events) {
      expect(e.delay).toBeGreaterThanOrEqual(0);
      expect(e.delay).toBeLessThanOrEqual(SURF.lookAhead + 1e-9);
    }
  });

  it('is the same on two devices at the same room time (the slice and pitch aside)', () => {
    const a = run(withShore(seeded(1)), 1000, 30, () => listener).map((e) => [e.kind, e.wave, e.time.toFixed(4)].join());
    const b = run(withShore(seeded(99)), 1000, 30, () => listener).map((e) => [e.kind, e.wave, e.time.toFixed(4)].join());
    expect(a).toEqual(b);
  });

  it('bigger waves are louder (16 log10 of the height)', () => {
    const big = crashes.reduce((m, e) => (e.amplitude > m.amplitude ? e : m));
    const small = crashes.reduce((m, e) => (e.amplitude < m.amplitude ? e : m));
    expect(big.loudness - small.loudness).toBeGreaterThan(16 * Math.log10(big.amplitude / small.amplitude) - 3.1);
  });

  it('hears nothing beyond 160 m from the waterline', () => {
    const far = run(withShore(seeded(5)), 1000, 40, () => ({ x: 0, y: 30, z: -180 }));
    expect(far.length).toBe(0);
  });

  it('keeps going when the shore clock wraps', () => {
    const wrap = 9 * 400;
    const s = withShore(seeded(2));
    run(s, wrap - 20, 20, () => listener);
    const after = run(s, 0, 30, () => listener);
    expect(after.filter((e) => e.kind === 'crash').length).toBeGreaterThan(5);
  });
});

describe('surf sound: levels and distance', () => {
  it('a crash is at full level within 10 m and falls off as a line source beyond', () => {
    expect(surfDistanceGain(4, 'crash')).toBe(1);
    expect(surfDistanceGain(10, 'crash')).toBe(1);
    expect(surfDistanceGain(20, 'crash')).toBeCloseTo(10 / (10 + 0.65 * 10), 9);
    let last = 1;
    for (let d = 12; d < 160; d += 7) {
      const g = surfDistanceGain(d, 'crash');
      expect(g).toBeLessThan(last);
      last = g;
    }
    expect(surfDistanceGain(161, 'crash')).toBe(0);
    // wash and backwash are close sounds (5 m reference, steeper fall)
    expect(surfDistanceGain(20, 'wash')).toBeCloseTo(5 / (5 + 0.8 * 15), 9);
  });

  it('turns a target loudness into a gain with the slice measurement (mono trim -3 dB)', () => {
    const lufs = SURF_BANK.surf_crash.lufs[0]!;
    expect(surfEventGain(lufs, 'surf_crash', 0, 1)).toBeCloseTo(Math.pow(10, -3 / 20), 9);
    expect(surfEventGain(lufs - 20, 'surf_crash', 0, 0.5)).toBeCloseTo(0.1 * 0.5 * Math.pow(10, -3 / 20), 9);
  });

  it('distant air takes the highs away; the far bed falls as 1 / (1 + d / 200)', () => {
    expect(surfAirLowpass(0)).toBe(18000);
    expect(surfAirLowpass(45)).toBe(9000);
    expect(surfAirLowpass(5000)).toBe(1500);
    expect(surfFarGain(200) / surfFarGain(0)).toBeCloseTo(0.5, 9);
  });

  it('plays Ogg Opus where the browser can, AAC elsewhere (older Safari)', () => {
    expect(surfFormat(() => 'probably')).toBe('ogg');
    expect(surfFormat(() => 'maybe')).toBe('ogg');
    expect(surfFormat(() => '')).toBe('m4a');
  });
});

describe('surf sound before the shore field (SoundScape.js _fakeSurf)', () => {
  it('without a field but with the ground, waves still come every 2.5-6.5 s from the nearest water', () => {
    const s = new SurfScheduler(seeded(11));
    s.setShore(null, { heightAt, level: 0 });
    const ev = run(s, 0, 40, () => ({ x: 0, y: 1.7, z: -6 }));
    const crashes = ev.filter((e) => e.kind === 'crash');
    expect(crashes.length).toBeGreaterThanOrEqual(6);
    expect(crashes.length).toBeLessThanOrEqual(17);
    for (const e of crashes) expect(e.z).toBeGreaterThan(0);
    const w = ev.find((e) => e.kind === 'wash')!;
    expect(w.delay).toBeCloseTo(3.5, 6);
    expect(ev.find((e) => e.kind === 'backwash')!.delay).toBeCloseTo(7, 6);
  });

  it('is silent with no sea at all, or far inland', () => {
    const s = new SurfScheduler(seeded(11));
    expect(run(s, 0, 20, () => ({ x: 0, y: 1.7, z: -6 })).length).toBe(0);
    s.setShore(null, { heightAt: () => 5, level: 0 });
    expect(run(s, 0, 20, () => ({ x: 0, y: 1.7, z: -6 })).length).toBe(0);
  });
});

describe('the scheduler as wired', () => {
  it('uses the given shore once set', () => {
    const s = new SurfScheduler(seeded(4));
    s.setShore(shore);
    expect(run(s, 1000, 20, () => ({ x: 0, y: 1.7, z: -6 })).some((e) => e.kind === 'crash')).toBe(true);
    expect(s.stations.length).toBe(SURF.stations);
    expect(s.shoreDistance).toBeLessThan(8);
  });
});
