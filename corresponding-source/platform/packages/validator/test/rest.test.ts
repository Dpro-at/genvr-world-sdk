import { WorldDocument, type ItemInstance } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { rotate } from '../src/geometry.js';
import { isResting, rest, SurfaceIndex, yawOf, type RestShape } from '../src/index.js';

const doc = (instances: ItemInstance[] = []) =>
  WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'x',
    version: 0,
    style: { base: 'blocky' },
    sizeTier: 'small',
    access: { mode: 'private' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
    terrain: {},
    spawn: { position: [50, 1, 50] },
    instances,
  });
const at = (id: string, x: number, y: number, z: number, yaw = 0): ItemInstance => ({
  instanceId: id,
  itemId: id,
  transform: {
    position: [x, y, z],
    rotation: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)],
    scale: [1, 1, 1],
  },
  params: {},
});
const slope = (x: number) => x * 0.2; // about 11 degrees
const surfaces = (instances: ItemInstance[] = []) =>
  new SurfaceIndex(doc(instances), { groundAt: slope, itemShape: () => null });

const tree: RestShape = {
  min: [-3, 0, -3],
  max: [3, 10, 3],
  rule: { mode: 'upright', sink: 0.3, base: { min: [-0.2, -0.2], max: [0.2, 0.2] } },
};
const rock: RestShape = {
  min: [-1, -0.2, -1],
  max: [1, 1, 1],
  rule: { mode: 'tilt', sink: 0.1 },
  maxTilt: 25,
};
const house: RestShape = { min: [-4, 0, -4], max: [4, 6, 4], rule: { mode: 'grade' } };
const stall: RestShape = { min: [-2, 0, -2], max: [2, 3, 2], rule: { mode: 'foundation' } };
const cloud: RestShape = { min: [-2, 0, -2], max: [2, 1, 2], rule: { mode: 'float' } };

describe('rest (P2-43)', () => {
  it('stands a tree upright on its trunk, never on its canopy', () => {
    const result = rest(at('tree', 10, 50, 0), tree, surfaces());
    // Lowest trunk foot is at x = 9.84, ground 1.968: no gap under any trunk foot.
    expect(result.position[1]).toBeCloseTo(slope(10 - 0.16), 3);
    expect(result.rotation).toEqual([0, 0, 0, 1]);
    expect(result.ok).toBe(true);
  });

  it('puts the lowest point, not the pivot, on the ground', () => {
    const result = rest(at('rock', 0, 50, 0), { ...rock, rule: { mode: 'upright', sink: 1 } }, surfaces());
    expect(result.position[1]).toBeCloseTo(slope(-0.8) + 0.2, 3);
  });

  it('tilts a rock with the slope and sinks it a little', () => {
    const result = rest(at('rock', 5, 50, 0), rock, surfaces());
    const tilt = (2 * Math.acos(Math.min(1, Math.abs(result.rotation[3]))) * 180) / Math.PI;
    expect(tilt).toBeCloseTo((Math.atan(0.2) * 180) / Math.PI, 0);
    expect(result.position[1]).toBeCloseTo(slope(5) - 0.1 + 0.2, 2);
  });

  it('grades a house to the mean height of its base', () => {
    const result = rest(at('house', 20, 50, 0), house, surfaces());
    expect(result.grade).not.toBeNull();
    expect(result.grade!.level).toBeCloseTo(4, 2);
    expect(result.position[1]).toBeCloseTo(4, 2);
  });

  it('puts a stall on the highest point with a plinth down to the ground', () => {
    const result = rest(at('stall', 20, 50, 0), stall, surfaces());
    expect(result.position[1]).toBeCloseTo(slope(20 + 1.6), 2);
    expect(result.plinth).toBeCloseTo(0.2 * 3.2, 2);
  });

  it('never moves a floating thing', () => {
    expect(rest(at('cloud', 3, 40, 3), cloud, surfaces()).position).toEqual([3, 40, 3]);
  });

  it('refuses a tree on a slope steeper than its sink allows', () => {
    const steep = new SurfaceIndex(doc(), { groundAt: (x) => x * 2, itemShape: () => null });
    expect(rest(at('tree', 10, 50, 0), tree, steep).ok).toBe(false);
  });

  it('knows a thing that already rests', () => {
    const s = surfaces();
    const placed = rest(at('tree', 10, 50, 0), tree, s);
    const standing = at('tree', 10, placed.position[1], 0);
    expect(isResting(standing, tree, s)).toBe(true);
    expect(isResting(at('tree', 10, placed.position[1] + 0.5, 0), tree, s)).toBe(false);
  });

  it('keeps the yaw when it rests', () => {
    const result = rest(at('tree', 10, 50, 0, 1.2), tree, surfaces());
    // 5 decimals, not 6: rest() rounds each returned rotation component to 1e-6 (P2-43 review
    // round 1, determinism), which by itself can move the recovered yaw by up to ~1e-6 rad — so
    // 6-decimal (5e-7) agreement is not attainable post-rounding. 5 decimals (5e-6) clears that
    // rounding noise with margin while still catching a wrong yaw (which is off by whole degrees).
    expect(yawOf(result.rotation)).toBeCloseTo(1.2, 5);
  });

  describe('yawOf swing-twist (P2-43 review round 1: yawOf misread a tilted rotation)', () => {
    const s = surfaces();

    it.each([45, 130])('keeps a tilted rock true to its %d° yaw, and re-rests idempotently', (yawDeg) => {
      const yaw = (yawDeg * Math.PI) / 180;
      const result = rest(at('rock', 5, 50, 0, yaw), rock, s);
      expect(result.ok).toBe(true);
      // Before the fix, yawOf misread the yaw of a tilted rotation (45° read back as 45.56°),
      // which meant a resting item would never be seen as resting and would re-spin on every
      // re-rest. 5 decimals, not 6: see the note on 'keeps the yaw when it rests' above — the
      // 1e-6 rotation-component rounding caps recoverable yaw precision at about that order.
      expect(yawOf(result.rotation)).toBeCloseTo(yaw, 5);

      const standing: ItemInstance = {
        instanceId: 'rock',
        itemId: 'rock',
        transform: { position: result.position, rotation: result.rotation, scale: [1, 1, 1] },
        params: {},
      };
      expect(isResting(standing, rock, s)).toBe(true);

      const again = rest(standing, rock, s);
      expect(again.position).toEqual(result.position);
      expect(again.rotation).toEqual(result.rotation);
    });
  });

  describe('tilt burial offset (P2-43 review round 1: bury the real bottom point, not the pivot)', () => {
    const boulder: RestShape = {
      min: [-1, -1, -1],
      max: [1, 1, 1],
      rule: { mode: 'tilt', sink: 0.15 },
      maxTilt: 30,
    };
    // The bottom-face centre in world space, `lowest` along the item's own tilted down direction.
    const bottomPoint = (result: ReturnType<typeof rest>) => {
      const u = rotate([0, 1, 0], result.rotation);
      const lowest = boulder.min[1]!;
      return { x: result.position[0] + lowest * u[0], y: result.position[1] + lowest * u[1] };
    };

    it('rests a tilted boulder so its bottom point is exactly sink below the plane', () => {
      const result = rest(at('boulder', 5, 50, 0), boulder, surfaces());
      expect(result.ok).toBe(true);
      const bottom = bottomPoint(result);
      // Position is stored to the millimeter (P2-43 rest.ts `round`), so 3 decimals is the
      // tightest check the public position can support; before this fix the gap was the full
      // `lowest` term (about 0.2 m), far outside this tolerance.
      expect(bottom.y).toBeCloseTo(slope(bottom.x) - 0.15, 3);
    });

    it('still buries the bottom point sink below the plane when the tilt is clamped (ok false)', () => {
      const steep = new SurfaceIndex(doc(), { groundAt: (x) => x * 2, itemShape: () => null });
      const result = rest(at('boulder', 5, 50, 0), boulder, steep);
      expect(result.ok).toBe(false);
      const bottom = bottomPoint(result);
      expect(bottom.y).toBeCloseTo(2 * bottom.x - 0.15, 3);
    });
  });

  describe('options.fromY (P2-43 task 6: a lamp following a table that moved)', () => {
    const tableShape = {
      min: [-0.5, 0, -0.5] as const,
      max: [0.5, 0.8, 0.5] as const,
      solid: true,
      part: false,
    };
    const flatGround = () => 0;
    const tableAt = (top: number): ItemInstance => at('table', 0, top - 0.8, 0);
    const lampShape: RestShape = {
      min: [-0.1, 0, -0.1],
      max: [0.1, 0.3, 0.1],
      rule: { mode: 'upright', sink: 0 },
    };

    it('rests on the ground without fromY once the table it sat on moved up', () => {
      const s = new SurfaceIndex(doc([tableAt(0.8)]), {
        groundAt: flatGround,
        itemShape: (id) => (id === 'table' ? tableShape : null),
      });
      // The table moves up so its top is now 2.8 m; the index reflects the new box.
      s.update(tableAt(2.8), 'table');
      const lamp = at('lamp', 0, 0.8, 0);
      const result = rest(lamp, lampShape, s);
      expect(result.position[1]).toBeCloseTo(0, 3);
    });

    it('rests on the raised table top at 2.8 with { fromY: 3.3 }', () => {
      const s = new SurfaceIndex(doc([tableAt(0.8)]), {
        groundAt: flatGround,
        itemShape: (id) => (id === 'table' ? tableShape : null),
      });
      s.update(tableAt(2.8), 'table');
      const lamp = at('lamp', 0, 0.8, 0);
      const result = rest(lamp, lampShape, s, undefined, undefined, { fromY: 3.3 });
      expect(result.position[1]).toBeCloseTo(2.8, 3);
    });
  });
});

describe('grade levels the ground, not the water (P2-43 final review, I2)', () => {
  it('grades a house over a lake to the lake bed, never up to the water surface', () => {
    const lake = new SurfaceIndex(doc(), { groundAt: () => 0, waterAt: () => 5, itemShape: () => null });
    const result = rest(at('house', 0, 50, 0), house, lake);
    expect(result.grade!.level).toBe(0);
    expect(result.position[1]).toBe(0);
  });
});
