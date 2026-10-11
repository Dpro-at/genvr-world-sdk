import { describe, expect, it } from 'vitest';
import { SEA_CLOCK_WRAP, seaClock, shoreClock, SHORE_CLOCK_WAVES } from '../src/ocean/sea-clock.js';
import { cpuShore, SHORE_DEFAULTS, shorePhase, shoreWobble } from '../src/ocean/shore-waves.js';
import { swellFromSetting } from '../src/ocean/sea-clock.js';

// The room clock drives the sea (Tidewater sea, plan task 3): every device shows the same wave at the same moment.
describe('sea clock', () => {
  it('two clients at the same server time get the same sea time and the same shore phase', () => {
    const server = Date.UTC(2026, 9, 3, 21, 14, 7, 250);
    // client A's own clock is right, client B's is 7.3 s fast; each knows its offset from the room's 'time'
    const localA = server;
    const offsetA = server - localA;
    const localB = server + 7300;
    const offsetB = server - localB;
    expect(seaClock(localA + offsetA)).toBe(seaClock(localB + offsetB));
    const period = 9;
    const tA = shoreClock(localA + offsetA, period);
    const tB = shoreClock(localB + offsetB, period);
    expect(tA).toBe(tB);
    // the same point of the shore field (arrival time T, along-shore position) gives the same phase
    for (const [T, along] of [
      [2048.5, 0],
      [2010.25, 133.7],
      [2101, -420],
    ] as const) {
      expect(shorePhase(cpuShore, cpuShore.c(tA), cpuShore.c(T), cpuShore.c(along), cpuShore.c(period)).v).toBe(
        shorePhase(cpuShore, cpuShore.c(tB), cpuShore.c(T), cpuShore.c(along), cpuShore.c(period)).v,
      );
    }
  });

  it('a client without the room offset (offset 0) sees a different sea: the offset matters', () => {
    const server = Date.UTC(2026, 9, 3, 21, 14, 7, 250);
    expect(seaClock(server + 7300)).not.toBe(seaClock(server));
  });

  it('wraps once an hour for the FFT (float32 keeps 0.25 ms steps) and on a whole wave for the shore', () => {
    expect(SEA_CLOCK_WRAP).toBe(3600);
    const t = seaClock(Date.UTC(2026, 0, 1, 5, 0, 12, 500));
    expect(t).toBeCloseTo(12.5, 9);
    expect(seaClock(Date.UTC(2026, 0, 1, 5, 59, 59, 999))).toBeLessThan(3600);
    // the shore clock wraps after a whole number of waves, so the phase u = s - round(s) never jumps
    for (const period of [6, 9, 11.3, 14]) {
      const wrap = period * SHORE_CLOCK_WAVES;
      const before = shoreClock(wrap * 1000 * 37 - 1, period);
      const after = shoreClock(wrap * 1000 * 37 + 1, period);
      const u = (time: number) => {
        const s = (time - 2000) / period;
        return s - Math.round(s);
      };
      // 2 ms apart: the phase moves by 2 ms / period, not by a jump
      expect(Math.abs(u(after) - u(before))).toBeLessThan(0.002 / period + 1e-9);
    }
  });

  it('the wobble bends crests along the shore by a few hundredths of a period (ShoreWaves.js L296-300)', () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let a = -2000; a <= 2000; a += 0.5) {
      const w = shoreWobble(cpuShore, cpuShore.c(a)).v;
      lo = Math.min(lo, w);
      hi = Math.max(hi, w);
    }
    expect(lo).toBeGreaterThan(-0.15);
    expect(hi).toBeLessThan(0.19);
    expect(hi - lo).toBeGreaterThan(0.2);
  });
});

describe('sea swell setting', () => {
  it('absent parts keep Tidewater: 9 s, 0.34 m, automatic direction', () => {
    expect(SHORE_DEFAULTS.period).toBe(9);
    expect(SHORE_DEFAULTS.amplitude).toBe(0.34);
    expect(swellFromSetting(undefined)).toEqual({ period: 9, amplitude: 0.34, direction: null });
    expect(swellFromSetting({ period: 12 })).toEqual({ period: 12, amplitude: 0.34, direction: null });
  });

  it('direction is where the waves come from, clockwise from north (-z): they travel the other way', () => {
    const fromNorth = swellFromSetting({ direction: 0 }).direction!;
    expect(fromNorth[0]).toBeCloseTo(0, 9);
    expect(fromNorth[1]).toBeCloseTo(1, 9); // travelling south (+z)
    const fromEast = swellFromSetting({ direction: 90 }).direction!;
    expect(fromEast[0]).toBeCloseTo(-1, 9); // travelling west (-x)
    expect(fromEast[1]).toBeCloseTo(0, 9);
    expect(swellFromSetting({ height: 0.8 }).amplitude).toBe(0.8);
  });
});
