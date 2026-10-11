import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Vector3, Euler } from 'three';
import { createSwimMotion, stepSwimMotion, swimLookForward, swimFallout } from '../src/swim-motion.js';

// Execute the actual pinned source motion section, excluding unrelated audio/ladder/walk transitions.
const source = readFileSync(
  new URL('../../../../tooling/other-programs/tidewater/src/player/Player.js', import.meta.url),
  'utf8',
);
const start = source.indexOf('updateSwim( dt ) {') + 'updateSwim( dt ) {'.length;
const body = source.slice(start, source.indexOf('// strokes / bubbles', start));
const oracle = new Function(
  'THREE',
  '_fwd',
  '_right',
  '_e',
  'SWIM_EYE',
  'RADIUS',
  `return function(dt){${body}}`,
)({ Vector3 }, new Vector3(), new Vector3(), new Euler(), 1.62 * 0.1, 0.3);

describe('Source underwater motion', () => {
  it('allows deep valid water without removing dry-world fallout protection', () => {
    expect(swimFallout(-70, true, 20)).toBe(false);
    expect(swimFallout(-70, true, null)).toBe(true);
    expect(swimFallout(-70, false, 20)).toBe(true);
    expect(swimFallout(-29, false, null)).toBe(false);
  });
  it.each([0, Math.PI / 2, Math.PI, -Math.PI / 2, 1.234])('neutral view matches walking yaw %s', (yaw) => {
    expect(swimLookForward(yaw, 0.35, 0.35)).toEqual({ x: -Math.sin(yaw), y: -0, z: -Math.cos(yaw) });
  });
  it('keeps default third-person W at the surface and dives when deliberately looking down', () => {
    const state = createSwimMotion();
    const input = {
      forward: swimLookForward(Math.PI, 0.35, 0.35),
      right: { x: -1, z: 0 },
      direction: { x: 0, z: 1 },
      ascend: false,
      dive: false,
      sprint: false,
      magnitude: 1,
    };
    expect(stepSwimMotion(state, input, 0, 0, 1 / 60).y).toBe(0);
    expect(state.floating).toBe(true);
    input.forward = swimLookForward(Math.PI, 0.95, 0.35);
    expect(stepSwimMotion(state, input, 0, 0, 1 / 60).y).toBeLessThan(0);
    expect(state.floating).toBe(false);
  });
  it.each([
    ['surface', 0, false, false],
    ['look-down', -0.6, false, false],
    ['C dive', 0, true, false],
    ['ascent', 0, false, true],
  ] as const)('%s agrees with executable source in translated feet coordinates', (_name, pitch, dive, up) => {
    const state = createSwimMotion(),
      position = new Vector3(0, -0.062, 0);
    const original = {
      position,
      velocity: new Vector3(),
      pitch,
      yaw: 0,
      floating: true,
      waterH: 0,
      input: { down: (key: string) => key === 'KeyW' || (dive && key === 'KeyC') || (up && key === 'Space') },
      colliders: { resolveCapsule: () => {} },
      groundAt: () => -100,
    };
    let feet = 0;
    for (let i = 0; i < 100; i++) {
      oracle.call(original, 1 / 60);
      const delta = stepSwimMotion(
        state,
        {
          forward: { x: 0, y: Math.sin(pitch), z: -Math.cos(pitch) },
          right: { x: 1, z: 0 },
          direction: { x: 0, z: 1 },
          ascend: up,
          dive,
          sprint: false,
          magnitude: 1,
        },
        feet,
        0,
        1 / 60,
      );
      feet += delta.y;
      expect(feet - 0.062).toBeCloseTo(position.y, 10);
      expect(state.velocity.y).toBeCloseTo(original.velocity.y, 10);
      expect(state.floating).toBe(original.floating);
    }
  });
  it('has neutral buoyancy after damping residual motion, and sprint does not trigger descent', () => {
    const state = createSwimMotion();
    state.floating = false;
    const idle = {
      forward: { x: 0, y: 0, z: -1 },
      right: { x: 1, z: 0 },
      direction: { x: 0, z: 0 },
      ascend: false,
      dive: false,
      sprint: true,
      magnitude: 0,
    };
    expect(stepSwimMotion(state, idle, -5, 0, 1 / 60)).toEqual({ x: 0, y: 0, z: 0 });
    expect(stepSwimMotion(state, idle, -5, 0, 0)).toEqual({ x: 0, y: 0, z: 0 });
  });
});
