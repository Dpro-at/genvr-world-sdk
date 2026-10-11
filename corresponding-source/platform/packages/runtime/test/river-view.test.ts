import { createWorldState, planRiverCarving, riverProfile, riverProfiles, riverFlowAt } from '@genvr/world';
import { WorldDocument } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { FLOW_DRAG, riverGeometry, sprayPoints } from '../src/river-view.js';

const doc = () =>
  WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'exp-test',
    version: 0,
    style: { base: 'realistic' },
    sizeTier: 'small',
    access: { mode: 'private' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
    terrain: {},
    spawn: { position: [0, 1, 0] },
  });

/** Ground that falls away toward +z, so a river drawn along z runs downhill. */
function sloped(drop = 0.1) {
  const state = createWorldState(doc());
  const t = state.terrain;
  t.applyHeights(
    t.planHeights({ minX: -t.half, maxX: t.half, minZ: -t.half, maxZ: t.half }, (_x, z) => -z * drop),
  );
  return state;
}

const line = (from: number, to: number): Array<[number, number]> => [
  [0, from],
  [0, to],
];

describe('the river ribbon (P2-39)', () => {
  it('follows the water surface, so a steep stretch is a waterfall without extra geometry', () => {
    const state = createWorldState(doc());
    const t = state.terrain;
    // A cliff across the river's path: 4 m down at z = 0.
    t.applyHeights(
      t.planHeights({ minX: -t.half, maxX: t.half, minZ: -t.half, maxZ: t.half }, (_x, z) => (z < 0 ? 4 : 0)),
    );
    const samples = riverProfile(t, line(-30, 30), 6);
    const geometry = riverGeometry(samples);
    const position = geometry.getAttribute('position');

    // Every vertex sits at the surface of the sample it belongs to.
    const perRow = position.count / samples.length;
    expect(perRow).toBe(7);
    for (let i = 0; i < samples.length; i += 1) {
      expect(position.getY(i * perRow)).toBeCloseTo(samples[i]!.surface, 5);
    }
    // The sheet really drops: the top of the river is metres above its foot.
    const first = position.getY(0);
    const last = position.getY(position.count - 1);
    expect(first - last).toBeGreaterThan(3);
  });

  it('carries the depth, the foam and the distance each vertex needs', () => {
    const state = sloped();
    const samples = riverProfile(state.terrain, line(-30, 30), 10);
    const geometry = riverGeometry(samples);
    const depth = geometry.getAttribute('depth');
    const foam = geometry.getAttribute('foam');
    const along = geometry.getAttribute('along');
    expect(depth.count).toBe(along.count);

    // Deepest in the middle of the channel, nothing at the banks.
    const middle = 3;
    expect(depth.getX(middle)).toBeGreaterThan(depth.getX(0));
    expect(depth.getX(0)).toBeCloseTo(0, 5);
    expect(depth.getX(6)).toBeCloseTo(0, 5);
    // Foam gathers along the banks even on calm water.
    expect(foam.getX(0)).toBeGreaterThan(foam.getX(middle));
    // The distance runs from the start of the river to its end.
    expect(along.getX(0)).toBe(0);
    expect(along.getX(along.count - 1)).toBeGreaterThan(50);
  });

  it('puts spray where a waterfall lands, and none on a calm river', () => {
    const cliff = createWorldState(doc());
    const t = cliff.terrain;
    t.applyHeights(
      t.planHeights({ minX: -t.half, maxX: t.half, minZ: -t.half, maxZ: t.half }, (_x, z) => (z < 0 ? 4 : 0)),
    );
    const falls = sprayPoints(riverProfile(t, line(-30, 30), 6));
    expect(falls.length).toBeGreaterThan(0);
    expect(falls[0]!.width).toBeGreaterThan(0);

    const gentle = sloped(0.02);
    expect(sprayPoints(riverProfile(gentle.terrain, line(-30, 30), 6))).toEqual([]);
  });
});

describe('the current in the water (P2-39)', () => {
  /** Swimming speed in the runtime; the current is judged against it. */
  const SWIM_SPEED = 0.6;

  const profilesOf = (flow: number, drop = 0.02) =>
    riverProfiles({ heightAt: sloped(drop).terrain.heightAt.bind(sloped(drop).terrain) }, [
      { id: 'riv-1', points: line(-40, 40), width: 10, widen: 1, flow, params: {} },
    ]);

  it('leaves a swimmer able to work upstream on calm water', () => {
    const state = sloped(0.02);
    const profiles = riverProfiles({ heightAt: (x, z) => state.terrain.heightAt(x, z) }, [
      { id: 'riv-1', points: line(-40, 40), width: 10, widen: 1, flow: 1.5, params: {} },
    ]);
    const [, vz] = riverFlowAt(profiles, 0, 0);
    const push = Math.abs(vz) * FLOW_DRAG;
    expect(push).toBeGreaterThan(0);
    // Slower than a swimmer, so upstream is hard work but possible (owner choice 5).
    expect(push).toBeLessThan(SWIM_SPEED);
  });

  it('carries a swimmer away on a steep stretch', () => {
    const state = sloped(0.5);
    const profiles = riverProfiles({ heightAt: (x, z) => state.terrain.heightAt(x, z) }, [
      { id: 'riv-1', points: line(-40, 40), width: 10, widen: 1, flow: 1.5, params: {} },
    ]);
    const [, vz] = riverFlowAt(profiles, 0, 0);
    expect(Math.abs(vz) * FLOW_DRAG).toBeGreaterThan(SWIM_SPEED);
  });

  it('never pushes a player past the speed the room allows', () => {
    // The room drops a move faster than 12 m/s (MOVEMENT.maxSpeed in place-room.ts). The strongest
    // current a place can hold is the top flow on the steepest water, and the current only reaches
    // a player who is swimming, which is slow. This is what keeps a carried player from being
    // pulled back.
    const MAX_FLOW = 6;
    const MAX_SLOPE_FACTOR = 3;
    const worst = MAX_FLOW * MAX_SLOPE_FACTOR * FLOW_DRAG + SWIM_SPEED;
    expect(worst).toBeLessThan(12);
  });

  it('is nothing outside the banks', () => {
    expect(riverFlowAt(profilesOf(2), 60, 0)).toEqual([0, 0]);
  });
});

describe('carving still agrees with what is drawn', () => {
  it('digs the bed under every ribbon vertex', () => {
    const state = sloped();
    const samples = riverProfile(state.terrain, line(-30, 30), 8);
    state.terrain.applyHeights(planRiverCarving(state.terrain, samples));
    // After carving, the ground along the middle of the river is under its surface.
    for (const sample of samples) {
      expect(state.terrain.heightAt(sample.x, sample.z)).toBeLessThanOrEqual(sample.surface + 1e-6);
    }
  });
});
