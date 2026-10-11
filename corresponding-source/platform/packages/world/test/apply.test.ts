import { MAX_TERRAIN_SLOPE, RIVER_LIMITS, WorldDocument, type CommandPayload, type Game } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  circleArea,
  CommandError,
  CommandHistory,
  createWorldState,
  encodeTerrain,
  OPENING_PRESETS,
  planWaterFill,
  Replica,
  riverProfile,
  roadProfile,
  roomFloorLevel,
  wallBoxes,
} from '../src/index.js';

const emptyDoc = () =>
  WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'exp-test',
    version: 0,
    style: { base: 'blocky' },
    sizeTier: 'small',
    access: { mode: 'private' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
    terrain: {},
    spawn: { position: [0, 1, 0] },
  });

const square = (r: number, cx = 0, cz = 0): Array<[number, number]> => [
  [cx - r, cz - r],
  [cx + r, cz - r],
  [cx + r, cz + r],
  [cx - r, cz + r],
];

/** Applies a command then its inverse and checks the world returns to the same state. */
function roundTrip(command: CommandPayload, setup: CommandPayload[] = []) {
  const state = createWorldState(emptyDoc());
  for (const step of setup) applyCommand(state, step);
  // Compared as values: key order may differ (e.g. a restored item lists its settings in one order).
  const snapshot = () => JSON.parse(JSON.stringify({ doc: state.doc, terrain: encodeTerrain(state) }));
  const before = snapshot();
  const { inverse } = applyCommand(state, command);
  expect(snapshot()).not.toEqual(before);
  applyCommand(state, inverse);
  expect(snapshot()).toEqual(before);
}

const place: CommandPayload = {
  type: 'place_item',
  params: { instanceId: 'tree-1', itemId: 'genvr.core.tree', position: [5, 0, 5] },
};

describe('applyCommand inverses restore the exact world', () => {
  it('items', () => {
    roundTrip(place);
    roundTrip({ type: 'remove_item', params: { instanceId: 'tree-1' } }, [place]);
    roundTrip({ type: 'transform_item', params: { instanceId: 'tree-1', position: [9, 0, 9] } }, [place]);
    roundTrip(
      {
        type: 'set_item_params',
        params: { instanceId: 'tree-1', params: { color: '#ff0000', material: null } },
      },
      [place],
    );
  });

  it('explorer: names, flags, groups (P3-26)', () => {
    const second: CommandPayload = {
      type: 'place_item',
      params: { instanceId: 'tree-2', itemId: 'genvr.core.tree', position: [8, 0, 5] },
    };
    const group: CommandPayload = {
      type: 'group_items',
      params: { groupId: 'g1', name: 'Trees', instanceIds: ['tree-1', 'tree-2'] },
    };
    roundTrip({ type: 'rename', params: { kind: 'item', id: 'tree-1', name: 'Big tree' } }, [place]);
    roundTrip({ type: 'set_item_flags', params: { instanceId: 'tree-1', locked: true } }, [place]);
    roundTrip({ type: 'set_item_flags', params: { instanceId: 'tree-1', anchored: false } }, [place]);
    // Meant to float (P2-11): set, cleared back to the item type, and kept when a removal is undone.
    roundTrip({ type: 'set_item_flags', params: { instanceId: 'tree-1', floats: true } }, [place]);
    roundTrip({ type: 'set_item_flags', params: { instanceId: 'tree-1', floats: null } }, [
      place,
      { type: 'set_item_flags', params: { instanceId: 'tree-1', floats: false } },
    ]);
    roundTrip(group, [place, second]);
    roundTrip({ type: 'ungroup_items', params: { groupId: 'g1' } }, [place, second, group]);
    roundTrip({ type: 'rename', params: { kind: 'group', id: 'g1', name: 'Forest' } }, [
      place,
      second,
      group,
    ]);
    // Removing a named, locked, grouped item and undoing it puts all of that back.
    // (The last item, since a restored item goes back at the end of the list.)
    roundTrip({ type: 'remove_item', params: { instanceId: 'tree-2' } }, [
      place,
      second,
      group,
      { type: 'rename', params: { kind: 'item', id: 'tree-2', name: 'Big tree' } },
      {
        type: 'set_item_flags',
        params: { instanceId: 'tree-2', locked: true, anchored: false, floats: true },
      },
    ]);
    const road: CommandPayload = {
      type: 'draw_road',
      params: {
        roadId: 'r1',
        points: [
          [0, 0],
          [20, 5],
        ],
        name: 'Main street',
      },
    };
    roundTrip({ type: 'remove_road', params: { roadId: 'r1' } }, [road]);
    roundTrip({ type: 'rename', params: { kind: 'road', id: 'r1', name: null } }, [road]);
  });

  it('explorer rules', () => {
    const state = createWorldState(emptyDoc());
    applyCommand(state, place);
    const code = (command: CommandPayload) => {
      try {
        applyCommand(state, command);
        return 'ok';
      } catch (error) {
        return (error as CommandError).code;
      }
    };
    const group = (groupId: string): CommandPayload => ({
      type: 'group_items',
      params: { groupId, name: 'G', instanceIds: ['tree-1'] },
    });
    expect(code(group('g1'))).toBe('ok');
    expect(code(group('g2'))).toBe('invalid');
    expect(code(group('g1'))).toBe('duplicate');
    expect(code({ type: 'rename', params: { kind: 'group', id: 'g1', name: null } })).toBe('invalid');
    expect(code({ type: 'rename', params: { kind: 'wall', id: 'nope', name: 'x' } })).toBe('not_found');
    expect(
      code({
        type: 'place_item',
        params: { instanceId: 't9', itemId: 'genvr.core.tree', position: [0, 0, 0], groupId: 'nope' },
      }),
    ).toBe('not_found');
    applyCommand(state, {
      type: 'set_item_flags',
      params: { instanceId: 'tree-1', locked: true, anchored: false },
    });
    expect(state.doc.instances[0]).toMatchObject({ locked: true, anchored: false, groupId: 'g1' });
    applyCommand(state, {
      type: 'set_item_flags',
      params: { instanceId: 'tree-1', locked: false, anchored: true },
    });
    expect(state.doc.instances[0]!.locked).toBeUndefined();
    expect(state.doc.instances[0]!.anchored).toBeUndefined();
  });

  it('environment', () => {
    roundTrip({ type: 'set_style', params: { base: 'anime', accent: 'realistic' } });
    roundTrip({ type: 'set_sky', params: { preset: 'sunset' } });
    roundTrip({ type: 'set_weather', params: { preset: 'rain' } });
    const water: CommandPayload = {
      type: 'add_water',
      params: { id: 'lake-1', kind: 'lake', area: square(10), level: 0.5, params: {} },
    };
    roundTrip(water);
    roundTrip({ type: 'remove_water', params: { waterId: 'lake-1' } }, [water]);
    roundTrip({ type: 'set_water_level', params: { waterId: 'lake-1', level: 2 } }, [water]);
  });

  it('rivers and the sea (P2-39)', () => {
    const river: CommandPayload = {
      type: 'draw_river',
      params: {
        riverId: 'riv-1',
        points: [
          [0, 0],
          [30, 8],
        ],
        width: 8,
        name: 'Valley river',
      },
    };
    roundTrip(river);
    roundTrip({ type: 'remove_river', params: { riverId: 'riv-1' } }, [river]);
    roundTrip({ type: 'edit_river', params: { riverId: 'riv-1', width: 20 } }, [river]);
    roundTrip({ type: 'edit_river', params: { riverId: 'riv-1', flow: 4 } }, [river]);
    roundTrip({ type: 'rename', params: { kind: 'river', id: 'riv-1', name: null } }, [river]);
    roundTrip({ type: 'set_sea', params: { level: -2 } });
    roundTrip({ type: 'set_sea', params: { level: null } }, [{ type: 'set_sea', params: { level: -2 } }]);
    // The swell (Tidewater sea, plan task 3): set, cleared, kept when a level change leaves it out.
    const swelled: CommandPayload = { type: 'set_sea', params: { level: -2, swell: { direction: 200, period: 10 } } };
    roundTrip(swelled);
    roundTrip({ type: 'set_sea', params: { level: -2, swell: null } }, [swelled]);
    roundTrip({ type: 'set_sea', params: { level: 4 } }, [swelled]);
    roundTrip({ type: 'set_sea', params: { level: null } }, [swelled]);
    const kept = createWorldState(emptyDoc());
    applyCommand(kept, swelled);
    applyCommand(kept, { type: 'set_sea', params: { level: 4 } });
    expect(kept.doc.environment.sea).toEqual({ level: 4, swell: { direction: 200, period: 10 }, params: {} });
    applyCommand(kept, { type: 'set_sea', params: { level: 4, swell: null } });
    expect(kept.doc.environment.sea).toEqual({ level: 4, params: {} });

    // The bed is really carved: the ground under the line sits at or below the water surface.
    const state = createWorldState(emptyDoc());
    applyCommand(state, river);
    const samples = riverProfile(
      state.terrain,
      [
        [0, 0],
        [30, 8],
      ],
      8,
    );
    for (const sample of samples) {
      expect(state.terrain.heightAt(sample.x, sample.z)).toBeLessThanOrEqual(sample.surface);
    }

    // Limits: a ninth river is refused.
    const many = createWorldState(emptyDoc());
    for (let i = 0; i < RIVER_LIMITS.maxPerPlace; i += 1) {
      applyCommand(many, {
        type: 'draw_river',
        params: {
          riverId: `riv-${i}`,
          points: [
            [i * 2, -40],
            [i * 2, 40],
          ],
        },
      });
    }
    expect(() =>
      applyCommand(many, {
        type: 'draw_river',
        params: {
          riverId: 'riv-too-many',
          points: [
            [-40, 0],
            [40, 0],
          ],
        },
      }),
    ).toThrow(CommandError);
  });

  it('roads and walls', () => {
    const road: CommandPayload = {
      type: 'draw_road',
      params: {
        roadId: 'r1',
        points: [
          [0, 0],
          [20, 5],
        ],
      },
    };
    roundTrip(road);
    roundTrip({ type: 'remove_road', params: { roadId: 'r1' } }, [road]);
    const wall: CommandPayload = {
      type: 'draw_wall',
      params: { wallId: 'w1', points: square(4), closed: true },
    };
    roundTrip(wall);
    roundTrip({ type: 'remove_wall', params: { wallId: 'w1' } }, [wall]);
  });

  it('never sculpts ground steeper than the style allows (P2-11)', () => {
    const state = createWorldState(emptyDoc());
    const spacing = state.terrain.spacing;
    const step = spacing * Math.tan((MAX_TERRAIN_SLOPE[state.doc.style.base] * Math.PI) / 180);
    // Raising a small square 20 times would make a 20 m pillar; the slope limit makes a hill.
    for (let i = 0; i < 20; i++)
      applyCommand(state, {
        type: 'sculpt_terrain',
        params: { area: square(10), operation: 'raise', strength: 1 },
      });
    let steepest = 0;
    for (let x = -12; x <= 12; x += spacing)
      for (let z = -12; z <= 12; z += spacing)
        steepest = Math.max(
          steepest,
          Math.abs(state.terrain.vertexHeight(x, z) - state.terrain.vertexHeight(x + spacing, z)),
          Math.abs(state.terrain.vertexHeight(x, z) - state.terrain.vertexHeight(x, z + spacing)),
        );
    expect(steepest).toBeLessThanOrEqual(step + 1e-4);
    expect(state.terrain.vertexHeight(0, 0)).toBeGreaterThan(step * 3);
    // Digging is held the same way.
    for (let i = 0; i < 20; i++)
      applyCommand(state, {
        type: 'sculpt_terrain',
        params: { area: square(4), operation: 'lower', strength: 1 },
      });
    expect(state.terrain.vertexHeight(0, 0) - state.terrain.vertexHeight(spacing * 3, 0)).toBeGreaterThan(
      -step * 3 - 1e-4,
    );
  });

  it('terrain sculpt and paint (including smooth, which is not mathematically reversible)', () => {
    roundTrip({ type: 'sculpt_terrain', params: { area: square(10), operation: 'raise', strength: 1 } });
    roundTrip({ type: 'sculpt_terrain', params: { area: square(12), operation: 'smooth', strength: 1 } }, [
      { type: 'sculpt_terrain', params: { area: square(4), operation: 'raise', strength: 1 } },
    ]);
    roundTrip({ type: 'paint_terrain', params: { area: square(6, 30, 30), soilId: 'snow' } });
  });
});

describe('validation', () => {
  it('rejects duplicates, missing targets, unknown soil, and out-of-bounds edits', () => {
    const state = createWorldState(emptyDoc());
    applyCommand(state, place);
    const code = (command: CommandPayload) => {
      try {
        applyCommand(state, command);
        return 'ok';
      } catch (error) {
        return (error as CommandError).code;
      }
    };
    expect(code(place)).toBe('duplicate');
    expect(code({ type: 'remove_item', params: { instanceId: 'nope' } })).toBe('not_found');
    expect(code({ type: 'paint_terrain', params: { area: square(3), soilId: 'lava' } })).toBe('invalid');
    expect(
      code({ type: 'place_item', params: { instanceId: 'far', itemId: 'x', position: [9999, 0, 0] } }),
    ).toBe('out_of_bounds');
    expect(code({ type: 'delete_everything', params: {} } as never)).toBe('invalid');
  });
});

describe('CommandHistory', () => {
  it('undoes and redoes in order and clears redo on a new edit', () => {
    const state = createWorldState(emptyDoc());
    const history = new CommandHistory(state);
    history.execute(place);
    history.execute({ type: 'set_sky', params: { preset: 'night' } });
    expect(state.doc.environment.sky.preset).toBe('night');

    history.undo();
    expect(state.doc.environment.sky.preset).toBe('day');
    history.undo();
    expect(state.doc.instances).toHaveLength(0);
    expect(history.canUndo).toBe(false);

    history.redo();
    expect(state.doc.instances).toHaveLength(1);
    history.execute({ type: 'set_weather', params: { preset: 'snow' } });
    expect(history.canRedo).toBe(false);
  });

  it('undo steps are commands that can be sent to the server', () => {
    const state = createWorldState(emptyDoc());
    const history = new CommandHistory(state);
    history.execute({ type: 'sculpt_terrain', params: { area: square(5), operation: 'raise', strength: 1 } });
    const undone = history.undo();
    expect(undone[0]?.applied.type).toBe('revert_terrain');
    expect(state.terrain.heightAt(0, 0)).toBe(0);
  });

  it('terrain undo keeps a later edit by someone else in the same chunk (P3-08 follow-up)', () => {
    const state = createWorldState(emptyDoc());
    const mine = applyCommand(state, {
      type: 'sculpt_terrain',
      params: { area: square(5), operation: 'raise', strength: 1 },
    });
    // Another builder, same chunk, a little to the side, then paints over part of my hill.
    applyCommand(state, {
      type: 'sculpt_terrain',
      params: { area: square(4, 20, 20), operation: 'raise', strength: 1 },
    });
    applyCommand(state, { type: 'paint_terrain', params: { area: square(3, 20, 20), soilId: 'snow' } });
    const theirs = state.terrain.heightAt(20, 20);
    expect(theirs).toBeGreaterThan(0);
    // Undo mine: my hill is gone, theirs stays.
    const undo = applyCommand(state, mine.inverse);
    expect(state.terrain.heightAt(0, 0)).toBe(0);
    expect(state.terrain.heightAt(20, 20)).toBe(theirs);
    // Redo through the inverse of the undo brings my hill back exactly.
    const hill = (() => {
      const probe = createWorldState(emptyDoc());
      applyCommand(probe, {
        type: 'sculpt_terrain',
        params: { area: square(5), operation: 'raise', strength: 1 },
      });
      return probe.terrain.heightAt(0, 0);
    })();
    applyCommand(state, undo.inverse);
    expect(state.terrain.heightAt(0, 0)).toBe(hill);
    expect(state.terrain.heightAt(20, 20)).toBe(theirs);
  });

  it('terrain undo on a point someone raised further keeps their extra height', () => {
    const state = createWorldState(emptyDoc());
    const mine = applyCommand(state, {
      type: 'sculpt_terrain',
      params: { area: square(6), operation: 'raise', strength: 1 },
    });
    const myHeight = state.terrain.heightAt(0, 0);
    applyCommand(state, {
      type: 'sculpt_terrain',
      params: { area: square(6), operation: 'raise', strength: 1 },
    });
    const extra = state.terrain.heightAt(0, 0) - myHeight;
    applyCommand(state, mine.inverse);
    expect(state.terrain.heightAt(0, 0)).toBeCloseTo(extra, 4);
  });
});

describe('roads', () => {
  const hill: CommandPayload = {
    type: 'sculpt_terrain',
    params: { area: square(30), operation: 'raise', strength: 1 },
  };
  const road: CommandPayload = {
    type: 'draw_road',
    params: {
      roadId: 'r1',
      points: [
        [-80, 0],
        [0, 2],
        [80, 0],
      ],
      width: 6,
    },
  };
  const snapshot = (state: ReturnType<typeof createWorldState>) =>
    JSON.stringify({ doc: state.doc, terrain: encodeTerrain(state) });

  it('grades a flat bed across the road width', () => {
    const state = createWorldState(emptyDoc());
    for (let i = 0; i < 4; i += 1) applyCommand(state, hill);
    const { changedChunks } = applyCommand(state, road);
    expect(changedChunks.size).toBeGreaterThan(0);
    for (const x of [-40, -10, 0, 25, 50]) {
      const center = state.terrain.heightAt(x, 1.5);
      expect(Math.abs(state.terrain.heightAt(x, 1.5 + 2.5) - center)).toBeLessThan(0.35);
      expect(Math.abs(state.terrain.heightAt(x, 1.5 - 2.5) - center)).toBeLessThan(0.35);
    }
  });

  it('undo restores the ground exactly and redo re-creates the same graded ground', () => {
    const state = createWorldState(emptyDoc());
    for (let i = 0; i < 4; i += 1) applyCommand(state, hill);
    const history = new CommandHistory(state);
    const before = snapshot(state);
    history.execute(road);
    const graded = snapshot(state);
    const undone = history.undo();
    expect(undone[0]?.applied.type).toBe('remove_road');
    expect(snapshot(state)).toBe(before);
    history.redo();
    expect(snapshot(state)).toBe(graded);
  });

  it('removing a road by hand keeps the graded ground and undo puts the road back', () => {
    roundTrip({ type: 'remove_road', params: { roadId: 'r1' } }, [hill, hill, road]);
  });

  it('rejects roads that are too long or have duplicate points', () => {
    const state = createWorldState(emptyDoc());
    const code = (points: Array<[number, number]>) => {
      try {
        applyCommand(state, { type: 'draw_road', params: { roadId: `r${points.length}`, points } });
        return 'ok';
      } catch (error) {
        return (error as CommandError).code;
      }
    };
    expect(
      code([
        [0, 0],
        [0.2, 0],
      ]),
    ).toBe('invalid');
    expect(
      code([
        [-240, -240],
        [240, 240],
        [-240, 240],
      ]),
    ).toBe('invalid');
  });
});

describe('walls, doors, and windows', () => {
  const wall: CommandPayload = {
    type: 'draw_wall',
    params: {
      wallId: 'w1',
      points: [
        [0, 0],
        [10, 0],
      ],
    },
  };
  const door: CommandPayload = {
    type: 'add_wall_opening',
    params: {
      wallId: 'w1',
      opening: { id: 'd1', kind: 'door', segment: 0, offset: 5, ...OPENING_PRESETS.door },
    },
  };

  it('openings apply and invert exactly', () => {
    roundTrip(door, [wall]);
    roundTrip({ type: 'remove_wall_opening', params: { wallId: 'w1', openingId: 'd1' } }, [wall, door]);
    roundTrip({ type: 'remove_wall', params: { wallId: 'w1' } }, [wall, door]);
  });

  it('rejects openings that do not fit', () => {
    const state = createWorldState(emptyDoc());
    applyCommand(state, wall);
    applyCommand(state, door);
    const code = (offset: number, segment = 0) => {
      try {
        applyCommand(state, {
          type: 'add_wall_opening',
          params: {
            wallId: 'w1',
            opening: {
              id: `o${offset}-${segment}`,
              kind: 'window',
              segment,
              offset,
              ...OPENING_PRESETS.window,
            },
          },
        });
        return 'ok';
      } catch (error) {
        return (error as CommandError).code;
      }
    };
    expect(code(5.5)).toBe('invalid'); // overlaps the door
    expect(code(0.3)).toBe('invalid'); // past the corner
    expect(code(5, 1)).toBe('invalid'); // no such segment
    expect(code(8)).toBe('ok');
  });

  it('a room needs three corners', () => {
    const state = createWorldState(emptyDoc());
    expect(() =>
      applyCommand(state, {
        type: 'draw_wall',
        params: {
          wallId: 'w2',
          points: [
            [0, 0],
            [5, 0],
          ],
          closed: true,
        },
      }),
    ).toThrow(CommandError);
  });

  it('splits a wall into solid boxes around a door and a window', () => {
    const state = createWorldState(emptyDoc());
    applyCommand(state, wall);
    applyCommand(state, door);
    const flat = () => 0;
    const w = state.doc.walls[0]!;
    // Left, footing under the door, above the door, right.
    expect(wallBoxes(w, flat)).toHaveLength(4);
    applyCommand(state, {
      type: 'add_wall_opening',
      params: {
        wallId: 'w1',
        opening: { id: 'win', kind: 'window', segment: 0, offset: 8, ...OPENING_PRESETS.window },
      },
    });
    const boxes = wallBoxes(state.doc.walls[0]!, flat);
    // Left, door footing + top, middle, window sill + top, right.
    expect(boxes).toHaveLength(7);
    // Every box stays within the wall height (3 m) and the footing.
    for (const box of boxes) {
      expect(box.center[1] + box.half[1]).toBeLessThanOrEqual(3 + 1e-9);
      expect(box.center[1] - box.half[1]).toBeGreaterThanOrEqual(-0.5 - 1e-9);
    }
  });

  it('a room flattens the ground under it so the floor meets the ground at the door', () => {
    const state = createWorldState(emptyDoc());
    const bump: CommandPayload = {
      type: 'sculpt_terrain',
      params: { area: square(3, 5, 8), operation: 'raise', strength: 1 },
    };
    applyCommand(state, bump);
    applyCommand(state, bump);
    const history = new CommandHistory(state);
    const before = JSON.stringify(encodeTerrain(state));
    history.execute({ type: 'draw_wall', params: { wallId: 'room', points: square(5, 5, 5), closed: true } });
    const heightAt = (x: number, z: number) => state.terrain.heightAt(x, z);
    const level = roomFloorLevel(state.doc.walls[0]!, heightAt)!;
    // Inside is flat, and the ground just outside the walls is at the same height.
    for (const [x, z] of [
      [2, 2],
      [8, 8],
      [5, -1.2],
      [11.2, 5],
    ] as const) {
      expect(Math.abs(heightAt(x, z) + 0.05 - level)).toBeLessThan(0.01);
    }
    const graded = JSON.stringify(encodeTerrain(state));
    history.undo();
    expect(JSON.stringify(encodeTerrain(state))).toBe(before);
    history.redo();
    expect(JSON.stringify(encodeTerrain(state))).toBe(graded);
  });

  it('removing a room by hand keeps the ground and undo puts the room back', () => {
    roundTrip({ type: 'remove_wall', params: { wallId: 'room' } }, [
      { type: 'sculpt_terrain', params: { area: square(3, 5, 8), operation: 'raise', strength: 1 } },
      { type: 'draw_wall', params: { wallId: 'room', points: square(5, 5, 5), closed: true } },
    ]);
  });
});

describe('history groups', () => {
  it('undoes and redoes a whole group (one brush drag) as one step', () => {
    const state = createWorldState(emptyDoc());
    const history = new CommandHistory(state);
    history.beginGroup();
    for (let i = 0; i < 3; i += 1)
      history.execute({
        type: 'sculpt_terrain',
        params: { area: square(4, i * 3, 0), operation: 'raise', strength: 1 },
      });
    history.endGroup();
    const raised = JSON.stringify(encodeTerrain(state));
    const undone = history.undo();
    expect(undone).toHaveLength(3);
    expect(encodeTerrain(state)).toEqual([]);
    expect(history.canUndo).toBe(false);
    history.redo();
    expect(JSON.stringify(encodeTerrain(state))).toBe(raised);
  });

  it('says whether a group is open (P2-43)', () => {
    const history = new CommandHistory(createWorldState(emptyDoc()));
    expect(history.grouping).toBe(false);
    history.beginGroup();
    expect(history.grouping).toBe(true);
    history.endGroup();
    expect(history.grouping).toBe(false);
  });

  it('takes back the newest commands of the open group, leaving the rest of it (P2-43)', () => {
    const state = createWorldState(emptyDoc());
    const history = new CommandHistory(state);
    history.beginGroup();
    history.execute(place);
    const placed = JSON.stringify(state.doc);
    history.execute({ type: 'sculpt_terrain', params: { area: square(4), operation: 'raise', strength: 1 } });
    history.execute({ type: 'set_sky', params: { preset: 'night' } });
    history.discardFromGroup(2);
    expect(JSON.stringify(state.doc)).toBe(placed);
    expect(encodeTerrain(state)).toEqual([]);
    history.endGroup();
    expect(history.undo()).toHaveLength(1);
    expect(state.doc.instances).toHaveLength(0);
  });
});

describe('soft brush', () => {
  it('is strongest in the middle and fades out at the edge', () => {
    const state = createWorldState(emptyDoc());
    applyCommand(state, {
      type: 'sculpt_terrain',
      params: { area: circleArea(0, 0, 8), operation: 'raise', strength: 1, soft: true },
    });
    const middle = state.terrain.heightAt(0, 0);
    const edge = state.terrain.heightAt(6, 0);
    expect(middle).toBeGreaterThan(0.9);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(middle / 2);
  });
});

describe('water fill', () => {
  it('fills a hole up to its rim, and finds no basin on flat ground', () => {
    const state = createWorldState(emptyDoc());
    expect(planWaterFill(state.terrain, 0, 0)).toBeNull();
    for (let i = 0; i < 2; i += 1)
      applyCommand(state, {
        type: 'sculpt_terrain',
        params: { area: circleArea(0, 0, 8), operation: 'lower', strength: 1, soft: true },
      });
    const fill = planWaterFill(state.terrain, 0, 0);
    expect(fill).not.toBeNull();
    // The rim is the untouched ground at height 0.
    expect(fill!.level).toBeLessThan(0);
    expect(fill!.level).toBeGreaterThan(-0.2);
    const xs = fill!.area.map(([x]) => x);
    expect(Math.max(...xs)).toBeLessThanOrEqual(10);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-10);
  });
});

describe('bridges', () => {
  it('a road over a lake becomes a bridge above the water and leaves the lake bed alone', () => {
    const state = createWorldState(emptyDoc());
    for (let i = 0; i < 3; i += 1)
      applyCommand(state, {
        type: 'sculpt_terrain',
        params: { area: circleArea(0, 0, 12), operation: 'lower', strength: 1, soft: true },
      });
    const fill = planWaterFill(state.terrain, 0, 0)!;
    applyCommand(state, {
      type: 'add_water',
      params: { id: 'lake', kind: 'lake', area: fill.area, level: fill.level, params: {} },
    });
    const bedBefore = state.terrain.heightAt(0, 0);
    const road: Array<[number, number]> = [
      [-40, 0],
      [40, 0],
    ];
    const samples = roadProfile(state.terrain, road, state.doc.environment.water);
    const middle = samples.reduce((a, b) => (Math.abs(b.x) < Math.abs(a.x) ? b : a));
    expect(middle.bridge).toBe(true);
    expect(middle.height).toBeGreaterThan(fill.level + 1);
    expect(samples[0]!.bridge).toBe(false);

    applyCommand(state, { type: 'draw_road', params: { roadId: 'r', points: road, width: 6 } });
    expect(state.terrain.heightAt(0, 0)).toBeCloseTo(bedBefore);
  });
});

describe('road ends', () => {
  it('meet the natural ground (no dip where a road starts next to low ground)', () => {
    const state = createWorldState(emptyDoc());
    for (let i = 0; i < 3; i += 1)
      applyCommand(state, {
        type: 'sculpt_terrain',
        params: { area: circleArea(0, 20, 10), operation: 'lower', strength: 1, soft: true },
      });
    const samples = roadProfile(state.terrain, [
      [0, 2],
      [0, 40],
    ]);
    expect(Math.abs(samples[0]!.height - state.terrain.heightAt(0, 2))).toBeLessThan(0.01);
  });
});

it('does not store the rest flag on the item (P2-43)', () => {
  const state = createWorldState(emptyDoc());
  applyCommand(state, {
    type: 'place_item',
    params: { instanceId: 'a', itemId: 'genvr.core.oak-tree', position: [1, 0, 1], rest: true },
  });
  expect(JSON.stringify(state.doc.instances[0])).not.toContain('rest');
});

describe('Replica (co-building)', () => {
  const tree = (id: string, x: number): CommandPayload => ({
    type: 'place_item',
    params: { instanceId: id, itemId: 'genvr.core.tree.round', position: [x, 0, 0] },
  });
  const hill = (x: number): CommandPayload => ({
    type: 'sculpt_terrain',
    params: { area: square(6, x, 0), operation: 'raise', strength: 1 },
  });
  const flatten = (x: number): CommandPayload => ({
    type: 'sculpt_terrain',
    params: { area: square(6, x, 0), operation: 'flatten', strength: 1, targetHeight: 0 },
  });
  const snapshot = (state: ReturnType<typeof createWorldState>) =>
    JSON.stringify({ doc: state.doc, terrain: encodeTerrain(state) });

  /** Runs the server order on a fresh world (what every client must end up with). */
  const serverOrder = (commands: CommandPayload[]) => {
    const state = createWorldState(emptyDoc());
    for (const command of commands) applyCommand(state, command);
    return snapshot(state);
  };

  it('ends with the server order when commands from others interleave with ours', () => {
    const client = createWorldState(emptyDoc());
    const replica = new Replica(client);
    // We raise a hill and place a tree (not confirmed yet)...
    for (const [id, command] of [
      ['a', hill(0)],
      ['b', tree('t-mine', 20)],
    ] as const) {
      const { inverse } = applyCommand(client, command);
      replica.track(id, command, inverse);
    }
    // ...while the server had already applied someone's flatten on the same spot first.
    const remote = replica.applyRemote(flatten(2));
    expect(remote.dropped).toEqual([]);
    replica.confirm('a');
    replica.confirm('b');
    expect(replica.pending).toHaveLength(0);
    expect(snapshot(client)).toBe(serverOrder([flatten(2), hill(0), tree('t-mine', 20)]));
  });

  it('drops a local command that no longer fits (someone removed what we moved)', () => {
    const client = createWorldState(emptyDoc());
    applyCommand(client, tree('shared', 5));
    const replica = new Replica(client);
    const move: CommandPayload = {
      type: 'transform_item',
      params: { instanceId: 'shared', position: [9, 0, 9] },
    };
    replica.track('m', move, applyCommand(client, move).inverse);
    const result = replica.applyRemote({ type: 'remove_item', params: { instanceId: 'shared' } });
    expect(result.dropped).toEqual(['m']);
    expect(client.doc.instances).toHaveLength(0);
  });

  it('takes out a command the server refused, keeping later ones', () => {
    const client = createWorldState(emptyDoc());
    const replica = new Replica(client);
    for (const [id, command] of [
      ['x', tree('one', 1)],
      ['y', tree('two', 2)],
    ] as const)
      replica.track(id, command, applyCommand(client, command).inverse);
    replica.reject('x');
    expect(client.doc.instances.map((i) => i.instanceId)).toEqual(['two']);
    expect(replica.pending.map((p) => p.id)).toEqual(['y']);
  });

  it('flags a resync when a server command does not apply locally', () => {
    const replica = new Replica(createWorldState(emptyDoc()));
    expect(replica.applyRemote({ type: 'remove_item', params: { instanceId: 'ghost' } }).resync).toBe(true);
  });
});

describe('undo marks', () => {
  it('merges the steps since a mark into one undo step', () => {
    const state = createWorldState(
      WorldDocument.parse({
        schemaVersion: 1,
        experienceId: 'exp-test',
        version: 0,
        style: { base: 'blocky' },
        sizeTier: 'small',
        access: { mode: 'private' },
        environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
        terrain: {},
        spawn: { position: [0, 1, 0] },
      }),
    );
    const history = new CommandHistory(state);
    history.execute({ type: 'set_sky', params: { preset: 'night' } });
    const mark = history.size;
    history.execute({ type: 'set_weather', params: { preset: 'rain' } });
    history.execute({ type: 'set_sky', params: { preset: 'sunset' } });
    expect(history.mergeSince(mark)).toBe(true);
    expect(history.size).toBe(2);
    history.undo();
    expect(state.doc.environment.sky.preset).toBe('night');
    expect(state.doc.environment.weather.preset).toBe('clear');
    history.redo();
    expect(state.doc.environment.sky.preset).toBe('sunset');
    expect(state.doc.environment.weather.preset).toBe('rain');
  });
});

describe('set_story', () => {
  const story = {
    title: 'Island',
    stops: [
      {
        camera: { position: [0, 8, 60] as [number, number, number], target: [0, 2, 0] as [number, number, number], ease: 'in_out' as const },
        title: 'Shore',
        side: 'left' as const,
      },
      {
        camera: { position: [20, 30, 0] as [number, number, number], target: [0, 10, 0] as [number, number, number], fov: 50, ease: 'linear' as const },
        title: 'Hill',
        text: 'Up high.',
        side: 'right' as const,
      },
    ],
  };
  it('sets, changes and removes the story, each undone exactly', () => {
    roundTrip({ type: 'set_story', params: { story } });
    roundTrip({ type: 'set_story', params: { story: { ...story, title: 'Other' } } }, [{ type: 'set_story', params: { story } }]);
    roundTrip({ type: 'set_story', params: { story: null } }, [{ type: 'set_story', params: { story } }]);
  });
});

describe('set_game', () => {
  it('sets, changes and removes the game with exact inverses', () => {
    // A neutral game from generic components.
    const game: Game = {
      match: { minPlayers: 2, durationSec: 300, countdownSec: 5, resultsSec: 10 },
      health: { max: 100 },
      score: { from: 'kills' },
      win: { by: 'highest_score' },
    };
    roundTrip({ type: 'set_game', params: { game } });
    roundTrip(
      { type: 'set_game', params: { game: { ...game, match: { ...game.match, durationSec: 180 } } } },
      [{ type: 'set_game', params: { game } }],
    );
    roundTrip({ type: 'set_game', params: { game: null } }, [{ type: 'set_game', params: { game } }]);
  });
});
