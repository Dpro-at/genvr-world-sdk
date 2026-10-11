import { Ride, RIDE_PRESETS, RideModel, type Ride as RideType } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import {
  MOVE_CHECK,
  rideMoveAllowed,
  stepRide,
  walkMoveAllowed,
  type MoveBudget,
  type MoveSample,
  type RideInput,
  type RideState,
  type RideSurface,
} from '../src/index.js';

const preset = (model: RideModel, extra: Partial<RideType> = {}): RideType =>
  Ride.parse({ model, ...RIDE_PRESETS[model], ...extra });

const state = (extra: Partial<RideState> = {}): RideState => ({
  x: 0, y: 0, z: 0, yaw: 0, speed: 0, side: 0, vy: 0, ...extra,
});

const input = (extra: Partial<RideInput> = {}): RideInput => ({ throttle: 0, steer: 0, up: false, down: false, ...extra });

const flat: RideSurface = { ground: 0, water: null };
const pool: RideSurface = { ground: -5, water: 0 };

/** Runs `steps` steps of `dt`, writing the displacement back as a caller with no walls would. */
function run(
  ride: RideType,
  s: RideState,
  i: RideInput,
  steps: number,
  dt = 0.05,
  surfaceAt: (x: number, z: number) => RideSurface = () => flat,
  factor = 1,
): RideState {
  for (let n = 0; n < steps; n += 1) {
    const d = stepRide(ride, s, i, surfaceAt(s.x, s.z), dt, factor);
    s.x += d.dx;
    s.y += d.dy;
    s.z += d.dz;
  }
  return s;
}

describe('stepRide: speed', () => {
  it('reaches the top speed in maxSpeed / accel seconds and never passes it', () => {
    const ride = preset('ground');
    const s = state();
    const seconds = ride.maxSpeed / ride.accel; // 2.5 s
    run(ride, s, input({ throttle: 1 }), Math.round(seconds / 0.05) - 1);
    expect(s.speed).toBeLessThan(ride.maxSpeed);
    run(ride, s, input({ throttle: 1 }), 1);
    expect(s.speed).toBeCloseTo(ride.maxSpeed, 6);
    run(ride, s, input({ throttle: 1 }), 100);
    expect(s.speed).toBeCloseTo(ride.maxSpeed, 6);
    expect(s.z).toBeGreaterThan(0);
  });

  it('backs up at most reverse times the top speed, and brakes twice as fast', () => {
    const ride = preset('ground');
    const s = run(ride, state(), input({ throttle: -1 }), 200);
    expect(s.speed).toBeCloseTo(-ride.reverse * ride.maxSpeed, 6);
    const moving = state({ speed: 10 });
    stepRide(ride, moving, input({ throttle: -1 }), flat, 0.1);
    expect(moving.speed).toBeCloseTo(10 - 2 * ride.accel * 0.1, 6);
    const air = run(preset('air'), state({ y: 10 }), input({ throttle: -1 }), 50);
    expect(air.speed).toBe(0);
  });

  it('raises the cap with a set_speed factor', () => {
    const ride = preset('ground');
    const s = run(ride, state(), input({ throttle: 1 }), 400, 0.05, () => flat, 1.5);
    expect(s.speed).toBeCloseTo(ride.maxSpeed * 1.5, 6);
  });

  it('does nothing in a step of no time', () => {
    const s = state({ speed: 5, yaw: 1 });
    const d = stepRide(preset('ground'), s, input({ throttle: 1, steer: 1 }), flat, 0);
    expect(d).toEqual({ dx: 0, dy: 0, dz: 0 });
    expect(s).toEqual(state({ speed: 5, yaw: 1 }));
  });
});

describe('stepRide: turning and grip', () => {
  const turnOnce = (model: RideModel, speed: number) => {
    const ride = preset(model);
    const s = state({ speed, y: model === 'air' ? 10 : model === 'water' ? -0.1 : 0 });
    stepRide(ride, s, input({ throttle: speed / ride.maxSpeed, steer: 1 }), model === 'water' ? pool : flat, 0.1);
    return -s.yaw; // steering right turns the yaw down
  };

  it('turns a ground item slowly at low speed and fully from 30 % of its top speed', () => {
    const ride = preset('ground');
    const full = ride.turn * (Math.PI / 180) * 0.1;
    expect(turnOnce('ground', 0)).toBeCloseTo(0, 9);
    expect(turnOnce('ground', 2)).toBeCloseTo(full * (2 / 6), 9);
    expect(turnOnce('ground', 6)).toBeCloseTo(full, 9);
    expect(turnOnce('ground', 20)).toBeCloseTo(full, 9);
  });

  it('turns water and air items at any speed, and the other way when going backward', () => {
    expect(turnOnce('water', 0)).toBeCloseTo(preset('water').turn * (Math.PI / 180) * 0.1, 9);
    expect(turnOnce('air', 0)).toBeCloseTo(preset('air').turn * (Math.PI / 180) * 0.1, 9);
    expect(turnOnce('ground', -6)).toBeLessThan(0);
  });

  it('keeps no sideways speed with grip 1 and keeps it with grip 0', () => {
    const tight = state({ speed: 20 });
    stepRide(preset('ground', { grip: 1 }), tight, input({ throttle: 1, steer: 1 }), flat, 0.1);
    expect(tight.side).toBe(0);
    const ice = state({ speed: 20 });
    stepRide(preset('ground', { grip: 0 }), ice, input({ throttle: 1, steer: 1 }), flat, 0.1);
    expect(Math.abs(ice.side)).toBeGreaterThan(0.1);
    const before = ice.side;
    stepRide(preset('ground', { grip: 0 }), ice, input({ throttle: 1 }), flat, 0.1);
    expect(ice.side).toBeCloseTo(before, 9);
  });
});

describe('stepRide: height by model', () => {
  it('drops a ground item onto a lower surface and keeps it there', () => {
    const s = run(preset('ground'), state({ y: 5 }), input({ throttle: 1 }), 60);
    expect(s.y).toBe(0);
    expect(s.vy).toBe(0);
  });

  it('keeps a water item in the band and stops it at a shore', () => {
    const ride = preset('water');
    const lake = (_x: number, z: number): RideSurface => (z < 20 ? pool : { ground: 0.5, water: null });
    const s = state({ y: -1 });
    for (let n = 0; n < 40; n += 1) run(ride, s, input({ throttle: 1 }), 1, 0.05, lake);
    expect(Math.abs(s.y - -0.1)).toBeLessThan(0.05);
    run(ride, s, input({ throttle: 1 }), 400, 0.05, lake);
    expect(s.speed).toBe(0);
    expect(s.z).toBeGreaterThan(20);
    expect(s.z).toBeLessThan(20 + ride.maxSpeed);
    const z = s.z;
    run(ride, s, input({ throttle: 1 }), 40, 0.05, lake);
    expect(s.z).toBe(z);
    expect(s.y).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  it('hovers an air item with no input, climbs at climb and never passes the ceiling', () => {
    const ride = preset('air', { ceiling: 20 });
    const hover = run(ride, state({ y: 10 }), input(), 40);
    expect(hover.y).toBe(10);
    const s = state({ y: 10 });
    stepRide(ride, s, input({ up: true }), flat, 0.1);
    expect(s.vy).toBe(ride.climb);
    run(ride, s, input({ up: true }), 400);
    expect(s.y).toBe(20);
    run(ride, s, input({ down: true }), 400);
    expect(s.y).toBe(0);
  });

  it('keeps a water item with no water under it where it is: no speed, no turning', () => {
    const ride = preset('water');
    const s = state({ y: 1, yaw: 0.5 });
    run(ride, s, input({ throttle: 1, steer: 1 }), 40, 0.05, () => ({ ground: 0.5, water: null }));
    expect(s.x).toBe(0);
    expect(s.z).toBe(0);
    expect(s.yaw).toBe(0.5);
    expect(s.y).toBe(0.5);
  });

  it('eases a flying item down to a lower height limit at airDrop, never snapping', () => {
    const ride = preset('air', { ceiling: 20 });
    // Over a cliff edge the ground fell from 50 m to 0: the limit is 20 m now, the item at 70 m.
    const s = state({ y: 70, speed: ride.maxSpeed });
    const d = stepRide(ride, s, input({ throttle: 1 }), flat, 0.05);
    expect(d.dy).toBeCloseTo(-MOVE_CHECK.airDrop * 0.05);
    run(ride, s, input({ throttle: 1 }), 100);
    expect(s.y).toBe(20);
    expect(MOVE_CHECK.airDrop).toBeLessThan(MOVE_CHECK.fallSpeed);
  });

  it('sinks a gliding air item when it is slow, and holds it up at speed', () => {
    const ride = preset('air', { glide: true });
    const slow = state({ y: 50 });
    stepRide(ride, slow, input(), flat, 0.1);
    expect(slow.vy).toBeLessThan(0);
    const fast = state({ y: 50, speed: ride.maxSpeed });
    const d = stepRide(ride, fast, input({ throttle: 1 }), flat, 0.1);
    expect(d.dy).toBe(0);
  });
});

/** A seeded jitter in [0, 1) so the run is the same every time. */
function jitter(seed: number): () => number {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

describe('rideMoveAllowed: a real run is accepted end to end', () => {
  const surfaces: Record<RideModel, (x: number, z: number) => RideSurface> = {
    ground: () => flat,
    water: () => pool,
    air: () => flat,
  };
  const starts: Record<RideModel, Partial<RideState>> = { ground: {}, water: { y: -0.1 }, air: { y: 10 } };

  for (const model of RideModel.options)
    it(`accepts a 20 Hz run at full throttle with 30 ms of jitter (${model})`, () => {
      const ride = preset(model);
      const s = state(starts[model]);
      const random = jitter(7);
      let last: MoveSample = { x: s.x, y: s.y, z: s.z, at: 0 };
      let refused = 0;
      // 60 frames per second on the client, a move sent every 3 frames, arriving 0..30 ms late.
      for (let frame = 1; frame <= 60 * 20; frame += 1) {
        const i = input({ throttle: 1, steer: frame % 400 < 200 ? 0.3 : -0.3, up: model === 'air' && frame < 300 });
        const d = stepRide(ride, s, i, surfaces[model](s.x, s.z), 1 / 60);
        s.x += d.dx;
        s.y += d.dy;
        s.z += d.dz;
        if (frame % 3 !== 0) continue;
        const now = (frame / 60) * 1000 + random() * 30;
        const to = { x: s.x, y: s.y, z: s.z };
        if (rideMoveAllowed(ride, last, to, now, surfaces[model], 1)) last = { ...to, at: now };
        else refused += 1;
      }
      expect(refused).toBe(0);
      expect(Math.hypot(s.x, s.z)).toBeGreaterThan(ride.maxSpeed * 5);
    });
});

describe('rideMoveAllowed: what is refused', () => {
  const from: MoveSample = { x: 0, y: 0, z: 0, at: 0 };

  it('refuses 1.3 times the top speed over a second', () => {
    for (const model of RideModel.options) {
      const ride = preset(model);
      const y = model === 'water' ? -0.1 : model === 'air' ? 10 : 0;
      const surfaceAt = model === 'water' ? () => pool : () => flat;
      const start = { ...from, y };
      expect(rideMoveAllowed(ride, start, { x: 0, y, z: ride.maxSpeed }, 1000, surfaceAt, 1), model).toBe(true);
      expect(rideMoveAllowed(ride, start, { x: 0, y, z: ride.maxSpeed * 1.3 }, 1000, surfaceAt, 1), model).toBe(false);
    }
  });

  it('gives at most one second of allowance after a long silence (walking and riding)', () => {
    const walkLimit = MOVE_CHECK.walkSpeed + MOVE_CHECK.slack;
    expect(walkMoveAllowed(from, { x: 0, y: 0, z: walkLimit - 0.1 }, 10_000, 1)).toBe(true);
    expect(walkMoveAllowed(from, { x: 0, y: 0, z: walkLimit + 0.1 }, 10_000, 1)).toBe(false);
    const ride = preset('ground');
    const rideLimit = ride.maxSpeed * MOVE_CHECK.rideTolerance + MOVE_CHECK.slack;
    expect(rideMoveAllowed(ride, from, { x: 0, y: 0, z: rideLimit - 0.1 }, 10_000, () => flat, 1)).toBe(true);
    expect(rideMoveAllowed(ride, from, { x: 0, y: 0, z: rideLimit + 0.1 }, 10_000, () => flat, 1)).toBe(false);
  });

  it('never counts time going backward', () => {
    expect(walkMoveAllowed({ ...from, at: 500 }, { x: 0, y: 0, z: 1.4 }, 0, 1)).toBe(true);
    expect(walkMoveAllowed({ ...from, at: 500 }, { x: 0, y: 0, z: 1.6 }, 0, 1)).toBe(false);
  });

  it('refuses a water move 3 m off the surface, and one with no water under it', () => {
    const ride = preset('water');
    const start = { ...from, y: -0.1 };
    expect(rideMoveAllowed(ride, start, { x: 0, y: -1.5, z: 1 }, 1000, () => pool, 1)).toBe(true);
    expect(rideMoveAllowed(ride, start, { x: 0, y: 3, z: 1 }, 1000, () => pool, 1)).toBe(false);
    expect(rideMoveAllowed(ride, start, { x: 0, y: -0.1, z: 1 }, 1000, () => flat, 1)).toBe(false);
  });

  it('refuses an air move over the ceiling and a climb faster than climb', () => {
    const ride = preset('air', { ceiling: 20 });
    const high = { ...from, y: 19 };
    expect(rideMoveAllowed(ride, high, { x: 0, y: 21.9, z: 1 }, 1000, () => flat, 1)).toBe(true);
    expect(rideMoveAllowed(ride, high, { x: 0, y: 22.5, z: 1 }, 1000, () => flat, 1)).toBe(false);
    const low = { ...from, y: 5 };
    expect(rideMoveAllowed(ride, low, { x: 0, y: 5 + ride.climb * 1.5 + 2, z: 0 }, 1000, () => flat, 1)).toBe(false);
    const open = preset('air');
    expect(rideMoveAllowed(open, { ...from, y: 50 }, { x: 0, y: 50 - 35, z: 0 }, 1000, () => flat, 1)).toBe(false);
    expect(rideMoveAllowed(open, { ...from, y: 50 }, { x: 0, y: 50 - 25, z: 0 }, 1000, () => flat, 1)).toBe(true);
  });

  it('lets a water item stranded on dry land stay where it is and settle, but not move', () => {
    const ride = preset('water');
    const land = (): RideSurface => ({ ground: 0.5, water: null });
    const stranded = { ...from, y: 1 };
    expect(rideMoveAllowed(ride, stranded, { x: 0, y: 1, z: 0 }, 50, land, 1)).toBe(true);
    expect(rideMoveAllowed(ride, stranded, { x: 0, y: 0.5, z: 0 }, 50, land, 1)).toBe(true);
    expect(rideMoveAllowed(ride, stranded, { x: 0, y: 1, z: 0.5 }, 50, land, 1)).toBe(false);
    expect(rideMoveAllowed(ride, stranded, { x: 0, y: 1.5, z: 0 }, 50, land, 1)).toBe(false);
    // Out of the water onto the shore is still refused.
    const shore = (_x: number, z: number): RideSurface => (z < 1 ? pool : land());
    expect(rideMoveAllowed(ride, { ...from, y: -0.1, z: 0.99 }, { x: 0, y: -0.1, z: 1.01 }, 50, shore, 1)).toBe(false);
    // A whole stranded run of the model is accepted: it never leaves its spot.
    const s = state({ y: 1 });
    let last: MoveSample = { x: 0, y: 1, z: 0, at: 0 };
    for (let frame = 1; frame <= 120; frame += 1) {
      const d = stepRide(ride, s, input({ throttle: 1, steer: 1 }), land(), 1 / 60);
      s.x += d.dx;
      s.y += d.dy;
      s.z += d.dz;
      if (frame % 3 !== 0) continue;
      const now = (frame / 60) * 1000;
      expect(rideMoveAllowed(ride, last, { x: s.x, y: s.y, z: s.z }, now, land, 1)).toBe(true);
      last = { x: s.x, y: s.y, z: s.z, at: now };
    }
  });

  it('accepts a flying item coming down after crossing a drop, and refuses one staying up there', () => {
    const ride = preset('air', { ceiling: 20 });
    // The ground under the item fell from 50 m to 0 (a cliff edge): the limit is 20 m now.
    const cliff = (_x: number, z: number): RideSurface => ({ ground: z < 1 ? 50 : 0, water: null });
    const top = { ...from, y: 70 };
    const step = ride.maxSpeed * 0.05;
    expect(rideMoveAllowed(ride, top, { x: 0, y: 70 - MOVE_CHECK.airDrop * 0.05, z: step }, 50, cliff, 1)).toBe(true);
    expect(rideMoveAllowed(ride, top, { x: 0, y: 70, z: step }, 50, cliff, 1)).toBe(false);
    // A whole run over the edge at 20 Hz with jitter, the height limit taken where the item goes.
    const s = state({ y: 70, speed: ride.maxSpeed });
    const random = jitter(3);
    let last: MoveSample = { x: 0, y: 70, z: 0, at: 0 };
    let refused = 0;
    for (let frame = 1; frame <= 60 * 5; frame += 1) {
      const d = stepRide(ride, s, input({ throttle: 1 }), cliff(s.x, s.z + s.speed / 60), 1 / 60);
      s.x += d.dx;
      s.y += d.dy;
      s.z += d.dz;
      if (frame % 3 !== 0) continue;
      const now = (frame / 60) * 1000 + random() * 30;
      const budget: MoveBudget = { slack: 0, rise: 0 };
      if (rideMoveAllowed(ride, last, { x: s.x, y: s.y, z: s.z }, now, cliff, 1, budget)) last = { x: s.x, y: s.y, z: s.z, at: now, ...budget };
      else refused += 1;
    }
    expect(refused).toBe(0);
    expect(s.y).toBe(20);
  });

  it('refuses a ground item jumping up faster than its limit', () => {
    const ride = preset('ground');
    expect(rideMoveAllowed(ride, from, { x: 0, y: 21, z: 0 }, 1000, () => flat, 1)).toBe(true);
    expect(rideMoveAllowed(ride, from, { x: 0, y: 22, z: 0 }, 1000, () => flat, 1)).toBe(false);
  });

  /**
   * A client sending one move every `intervalMs` for `seconds`, each move as far as the check lets
   * it (a binary search per move), carrying the budget the check hands back. Returns the distance
   * covered.
   */
  const greedy = (
    check: (from: MoveSample, to: { x: number; y: number; z: number }, now: number, budget: MoveBudget) => boolean,
    axis: 'z' | 'y',
    intervalMs: number,
    seconds: number,
    start: MoveSample = from,
  ): number => {
    let last: MoveSample = { ...start };
    for (let now = intervalMs; now <= seconds * 1000; now += intervalMs) {
      let low = 0;
      let high = 100;
      for (let n = 0; n < 40; n += 1) {
        const mid = (low + high) / 2;
        const to = { x: last.x, y: last.y, z: last.z, [axis]: last[axis] + mid };
        if (check(last, to, now, { slack: 0, rise: 0 })) low = mid;
        else high = mid;
      }
      const to = { x: last.x, y: last.y, z: last.z, [axis]: last[axis] + low };
      const budget: MoveBudget = { slack: 0, rise: 0 };
      expect(check(last, to, now, budget)).toBe(true);
      last = { ...to, at: now, ...budget };
    }
    return last[axis] - start[axis];
  };

  for (const hz of [25, 50])
    it(`bounds the distance of many small moves at ${hz} Hz near speed times time (walking)`, () => {
      for (const factor of [1, 0.3]) {
        const seconds = 2;
        const walked = greedy((f, to, now, b) => walkMoveAllowed(f, to, now, factor, b), 'z', 1000 / hz, seconds);
        expect(walked, `factor ${factor}`).toBeLessThanOrEqual(MOVE_CHECK.walkSpeed * factor * seconds + MOVE_CHECK.slack + 1e-6);
      }
    });

  for (const hz of [25, 50])
    it(`bounds the distance of many small moves at ${hz} Hz near speed times time (riding)`, () => {
      for (const factor of [1, 0.3]) {
        const ride = preset('ground');
        const seconds = 1.5;
        const rode = greedy((f, to, now, b) => rideMoveAllowed(ride, f, to, now, () => flat, factor, b), 'z', 1000 / hz, seconds);
        const top = ride.maxSpeed * MOVE_CHECK.rideTolerance * factor;
        expect(rode, `factor ${factor}`).toBeLessThanOrEqual(top * seconds + MOVE_CHECK.slack + 1e-6);
      }
    });

  it('bounds the climb of a flying item over many small moves', () => {
    const ride = preset('air', { ceiling: 300 });
    const start: MoveSample = { ...from, y: 10 };
    const seconds = 2;
    const climbed = greedy((f, to, now, b) => rideMoveAllowed(ride, f, to, now, () => flat, 1, b), 'y', 40, seconds, start);
    expect(climbed).toBeLessThanOrEqual(ride.climb * MOVE_CHECK.rideTolerance * seconds + MOVE_CHECK.slack + 1e-6);
  });

  it('lends the slack for a late move and takes it back on the next', () => {
    const ride = preset('ground');
    const step = ride.maxSpeed * 0.05;
    // A move arriving 30 ms early uses some slack; the next, on time again, still passes.
    const budget: MoveBudget = { slack: 0, rise: 0 };
    expect(rideMoveAllowed(ride, from, { x: 0, y: 0, z: step }, 20, () => flat, 1, budget)).toBe(true);
    expect(budget.slack).toBeLessThan(MOVE_CHECK.slack);
    const next = { x: 0, y: 0, z: step, at: 20, ...budget };
    expect(rideMoveAllowed(ride, next, { x: 0, y: 0, z: step * 2 }, 100, () => flat, 1, budget)).toBe(true);
    expect(budget.slack).toBeCloseTo(MOVE_CHECK.slack);
  });

  it('accepts double the speed under a set_speed factor of 2', () => {
    const ride = preset('ground');
    const double = { x: 0, y: 0, z: ride.maxSpeed * 2 };
    expect(rideMoveAllowed(ride, from, double, 1000, () => flat, 1)).toBe(false);
    expect(rideMoveAllowed(ride, from, double, 1000, () => flat, 2)).toBe(true);
    expect(walkMoveAllowed(from, { x: 0, y: 0, z: 24 }, 1000, 1)).toBe(false);
    expect(walkMoveAllowed(from, { x: 0, y: 0, z: 24 }, 1000, 2)).toBe(true);
  });
});
