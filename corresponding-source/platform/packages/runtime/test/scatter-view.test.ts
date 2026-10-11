import { WorldDocument, type CommandPayload, type WorldSeed } from '@genvr/contracts';
import { COVER_LAYERS, TerrainData, woodsOf, type Cover, type Soil } from '@genvr/world';
import { getCoreItem } from '@genvr/core-library';
import { SurfaceIndex } from '@genvr/validator';
import { describe, expect, it } from 'vitest';
import {
  builtOver,
  DRAW_DISTANCE,
  drawnScatter,
  needsReselect,
  preImage,
  RESELECT,
  ScatterView,
  scatterChunksAfter,
} from '../src/scatter-view.js';

const world: WorldSeed = { seed: 42, kind: 'valley', generator: 1 };

const doc = (withWorld = true) =>
  WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'exp-scatter',
    version: 0,
    style: { base: 'realistic' },
    sizeTier: 'small',
    access: { mode: 'private' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
    terrain: withWorld ? { world } : {},
    spawn: { position: [0, 1, 0] },
  });

function view() {
  const terrain = new TerrainData(250);
  terrain.world = world;
  return new ScatterView(terrain, {
    heightAt: (x, z) => terrain.heightAt(x, z),
    coverAt: (x, z) => terrain.coverAt(x, z) as Cover,
    soilAt: () => 'grass' as Soil,
  });
}

describe('what grows around the player (P2-40)', () => {
  it('fills in the ground around the player and says it changed', () => {
    const scatter = view();
    expect(scatter.update(doc(), 0, 0)).toBe(true);
    expect(scatter.instances.length).toBeGreaterThan(20);
    // Everything it makes is locked, so nobody drags a tree the world put there.
    expect(scatter.instances.every((i) => i.locked)).toBe(true);
    expect(scatter.instances.every((i) => i.instanceId.startsWith('scatter:'))).toBe(true);
  });

  it('costs nothing while the player stays on the same ground', () => {
    const scatter = view();
    scatter.update(doc(), 0, 0);
    // Still inside the same 64 m chunk: nothing to redo, so the caller is told so and hands
    // ItemsView nothing. Kept positive on purpose: -3 is in the chunk before this one.
    expect(scatter.update(doc(), 4, 6)).toBe(false);
    expect(scatter.update(doc(), 60, 60)).toBe(false);
    // One metre over the edge is another chunk, and that does have to be worked out.
    expect(scatter.update(doc(), 65, 60)).toBe(true);
  });

  it('works out new ground when the player walks into it', () => {
    const scatter = view();
    scatter.update(doc(), 0, 0);
    const before = scatter.instances.map((i) => i.instanceId).join('|');
    expect(scatter.update(doc(), 200, 200)).toBe(true);
    expect(scatter.instances.map((i) => i.instanceId).join('|')).not.toBe(before);
  });

  it('grows nothing at all in a place with no starter world', () => {
    const scatter = view();
    expect(scatter.update(doc(false), 0, 0)).toBe(false);
    expect(scatter.instances).toEqual([]);
  });

  it('can be turned off, for a device that cannot afford it', () => {
    const scatter = view();
    scatter.update(doc(), 0, 0);
    expect(scatter.instances.length).toBeGreaterThan(0);
    scatter.setEnabled(false);
    expect(scatter.instances).toEqual([]);
    expect(scatter.update(doc(), 0, 0)).toBe(false);
  });

  it('gives the same ground the same things, however the player got there', () => {
    const a = view();
    a.update(doc(), 0, 0);
    const b = view();
    b.update(doc(), 300, 300);
    b.update(doc(), 0, 0);
    expect(b.instances.map((i) => i.instanceId).sort()).toEqual(a.instances.map((i) => i.instanceId).sort());
  });
});

describe('every scattered thing is a real item (P2-40)', () => {
  it('names only items the Core Library actually has', () => {
    // The first try named `genvr.core.pine-tree` and `genvr.core.round-tree`, neither of which
    // exists, so every tree in the world drew as a white placeholder box. Nothing failed: a
    // missing item is not an error anywhere, it is just a box. This is the check that catches it.
    const layers = [
      ...(['valley', 'island', 'plain', 'mountains'] as const).map((kind) => woodsOf(kind)),
      COVER_LAYERS.plants,
      COVER_LAYERS.pebbles,
    ];
    const missing = layers.flatMap((layer) =>
      layer.items.filter((id) => !getCoreItem(id)).map((id) => `${layer.id}: ${id}`),
    );
    expect(missing).toEqual([]);
  });
});

describe('the World tab woods setting (P2-40 task 5)', () => {
  /** The same document with a woods setting on its style. */
  const withWoods = (on: boolean, density: number) => {
    const document = doc();
    document.style = { ...document.style, woods: { on, density } };
    return document;
  };

  it('thins the woods when the density is turned down, and back again', () => {
    const scatter = view();
    scatter.update(withWoods(true, 1), 0, 0);
    const normal = scatter.instances.length;
    // A changed setting is worked out at once: the player has not walked anywhere.
    expect(scatter.update(withWoods(true, 0.25), 0, 0)).toBe(true);
    const few = scatter.instances.length;
    expect(few).toBeLessThan(normal);
    expect(scatter.update(withWoods(true, 2), 0, 0)).toBe(true);
    expect(scatter.instances.length).toBeGreaterThan(normal);
  });

  it('takes the woods away without touching what the creator painted', () => {
    const terrain = new TerrainData(250);
    terrain.world = world;
    const square = (r: number, cx: number, cz: number): Array<[number, number]> => [
      [cx - r, cz - r],
      [cx + r, cz - r],
      [cx + r, cz + r],
      [cx - r, cz + r],
    ];
    terrain.paintCover(square(30, 80, 80), 'plants');
    const scatter = new ScatterView(terrain, {
      heightAt: (x, z) => terrain.heightAt(x, z),
      coverAt: (x, z) => terrain.coverAt(x, z) as Cover,
      soilAt: () => 'grass' as Soil,
    });
    scatter.update(withWoods(false, 1), 80, 80);
    const left = scatter.instances;
    expect(left.length).toBeGreaterThan(0);
    // Turning the woods off must not rub out a patch the creator painted by hand.
    expect(left.every((i) => i.instanceId.startsWith('scatter:cover-plants:'))).toBe(true);
  });

  it('is on at normal density when a place has never said otherwise', () => {
    const scatter = view();
    scatter.update(doc(), 0, 0);
    const missing = scatter.instances.length;
    const scatter2 = view();
    scatter2.update(withWoods(true, 1), 0, 0);
    expect(missing).toBe(scatter2.instances.length);
  });
});

describe('nothing grows where something is built (P2-43)', () => {
  const square = (cx: number, cz: number, half: number): Array<[number, number]> => [
    [cx - half, cz - half],
    [cx + half, cz - half],
    [cx + half, cz + half],
    [cx - half, cz + half],
  ];
  const built = () => {
    const place = doc();
    place.instances.push({
      instanceId: 'deck-1',
      itemId: 'deck',
      transform: { position: [60, 0, 60], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      params: {},
    });
    return new SurfaceIndex(place, {
      groundAt: () => 0,
      // A lake west of x = -20, and a shore east of it where the water lies under the ground.
      waterAt: (x) => (x < -20 ? 0.8 : -0.4),
      itemShape: (id) =>
        id === 'deck' ? { min: [-2, 0, -2], max: [2, 0.3, 2], solid: true, part: false } : null,
      floors: [{ level: 0.5, points: square(40, 40, 3) }],
    });
  };

  it('is blocked on floors and items, never by water or its shore', () => {
    const surfaces = built();
    expect(builtOver(surfaces, 40, 40)).toBe(true);
    expect(builtOver(surfaces, 61, 59)).toBe(true);
    expect(builtOver(surfaces, 10, 10)).toBe(false);
    expect(builtOver(surfaces, -30, 0)).toBe(false);
    expect(builtOver(surfaces, -10, 0)).toBe(false);
  });

  it('keeps its trees off a built spot', () => {
    const terrain = new TerrainData(250);
    terrain.world = world;
    const ground = {
      heightAt: () => 0,
      coverAt: (x: number, z: number) => terrain.coverAt(x, z) as Cover,
      soilAt: () => 'grass' as Soil,
    };
    const free = new ScatterView(terrain, ground);
    const blocked = new ScatterView(terrain, ground, { blocked: (x) => x > 0 });
    free.update(doc(), 0, 0);
    blocked.update(doc(), 0, 0);
    expect(free.instances.some((i) => i.transform.position[0] > 0)).toBe(true);
    expect(blocked.instances.length).toBeGreaterThan(0);
    expect(blocked.instances.every((i) => i.transform.position[0] <= 0)).toBe(true);
  });

  it('works out again the chunks an item left and reached, and everything after a road', () => {
    const place = doc();
    place.instances.push({
      instanceId: 'deck-1',
      itemId: 'deck',
      transform: { position: [70, 0, 10], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      params: {},
    });
    const reach = (_id: string, scale: readonly number[]) => 2 * Math.max(scale[0]!, scale[2]!);
    const moved = scatterChunksAfter(
      [
        {
          applied: { type: 'transform_item', params: { instanceId: 'deck-1', position: [70, 0, 10] } },
          result: {
            inverse: {
              type: 'transform_item',
              params: {
                instanceId: 'deck-1',
                position: [10, 0, 63],
                rotation: [0, 0, 0, 1],
                scale: [1, 1, 1],
              },
            },
          },
        },
      ],
      place,
      64,
      reach,
    );
    // Now at x 70 (chunk 1, 0); before at z 63, reaching over into chunk 0, 1.
    expect(moved).toEqual(new Set(['1,0', '0,0', '0,1']));
    const road = scatterChunksAfter(
      [
        {
          applied: { type: 'remove_road', params: { roadId: 'r' } } as never,
          result: { inverse: { type: 'remove_road', params: { roadId: 'r' } } as never },
        },
      ],
      place,
      64,
      reach,
    );
    expect(road).toBe('all');
  });

  it('regrows where a remote move or remove left, read before it is applied', () => {
    const place = doc();
    place.instances.push({
      instanceId: 'deck-1',
      itemId: 'deck',
      transform: { position: [10, 0, 10], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      params: {},
    });
    const reach = () => 2;
    const move = {
      type: 'transform_item',
      params: { instanceId: 'deck-1', position: [200, 0, 10] },
    } as const satisfies CommandPayload;
    const moveBefore = preImage(place, move);
    // The remote move lands; only then are the chunks worked out.
    place.instances[0]!.transform.position = [200, 0, 10];
    expect(
      scatterChunksAfter([{ applied: move, result: { inverse: moveBefore } }], place, 64, reach),
    ).toEqual(new Set(['3,0', '0,0']));
    const remove = {
      type: 'remove_item',
      params: { instanceId: 'deck-1' },
    } as const satisfies CommandPayload;
    const removeBefore = preImage(place, remove);
    place.instances.splice(0, 1);
    expect(
      scatterChunksAfter([{ applied: remove, result: { inverse: removeBefore } }], place, 64, reach),
    ).toEqual(new Set(['3,0']));
    // Anything else adds no old spot.
    expect(preImage(place, remove)).toBe(remove);
  });
});

describe('only what stands on full-detail ground is drawn (P2-43 final review, I4)', () => {
  it('keeps the worked-out ring for caching but draws only within the draw distance', () => {
    const scatter = view();
    scatter.update(doc(), 0, 0);
    const far = (list: readonly { transform: { position: readonly number[] } }[], limit: number) =>
      list.filter(({ transform: { position } }) => Math.hypot(position[0]!, position[2]!) > limit);
    // The 5 x 5 ring of 64 m chunks reaches well past 128 m.
    expect(far(scatter.instances, DRAW_DISTANCE).length).toBeGreaterThan(0);
    const drawn = drawnScatter(scatter.instances, 0, 0);
    expect(drawn.length).toBeGreaterThan(0);
    // Drawn things stay within the draw distance even after the player walks up to RESELECT
    // metres before the selection is made again.
    expect(far(drawn, DRAW_DISTANCE - RESELECT)).toEqual([]);
  });

  it('asks for a new selection only after the player walked RESELECT metres', () => {
    expect(needsReselect(null, 0, 0)).toBe(true);
    expect(needsReselect({ x: 0, z: 0 }, RESELECT - 1, 0)).toBe(false);
    expect(needsReselect({ x: 0, z: 0 }, RESELECT + 1, 0)).toBe(true);
  });
});
