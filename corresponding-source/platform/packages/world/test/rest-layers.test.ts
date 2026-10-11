import { WorldDocument, type CommandPayload } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { applyCommand, CommandHistory, createWorldState, nearRoad, restLayers } from '../src/index.js';

const emptyDoc = () =>
  WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'exp-layers',
    version: 0,
    style: { base: 'realistic' },
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

describe('rest layers: floors, decks and water from the place as it is now (P2-43 final review)', () => {
  it('gives a new river its water at once', () => {
    const state = createWorldState(emptyDoc());
    expect(restLayers(state).waterAt(15, 4)).toBeNull();
    applyCommand(state, {
      type: 'draw_river',
      params: {
        riverId: 'riv',
        points: [
          [0, 0],
          [30, 8],
        ],
        width: 8,
      },
    });
    expect(restLayers(state).waterAt(15, 4)).not.toBeNull();
  });

  it('follows the ground under a bridge: raised ground there is no longer bridged', () => {
    const state = createWorldState(emptyDoc());
    const commands: CommandPayload[] = [
      {
        type: 'sculpt_terrain',
        params: { area: square(6), operation: 'flatten', strength: 1, targetHeight: -2 },
      },
      { type: 'add_water', params: { id: 'lake', kind: 'lake', area: square(6), level: 0, params: {} } },
      {
        type: 'draw_road',
        params: {
          roadId: 'r',
          points: [
            [-30, 0],
            [30, 0],
          ],
          width: 6,
          grade: false,
        },
      },
    ];
    for (const command of commands) applyCommand(state, command);
    const overLake = (decks: ReturnType<typeof restLayers>['decks']) =>
      decks.filter((deck) => deck.points.some(([x]) => Math.abs(x) < 1));
    expect(overLake(restLayers(state).decks).length).toBeGreaterThan(0);
    applyCommand(state, {
      type: 'sculpt_terrain',
      params: { area: square(8), operation: 'flatten', strength: 1, targetHeight: 3 },
    });
    expect(overLake(restLayers(state).decks)).toEqual([]);
  });

  it('knows the ground beside a road, the same for the studio and the server', () => {
    const roads = [
      {
        points: [
          [0, 0],
          [20, 0],
        ] as Array<[number, number]>,
        width: 4,
      },
    ];
    expect(nearRoad(roads, 10, 2.4)).toBe(true);
    expect(nearRoad(roads, 10, 2.6)).toBe(false);
    expect(nearRoad([], 10, 0)).toBe(false);
  });
});

describe('history group numbers (P2-43 final review)', () => {
  it('counts every group begun, so one open group is told from the next', () => {
    const history = new CommandHistory(createWorldState(emptyDoc()));
    const first = history.groupNumber;
    history.beginGroup();
    const open = history.groupNumber;
    expect(open).toBe(first + 1);
    history.endGroup();
    expect(history.groupNumber).toBe(open);
    history.beginGroup();
    expect(history.groupNumber).toBe(open + 1);
  });
});
