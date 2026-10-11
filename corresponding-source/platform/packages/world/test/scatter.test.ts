import type { WorldSeed } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import {
  CLEARING_RADIUS,
  COVER_LAYERS,
  scatterIn,
  TerrainData,
  scatterInChunk,
  woodsOf,
  type Cover,
  type ScatterGround,
  type Soil,
} from '../src/index.js';

const world: WorldSeed = { seed: 42, kind: 'valley', generator: 1 };
const BOX = { minX: -120, maxX: 120, minZ: -120, maxZ: 120 };

/** Ground that answers however a test wants it to; flat grass with nothing on it by default. */
function ground(over: Partial<ScatterGround> = {}): ScatterGround {
  return {
    heightAt: () => 0,
    coverAt: () => 'default' as Cover,
    soilAt: () => 'grass' as Soil,
    ...over,
  };
}

describe('what scatters on the ground (P2-40)', () => {
  it('puts the same things in the same places from the same seed', () => {
    const a = scatterIn(ground(), world, woodsOf('valley'), BOX);
    const b = scatterIn(ground(), world, woodsOf('valley'), BOX);
    expect(a.length).toBeGreaterThan(20);
    expect(a).toEqual(b);
    // Another seed is another wood.
    const other = scatterIn(ground(), { ...world, seed: 43 }, woodsOf('valley'), BOX);
    expect(other).not.toEqual(a);
  });

  it('works a patch out on its own, so it can stream with the chunks', () => {
    const whole = scatterIn(ground(), world, woodsOf('valley'), { minX: 0, maxX: 128, minZ: 0, maxZ: 64 });
    const left = scatterIn(ground(), world, woodsOf('valley'), { minX: 0, maxX: 64, minZ: 0, maxZ: 64 });
    const right = scatterIn(ground(), world, woodsOf('valley'), { minX: 64, maxX: 128, minZ: 0, maxZ: 64 });
    // Two halves hold what the whole does; the join may repeat a tree that sits exactly on it.
    for (const tree of whole) {
      expect([...left, ...right].some((t) => t.x === tree.x && t.z === tree.z)).toBe(true);
    }
  });

  it('leaves the spawn clearing empty, so nobody arrives inside a tree', () => {
    const trees = scatterIn(ground(), world, woodsOf('valley'), BOX);
    expect(trees.length).toBeGreaterThan(0);
    for (const tree of trees) expect(Math.hypot(tree.x, tree.z)).toBeGreaterThanOrEqual(CLEARING_RADIUS);
  });

  it('stays out of water, off anything built, and off steep ground', () => {
    const all = scatterIn(ground(), world, woodsOf('valley'), BOX).length;
    expect(scatterIn(ground({ waterAt: () => 5 }), world, woodsOf('valley'), BOX)).toEqual([]);
    expect(scatterIn(ground({ builtAt: () => true }), world, woodsOf('valley'), BOX)).toEqual([]);
    // A wall of ground: the slope is far past what any layer accepts.
    const steep = ground({ heightAt: (x) => x * 3 });
    expect(scatterIn(steep, world, woodsOf('valley'), BOX)).toEqual([]);
    // Water below the ground is not water to stand in.
    expect(scatterIn(ground({ waterAt: () => -5 }), world, woodsOf('valley'), BOX).length).toBe(all);
  });

  it('scatters nothing where something is built (P2-43)', () => {
    const all = scatterIn(ground(), world, woodsOf('valley'), BOX);
    const none = scatterIn(ground(), world, woodsOf('valley'), BOX, { blocked: () => true });
    expect(all.length).toBeGreaterThan(0);
    expect(none).toEqual([]);
    // Only the spots it names are kept free, and the chunk version passes it through too.
    const half = scatterIn(ground(), world, woodsOf('valley'), BOX, { blocked: (x) => x < 0 });
    expect(half).toEqual(all.filter((t) => t.x >= 0));
    const terrain = { chunkSize: 64 };
    expect(
      scatterInChunk(ground(), world, woodsOf('valley'), terrain, 1, 1, { blocked: () => true }),
    ).toEqual([]);
  });

  it('only stands on the soils its layer names', () => {
    expect(scatterIn(ground({ soilAt: () => 'snow' }), world, woodsOf('valley'), BOX)).toEqual([]);
    expect(scatterIn(ground({ soilAt: () => 'dirt' }), world, woodsOf('valley'), BOX).length).toBeGreaterThan(
      0,
    );
  });

  it('is cleared away wherever the creator cleared the ground', () => {
    // This is what a rule has instead of a row it could delete.
    expect(scatterIn(ground({ coverAt: () => 'cleared' }), world, woodsOf('valley'), BOX)).toEqual([]);
  });

  it('keeps the woods out of ground that was painted, and the paint out of ground that was not', () => {
    const painted = ground({ coverAt: () => 'plants' });
    // The world's own woods grow only where nothing was painted.
    expect(scatterIn(painted, world, woodsOf('valley'), BOX)).toEqual([]);
    // The painted layer grows only where it was painted.
    expect(scatterIn(painted, world, COVER_LAYERS.plants, BOX).length).toBeGreaterThan(0);
    expect(scatterIn(ground(), world, COVER_LAYERS.plants, BOX)).toEqual([]);
    // And one painted cover does not grow another's things.
    expect(scatterIn(painted, world, COVER_LAYERS.pebbles, BOX)).toEqual([]);
  });

  it('stands everything on the ground, turned and sized differently', () => {
    const trees = scatterIn(ground({ heightAt: () => 12 }), world, woodsOf('valley'), BOX);
    for (const tree of trees) {
      expect(tree.y).toBe(12);
      expect(tree.yaw).toBeGreaterThanOrEqual(0);
      expect(tree.yaw).toBeLessThan(Math.PI * 2);
      expect(tree.scale).toBeGreaterThan(0.5);
      expect(tree.scale).toBeLessThan(1.5);
    }
    expect(new Set(trees.map((t) => t.scale)).size).toBeGreaterThan(5);
    expect(new Set(trees.map((t) => t.itemId)).size).toBeGreaterThan(1);
  });

  it('puts more things down when the layer is denser', () => {
    const sparse = scatterIn(ground(), world, { ...woodsOf('valley'), density: 0.1 }, BOX).length;
    const thick = scatterIn(ground(), world, { ...woodsOf('valley'), density: 1 }, BOX).length;
    expect(thick).toBeGreaterThan(sparse * 3);
    expect(scatterIn(ground(), world, { ...woodsOf('valley'), density: 0 }, BOX)).toEqual([]);
  });

  it('gives each kind of world its own woods', () => {
    const kinds: Array<WorldSeed['kind']> = ['valley', 'island', 'plain', 'mountains'];
    const densities = kinds.map((k) => woodsOf(k).density);
    expect(new Set(densities).size).toBeGreaterThan(1);
    // Mountains take steeper ground than the rest.
    expect(woodsOf('mountains').maxSlope).toBeGreaterThan(woodsOf('valley').maxSlope);
  });
});

describe('everything scattered stands on the ground (P2-40, owner rule 2026-09-28)', () => {
  /**
   * The owner sent a picture of a wood where trunks hung in the air with a rock among the leaves.
   * A thing that does not touch the ground is not a thing that happens: it is always a fault, and
   * it is one nobody can see in a test unless the test looks for it, so this looks for it.
   *
   * This pins the world's half of it. Where a thing stands is decided here and nowhere else, so if
   * this ever fails the fault is in these rules; while it passes and something still hangs in the
   * air, the fault is in the runtime or the drawing, and that is worth knowing at once.
   */
  it('puts every scattered thing exactly on the ground, over a whole neighbourhood', () => {
    const world = { seed: 4242, kind: 'valley' as const, generator: 1 as const };
    const terrain = new TerrainData(250);
    terrain.world = world;
    const ground = {
      heightAt: (x: number, z: number) => terrain.heightAt(x, z),
      coverAt: (x: number, z: number) => terrain.coverAt(x, z),
      soilAt: () => 'grass' as const,
    };
    const layers = [woodsOf(world.kind), COVER_LAYERS.plants, COVER_LAYERS.pebbles];
    let counted = 0;
    let worst = 0;
    for (let cz = -2; cz <= 2; cz += 1)
      for (let cx = -2; cx <= 2; cx += 1)
        for (const layer of layers)
          for (const thing of scatterInChunk(ground, world, layer, terrain, cx, cz)) {
            counted += 1;
            const gap = Math.abs(thing.y - terrain.heightAt(thing.x, thing.z));
            if (gap > worst) worst = gap;
          }
    expect(counted).toBeGreaterThan(200);
    expect(worst).toBe(0);
  });

  it('keeps a stored vertex and the height asked for at the same spot in step', () => {
    // A thing hangs in the air whenever these two disagree: one decides where it stands and the
    // other is what the ground is drawn from.
    const world = { seed: 7, kind: 'mountains' as const, generator: 1 as const };
    const terrain = new TerrainData(250);
    terrain.world = world;
    let worst = 0;
    for (let cz = -1; cz <= 1; cz += 1)
      for (let cx = -1; cx <= 1; cx += 1) {
        const chunk = terrain.getChunk(cx, cz);
        for (let iz = 0; iz < terrain.edge; iz += 1)
          for (let ix = 0; ix < terrain.edge; ix += 1) {
            const x = cx * terrain.chunkSize + ix * terrain.spacing;
            const z = cz * terrain.chunkSize + iz * terrain.spacing;
            const gap = Math.abs((chunk.heights[iz * terrain.edge + ix] ?? 0) - terrain.heightAt(x, z));
            if (gap > worst) worst = gap;
          }
      }
    // A tenth of a millimeter. Chunk heights are stored as float32 and asked for as float64, so
    // they part company around a micrometer; anything a person could see is thousands of times
    // larger than this.
    expect(worst).toBeLessThan(1e-4);
  });
});
