import { RIDE_PRESETS, type Ride, type RideModel } from '@genvr/contracts';
import { MOVE_CHECK, rideMoveAllowed, type MoveBudget, type MoveSample, type RideSurface } from '@genvr/world';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CHASE_CAMERA, chaseCameraYaw } from '../src/camera.js';
import { initPhysics, PhysicsWorld } from '../src/physics.js';
import { RideController, rideInput, rideTilt, seatLayout } from '../src/ride.js';

const ride = (model: RideModel, extra: Partial<Ride> = {}): Ride => ({
  model,
  ...RIDE_PRESETS[model],
  ...extra,
});
const box = (w: number, h: number, l: number) => ({
  min: { x: -w / 2, y: 0, z: -l / 2 },
  max: { x: w / 2, y: h, z: l / 2 },
});

describe('seat layout', () => {
  it('puts one seat in the middle across, a quarter of the length back from the front', () => {
    const [seat, ...rest] = seatLayout(box(2, 1, 4), ride('ground'));
    expect(rest).toHaveLength(0);
    expect(seat!.x).toBeCloseTo(0);
    expect(seat!.z).toBeCloseTo(2 - 1);
    expect(seat!.y).toBeCloseTo(0.35);
  });

  it('lays out four seats in two rows of two, seat 1 front-left, rows 0.9 m apart', () => {
    const seats = seatLayout(box(2, 1, 4), ride('ground', { seats: 4 }));
    expect(seats).toHaveLength(4);
    // Left is +x in the item's own space (forward is +z, right is -x).
    expect(seats[0]!.x).toBeGreaterThan(0);
    expect(seats[1]!.x).toBeLessThan(0);
    expect(seats[0]!.z).toBeCloseTo(seats[1]!.z);
    expect(seats[0]!.z - seats[2]!.z).toBeCloseTo(0.9);
    expect(seats[2]!.x).toBeCloseTo(seats[0]!.x);
  });

  it('puts one seat per row on a narrow item', () => {
    const seats = seatLayout(box(1, 1, 4), ride('water', { seats: 3 }));
    expect(seats.map((seat) => seat.x)).toEqual([0, 0, 0]);
    expect(seats[0]!.z - seats[2]!.z).toBeCloseTo(1.8);
  });

  it('centres a last seat alone in its row, and takes the height from seatHeight', () => {
    const seats = seatLayout(box(2, 2, 4), ride('air', { seats: 3, seatHeight: 0.5 }));
    expect(seats[2]!.x).toBeCloseTo(0);
    for (const seat of seats) expect(seat.y).toBeCloseTo(1);
  });

  it('works from bounds that do not start at the origin', () => {
    const [seat] = seatLayout({ min: { x: 1, y: -1, z: 0 }, max: { x: 3, y: 1, z: 4 } }, ride('ground'));
    expect(seat!.x).toBeCloseTo(2);
    expect(seat!.y).toBeCloseTo(-1 + 0.35 * 2);
    expect(seat!.z).toBeCloseTo(3);
  });
});

describe('ride input', () => {
  it('maps the move intent to throttle, steer, up and down', () => {
    expect(rideInput({ direction: { x: 0.5, z: -1 }, speed: 1, jump: true, descend: true })).toEqual({
      throttle: -1,
      steer: 0.5,
      up: true,
      down: true,
    });
    expect(rideInput({ direction: { x: 0, z: 0 }, speed: 0, jump: false })).toEqual({
      throttle: 0,
      steer: 0,
      up: false,
      down: false,
    });
  });

  it('keeps full throttle while steering (a corner of the stick, or two keys)', () => {
    const diagonal = rideInput({ direction: { x: Math.SQRT1_2, z: Math.SQRT1_2 }, speed: 1, jump: false });
    expect(diagonal.throttle).toBeCloseTo(1);
    expect(diagonal.steer).toBeCloseTo(1);
    const half = rideInput({ direction: { x: 0, z: 0.5 }, speed: 0.5, jump: false });
    expect(half.throttle).toBeCloseTo(0.5);
  });

  it('writes into a reused object', () => {
    const out = { throttle: 0, steer: 0, up: false, down: false };
    expect(rideInput({ direction: { x: -1, z: 1 }, speed: 1, jump: false }, out)).toBe(out);
    expect(out.steer).toBe(-1);
  });
});

describe('chase camera', () => {
  it('eases behind the item the short way round', () => {
    let yaw = 0;
    for (let i = 0; i < 180; i += 1) yaw = chaseCameraYaw(yaw, Math.PI / 2, 1 / 60, 10);
    expect(yaw).toBeCloseTo(Math.PI / 2, 2);
    // From just below pi to just above -pi: a small turn, not a full one.
    const next = chaseCameraYaw(3.1, -3.1, 1 / 60, 10);
    expect(Math.abs(next - 3.1)).toBeLessThan(0.02);
    expect(next).toBeGreaterThan(3.1);
  });

  it('waits 1.5 s after a look input before easing back', () => {
    expect(CHASE_CAMERA.lookBack).toBe(1.5);
    expect(chaseCameraYaw(0, 1, 1 / 60, 1.4)).toBe(0);
    expect(chaseCameraYaw(0, 1, 1 / 60, 1.6)).toBeGreaterThan(0);
  });
});

describe('tilt', () => {
  const flat = (x: number, z: number, out: RideSurface) => {
    out.ground = 0;
    out.water = null;
    return out;
  };
  it('is level on flat ground and pitches the nose up a slope', () => {
    const out = { pitch: 0, roll: 0 };
    rideTilt(ride('ground'), { x: 0, y: 0, z: 0, yaw: 0 }, { width: 2, length: 4 }, flat, 0, 0, out);
    expect(out.pitch).toBeCloseTo(0);
    expect(out.roll).toBeCloseTo(0);
    // Ground rising toward +z (the front at yaw 0).
    const slope = (x: number, z: number, o: RideSurface) => {
      o.ground = z * 0.5;
      o.water = null;
      return o;
    };
    rideTilt(ride('ground'), { x: 0, y: 0, z: 0, yaw: 0 }, { width: 2, length: 4 }, slope, 0, 0, out);
    // Negative pitch about x lifts +z (three.js right-handed rotation).
    expect(out.pitch).toBeLessThan(-0.3);
  });

  it('banks into a turn in the air', () => {
    const out = { pitch: 0, roll: 0 };
    // Turning right: yaw goes down.
    rideTilt(ride('air'), { x: 0, y: 5, z: 0, yaw: 0 }, { width: 2, length: 4 }, flat, -1, 0, out);
    expect(out.roll).toBeGreaterThan(0.1);
  });
});

describe('ride controller', () => {
  let physics: PhysicsWorld;
  beforeAll(async () => {
    await initPhysics();
  });
  afterEach(() => physics?.dispose());
  const DT = 1 / 60;

  const surfaceOf =
    (water: number | null = null) =>
    (_x: number, _z: number, out: RideSurface = { ground: 0, water: null }) => {
      out.ground = 0;
      out.water = water;
      return out;
    };

  const make = (r: Ride, water: number | null = null, y = 0) =>
    new RideController(
      physics,
      { instanceId: 'a', bounds: box(2, 1, 4), pose: { x: 0, y, z: 0, yaw: 0 } },
      r,
      surfaceOf(water),
    );

  it('reaches the top speed at full throttle on flat ground', () => {
    physics = new PhysicsWorld();
    physics.addGround(200);
    const controller = make(ride('ground'));
    const input = { throttle: 1, steer: 0, up: false, down: false };
    for (let i = 0; i < 180; i += 1) controller.step(input, DT, 1);
    expect(controller.speed).toBeCloseTo(20, 0);
    expect(controller.pose.z).toBeGreaterThan(20);
    expect(Math.abs(controller.pose.x)).toBeLessThan(0.01);
    expect(controller.pose.y).toBeGreaterThan(-0.05);
    expect(controller.pose.y).toBeLessThan(0.1);
  });

  it('is stopped by a wall', () => {
    physics = new PhysicsWorld();
    physics.addGround(200);
    physics.addBox({ x: 0, y: 2, z: 10 }, { x: 5, y: 2, z: 0.5 });
    const controller = make(ride('ground'));
    const input = { throttle: 1, steer: 0, up: false, down: false };
    for (let i = 0; i < 240; i += 1) controller.step(input, DT, 1);
    // The front of a 4 m item stops at the wall's face (z = 9.5).
    expect(controller.pose.z).toBeLessThan(7.6);
    expect(controller.speed).toBeLessThan(5);
  });

  it('floats in the water band on a pool', () => {
    physics = new PhysicsWorld();
    physics.addGround(200);
    const controller = make(ride('water'), 1.5, 1.2);
    const input = { throttle: 1, steer: 0.3, up: false, down: false };
    for (let i = 0; i < 180; i += 1) {
      controller.step(input, DT, 1);
      expect(Math.abs(controller.pose.y - 1.5)).toBeLessThan(2);
    }
    expect(controller.pose.y).toBeCloseTo(1.4, 1);
    expect(controller.speed).toBeGreaterThan(5);
  });

  it('stops a water item at the shore', () => {
    physics = new PhysicsWorld();
    physics.addGround(200);
    const pool = (x: number, z: number, out: RideSurface = { ground: 0, water: null }) => {
      out.ground = 0;
      out.water = z < 10 ? 1.5 : null;
      return out;
    };
    const controller = new RideController(
      physics,
      { instanceId: 'a', bounds: box(2, 1, 4), pose: { x: 0, y: 1.4, z: 0, yaw: 0 } },
      ride('water'),
      pool,
    );
    const input = { throttle: 1, steer: 0, up: false, down: false };
    for (let i = 0; i < 300; i += 1) controller.step(input, DT, 1);
    expect(controller.pose.z).toBeLessThan(10);
    expect(controller.pose.z).toBeGreaterThan(9);
    expect(controller.pose.y).toBeCloseTo(1.4, 1);
  });

  it('brings a flying item at its height limit down over a cliff edge smoothly, as the room accepts', () => {
    physics = new PhysicsWorld();
    physics.addGround(400);
    // The ground's height is 50 m before z 20 and 0 after it (the room and this device agree).
    const cliff = (_x: number, z: number, out: RideSurface = { ground: 0, water: null }) => {
      out.ground = z < 20 ? 50 : 0;
      out.water = null;
      return out;
    };
    const air = ride('air', { ceiling: 20 });
    const controller = new RideController(
      physics,
      { instanceId: 'a', bounds: box(2, 1, 4), pose: { x: 0, y: 70, z: 0, yaw: 0 } },
      air,
      cliff,
    );
    const input = { throttle: 1, steer: 0, up: true, down: false };
    const serverSurface = (x: number, z: number) => cliff(x, z);
    let last: MoveSample = { x: 0, y: 70, z: 0, at: 0 };
    let refused = 0;
    let lowest = 70;
    for (let frame = 1; frame <= 60 * 6; frame += 1) {
      const before = controller.pose.y;
      controller.step(input, DT, 1);
      // Never a snap: at most airDrop per second down.
      expect(before - controller.pose.y).toBeLessThanOrEqual(MOVE_CHECK.airDrop * DT + 1e-6);
      // The limit is the one where the item arrives: over the edge it starts down in that same step.
      const cap = cliff(controller.pose.x, controller.pose.z).ground + air.ceiling;
      expect(controller.pose.y).toBeLessThanOrEqual(Math.max(cap, before - MOVE_CHECK.airDrop * DT) + 1e-6);
      lowest = Math.min(lowest, controller.pose.y);
      if (frame % 3 !== 0) continue;
      const { x, y, z } = controller.pose;
      const now = (frame / 60) * 1000;
      const budget: MoveBudget = { slack: 0, rise: 0 };
      if (rideMoveAllowed(air, last, { x, y, z }, now, serverSurface, 1, budget)) last = { x, y, z, at: now, ...budget };
      else refused += 1;
    }
    expect(controller.pose.z).toBeGreaterThan(40);
    expect(refused).toBe(0);
    expect(controller.pose.y).toBeCloseTo(20, 1);
    controller.dispose();
  });

  it('teleports to a pose and stops', () => {
    physics = new PhysicsWorld();
    physics.addGround(200);
    const controller = make(ride('ground'));
    const input = { throttle: 1, steer: 0, up: false, down: false };
    for (let i = 0; i < 60; i += 1) controller.step(input, DT, 1);
    controller.teleport({ x: 5, y: 0, z: -5, yaw: 1 });
    expect(controller.pose).toEqual({ x: 5, y: 0, z: -5, yaw: 1 });
    expect(controller.speed).toBe(0);
    controller.dispose();
  });
});
