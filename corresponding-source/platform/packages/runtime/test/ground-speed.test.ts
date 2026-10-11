import { describe, expect, it } from 'vitest';
import { GroundSpeed, GROUND_SPEED } from '../src/ground-speed.js';

const walk = (meter: GroundSpeed, from: number, speed: number, seconds: number, dt = 1 / 60) => {
  let x = from;
  for (let t = 0; t < seconds; t += dt) {
    x += speed * dt;
    meter.sample(x, 0, dt);
  }
  return x;
};

describe('GroundSpeed: the speed over the ground the Speed display shows', () => {
  it('settles on the speed walked', () => {
    const meter = new GroundSpeed();
    walk(meter, 0, 5, 2);
    expect(meter.value).toBeCloseTo(5, 1);
  });

  it('starts at zero: the first sample only sets where it measures from', () => {
    const meter = new GroundSpeed();
    meter.sample(40, 40, 1 / 60);
    expect(meter.value).toBe(0);
  });

  it('does not count a respawn or teleport as speed when told (reset)', () => {
    const meter = new GroundSpeed();
    const x = walk(meter, 0, 5, 2);
    meter.reset();
    meter.sample(x + 2.5, 0, 1 / 60);
    expect(meter.value).toBe(0);
    meter.sample(x + 2.5, 0, 1 / 60);
    expect(meter.value).toBe(0);
  });

  it('skips a jump no body moves in one frame, even when nobody said it was a teleport', () => {
    const meter = new GroundSpeed();
    const x = walk(meter, 0, 5, 2);
    const before = meter.value;
    meter.sample(x + 30, 0, 1 / 60);
    expect(meter.value).toBe(before);
    // Measuring goes on from the new spot.
    walk(meter, x + 30, 5, 0.2);
    expect(meter.value).toBeLessThan(GROUND_SPEED.teleportSpeed);
    expect(meter.value).toBeCloseTo(5, 0);
  });

  it('takes a steered item\'s own speed as it is', () => {
    const meter = new GroundSpeed();
    meter.set(-12);
    expect(meter.value).toBe(12);
  });
});
