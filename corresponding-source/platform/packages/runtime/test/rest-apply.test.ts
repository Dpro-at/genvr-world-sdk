import { WorldDocument, type CommandPayload } from '@genvr/contracts';
import { restingPoint, SurfaceIndex, type RestShape } from '@genvr/validator';
import { CommandError, CommandHistory, createWorldState, encodeTerrain, restLayers } from '@genvr/world';
import { describe, expect, it, vi } from 'vitest';
import { applyWithRest, beginRestGroup, endRestGroup, type RestContext } from '../src/rest-apply.js';

const shapes: Record<string, RestShape> = {
  table: { min: [-1, 0, -0.5], max: [1, 0.8, 0.5], rule: { mode: 'upright', sink: 0.05 } },
  lamp: { min: [-0.1, 0, -0.1], max: [0.1, 0.5, 0.1], rule: { mode: 'upright', sink: 0.05 } },
  // Pivot in the middle, so scale changes how far above the ground the pivot sits.
  crate: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5], rule: { mode: 'upright', sink: 0.05 } },
  house: { min: [-2, 0, -2], max: [2, 3, 2], rule: { mode: 'grade' } },
};

function setup() {
  const state = createWorldState(
    WorldDocument.parse({
      schemaVersion: 1,
      experienceId: 'x',
      version: 0,
      style: { base: 'realistic' },
      sizeTier: 'small',
      access: { mode: 'private' },
      environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
      terrain: {},
      spawn: { position: [50, 1, 50] },
      instances: [],
    }),
  );
  const history = new CommandHistory(state);
  let surfaces: SurfaceIndex | null = null;
  const invalidate = vi.fn(() => {
    surfaces = null;
  });
  const context: RestContext = {
    shapeOf: (id: string) => shapes[id] ?? null,
    surfaces: () =>
      (surfaces ??= new SurfaceIndex(state.doc, {
        groundAt: (x, z) => state.terrain.heightAt(x, z),
        ...restLayers(state),
        itemShape: (id) => {
          const shape = shapes[id];
          return shape
            ? {
                min: shape.min as [number, number, number],
                max: shape.max as [number, number, number],
                solid: true,
                part: false,
              }
            : null;
        },
      })),
    invalidate,
    layers: () => restLayers(state),
  };
  const y = (id: string) => state.doc.instances.find((i) => i.instanceId === id)!.transform.position[1];
  return { state, history, context, invalidate, y };
}

const square = (cx: number, cz: number, half: number): Array<[number, number]> => [
  [cx - half, cz - half],
  [cx + half, cz - half],
  [cx + half, cz + half],
  [cx - half, cz + half],
];
const raise = (cx: number, cz: number, half: number): CommandPayload => ({
  type: 'sculpt_terrain',
  params: { area: square(cx, cz, half), operation: 'raise', strength: 1 },
});
const placeRest = (instanceId: string, itemId: string, x: number, z: number, extra = {}): CommandPayload => ({
  type: 'place_item',
  params: { instanceId, itemId, position: [x, 7, z], rest: true, ...extra },
});

describe('every edit goes through the rest law (P2-43)', () => {
  it('rests a placed item and the lamp on it follows a sculpt, undone in one step', () => {
    const { state, history, context, y } = setup();
    applyWithRest(history, state, context, placeRest('t', 'table', 100, 100));
    applyWithRest(history, state, context, placeRest('l', 'lamp', 100, 100));
    expect(y('t')).toBeCloseTo(0, 3);
    expect(y('l')).toBeCloseTo(0.8, 3);
    const steps = applyWithRest(history, state, context, raise(100, 100, 10));
    expect(steps.length).toBeGreaterThanOrEqual(3);
    const raised = state.terrain.heightAt(100, 100);
    expect(raised).toBeGreaterThan(0);
    expect(y('t')).toBeCloseTo(raised, 1);
    expect(y('l')).toBeCloseTo(y('t') + 0.8, 3);
    history.undo();
    expect(y('t')).toBeCloseTo(0, 3);
    expect(y('l')).toBeCloseTo(0.8, 3);
  });

  it('strips the rest flag from what it applies', () => {
    const { state, history, context } = setup();
    const [step] = applyWithRest(history, state, context, placeRest('t', 'table', 100, 100));
    expect(step!.applied.type).toBe('place_item');
    expect('rest' in step!.applied.params).toBe(false);
  });

  it('never ends a group the caller opened: one undo takes both edits and their chains', () => {
    const { state, history, context, y } = setup();
    applyWithRest(history, state, context, placeRest('t', 'table', 100, 100));
    applyWithRest(history, state, context, placeRest('l', 'lamp', 100, 100));
    history.beginGroup();
    applyWithRest(history, state, context, raise(100, 100, 10));
    expect(history.grouping).toBe(true);
    applyWithRest(history, state, context, raise(100, 100, 10));
    expect(history.grouping).toBe(true);
    history.endGroup();
    expect(y('t')).toBeGreaterThan(1);
    expect(y('l')).toBeCloseTo(y('t') + 0.8, 3);
    history.undo();
    expect(y('t')).toBeCloseTo(0, 3);
    expect(y('l')).toBeCloseTo(0.8, 3);
    expect(encodeTerrain(state)).toEqual([]);
    // The two placements are still there, each its own step.
    expect(history.size).toBe(2);
  });

  it('rests with the scale a place or move command gives', () => {
    const { state, history, context, y } = setup();
    applyWithRest(history, state, context, placeRest('c', 'crate', 100, 100, { scale: [1, 2, 1] }));
    expect(y('c')).toBeCloseTo(1, 3);
    applyWithRest(history, state, context, {
      type: 'transform_item',
      params: { instanceId: 'c', scale: [1, 3, 1], rest: true },
    });
    expect(y('c')).toBeCloseTo(1.5, 3);
  });

  it('grades the ground before placing a graded building on it, all one undo step', () => {
    const { state, history, context, y } = setup();
    applyWithRest(history, state, context, raise(98, 100, 2));
    const before = JSON.stringify(encodeTerrain(state));
    const steps = applyWithRest(history, state, context, placeRest('h', 'house', 100, 100));
    expect(steps.map((step) => step.applied.type)).toEqual([
      'sculpt_terrain',
      'sculpt_terrain',
      'place_item',
    ]);
    // Level ground under the base, and the house's y is that level.
    const corners = square(100, 100, 2).map(([x, z]) => state.terrain.heightAt(x, z));
    for (const height of corners) expect(height).toBeCloseTo(state.terrain.heightAt(100, 100), 2);
    expect(y('h')).toBeCloseTo(state.terrain.heightAt(100, 100), 2);
    history.undo();
    expect(state.doc.instances).toHaveLength(0);
    expect(JSON.stringify(encodeTerrain(state))).toBe(before);
  });

  it('rests again what stood where the grade blends into the ground', () => {
    const { state, history, context, y } = setup();
    applyWithRest(history, state, context, raise(98, 100, 2));
    // Beside the base, inside the blend ring, on the raised ground.
    applyWithRest(history, state, context, placeRest('l', 'lamp', 97.2, 100));
    const before = y('l');
    applyWithRest(history, state, context, placeRest('h', 'house', 100, 100));
    expect(state.terrain.heightAt(97.2, 100)).not.toBeCloseTo(before, 2);
    expect(y('l')).toBeCloseTo(state.terrain.heightAt(97.2, 100), 1);
  });

  it('takes the grade back when the building itself is refused', () => {
    const { state, history, context } = setup();
    applyWithRest(history, state, context, placeRest('h', 'house', 50, 50));
    applyWithRest(history, state, context, raise(98, 100, 2));
    const before = JSON.stringify(encodeTerrain(state));
    const size = history.size;
    expect(() => applyWithRest(history, state, context, placeRest('h', 'house', 100, 100))).toThrow(
      CommandError,
    );
    expect(JSON.stringify(encodeTerrain(state))).toBe(before);
    expect(history.size).toBe(size);
  });

  it('asks for a new surface index after a change to walls, roads, water or style', () => {
    const { state, history, context, invalidate } = setup();
    applyWithRest(history, state, context, raise(100, 100, 4));
    expect(invalidate).not.toHaveBeenCalled();
    applyWithRest(history, state, context, {
      type: 'draw_wall',
      params: { wallId: 'room', points: square(100, 100, 5), closed: true },
    });
    expect(invalidate).toHaveBeenCalled();
  });

  it("the host's resting hint stays on the ground under a solid box top", () => {
    // The host's `restingPoint` (no `on`) asks the validator exactly like this: ground, room floors
    // and stacked parts only, so the hint under a house or a tree is the ground, not its roof.
    const { state, history, context } = setup();
    applyWithRest(history, state, context, placeRest('h', 'house', 100, 100));
    applyWithRest(history, state, context, placeRest('t', 'table', 110, 100));
    const hint = (x: number, z: number) =>
      restingPoint(
        state.doc,
        {
          groundAt: (px, pz) => state.terrain.heightAt(px, pz),
          itemShape: (id) => {
            const shape = shapes[id];
            return shape
              ? {
                  min: shape.min as [number, number, number],
                  max: shape.max as [number, number, number],
                  solid: true,
                  part: false,
                }
              : null;
          },
          floors: [],
        },
        x,
        z,
      );
    expect(context.surfaces().below(100, 100, Infinity)).toBeCloseTo(3, 3);
    expect(hint(100, 100)).toEqual([100, state.terrain.heightAt(100, 100), 100]);
    expect(hint(110, 100)).toEqual([110, 0, 100]);
  });
});

const move = (instanceId: string, x: number, y: number, z: number): CommandPayload => ({
  type: 'transform_item',
  params: { instanceId, position: [x, y, z], rest: true },
});
const flatten = (area: Array<[number, number]>, targetHeight: number): CommandPayload => ({
  type: 'sculpt_terrain',
  params: { area, operation: 'flatten', strength: 1, targetHeight },
});
const xOf = (state: ReturnType<typeof setup>['state'], id: string) =>
  state.doc.instances.find((i) => i.instanceId === id)!.transform.position[0];

describe('a drag grades once, where it is dropped (P2-43 final review, I1)', () => {
  it('rests a dragged building without grading, grades at the drop, and undoes it all at once', () => {
    const { state, history, context, y } = setup();
    // A slope of half-metre steps from x = 80 to x = 125.
    for (let i = 0; i < 9; i += 1)
      applyWithRest(
        history,
        state,
        context,
        flatten(
          [
            [80 + i * 5, 80],
            [85 + i * 5, 80],
            [85 + i * 5, 120],
            [80 + i * 5, 120],
          ],
          i * 0.5,
        ),
      );
    applyWithRest(history, state, context, placeRest('h', 'house', 90, 100));
    const terrainBefore = JSON.stringify(encodeTerrain(state));
    const groundBefore = [97, 99, 101, 103].map((gx) => state.terrain.heightAt(gx, 100));

    history.beginGroup();
    const dragged = [];
    for (let at = 92; at <= 110; at += 2)
      dragged.push(...applyWithRest(history, state, context, move('h', at, 9, 100)));
    // No ground was touched while dragging: the house rests on the ground as it is.
    expect(dragged.filter((step) => step.applied.type === 'sculpt_terrain')).toEqual([]);
    expect(JSON.stringify(encodeTerrain(state))).toBe(terrainBefore);
    const dropped = endRestGroup(history, state, context);
    expect(history.grouping).toBe(false);
    expect(dropped.filter((step) => step.applied.type === 'sculpt_terrain')).toHaveLength(2);

    // The ground the house only passed over is as it was; under the drop spot it is level.
    expect([97, 99, 101, 103].map((gx) => state.terrain.heightAt(gx, 100))).toEqual(groundBefore);
    const corners = square(110, 100, 2).map(([cx, cz]) => state.terrain.heightAt(cx, cz));
    for (const height of corners) expect(height).toBeCloseTo(state.terrain.heightAt(110, 100), 2);
    expect(y('h')).toBeCloseTo(state.terrain.heightAt(110, 100), 2);

    history.undo();
    expect(JSON.stringify(encodeTerrain(state))).toBe(terrainBefore);
    expect(xOf(state, 'h')).toBe(90);
  });
});

describe('things on a moved thing move with it (P2-43 final review, I5)', () => {
  /** A table with a lamp on it at x = 100, and raised ground (1 m) around x = 105. */
  function tableWithLamp() {
    const world = setup();
    const { state, history, context } = world;
    applyWithRest(history, state, context, flatten(square(105, 100, 2.5), 1));
    applyWithRest(history, state, context, placeRest('t', 'table', 100, 100));
    applyWithRest(history, state, context, placeRest('l', 'lamp', 100, 100));
    expect(world.y('l')).toBeCloseTo(0.8, 3);
    return world;
  }

  it('carries the lamp when the table is moved on its own, onto higher ground too', () => {
    const { state, history, context, y } = tableWithLamp();
    applyWithRest(history, state, context, move('t', 105, 0, 100));
    expect(y('t')).toBeCloseTo(1, 3);
    expect(xOf(state, 'l')).toBeCloseTo(105, 6);
    expect(y('l')).toBeCloseTo(1.8, 3);
    history.undo();
    expect(xOf(state, 'l')).toBe(100);
    expect(y('l')).toBeCloseTo(0.8, 3);
  });

  it('carries the lamp through every step of a drag of the table alone, and back', () => {
    const { state, history, context, y } = tableWithLamp();
    history.beginGroup();
    for (const at of [101, 102, 103, 104, 105, 103, 100])
      applyWithRest(history, state, context, move('t', at, 0, 100));
    endRestGroup(history, state, context);
    expect(xOf(state, 'l')).toBeCloseTo(100, 6);
    expect(y('l')).toBeCloseTo(0.8, 3);
    expect(y('t')).toBeCloseTo(0, 3);
  });

  it.each([
    ['table first', ['t', 'l']],
    ['lamp first', ['l', 't']],
  ])('keeps the lamp on the table when both move together (%s)', (_name, order) => {
    const { state, history, context, y } = tableWithLamp();
    history.beginGroup();
    // Like the move handle: every tick sends each selected item's start position plus the offset.
    for (const by of [2, 5])
      for (const id of order)
        applyWithRest(history, state, context, move(id!, 100 + by, id === 'l' ? 0.8 : 0, 100));
    endRestGroup(history, state, context);
    expect(xOf(state, 't')).toBeCloseTo(105, 6);
    expect(xOf(state, 'l')).toBeCloseTo(105, 6);
    expect(y('t')).toBeCloseTo(1, 3);
    expect(y('l')).toBeCloseTo(1.8, 3);
  });
});

describe('fresh water, floors and decks after the ground changes (P2-43 final review, I6)', () => {
  it('rests a crate on a river drawn a moment ago', () => {
    const { state, history, context, y } = setup();
    applyWithRest(history, state, context, {
      type: 'draw_river',
      params: {
        riverId: 'riv',
        points: [
          [80, 100],
          [120, 104],
        ],
        width: 8,
      },
    });
    applyWithRest(history, state, context, placeRest('c', 'crate', 100, 102));
    const water = restLayers(state).waterAt(100, 102)!;
    expect(water).not.toBeNull();
    expect(y('c') - 0.5).toBeCloseTo(Math.max(water, state.terrain.heightAt(100, 102)), 1);
  });

  it('drops a crate off a bridge deck that the ground under it took away', () => {
    const { state, history, context, y } = setup();
    applyWithRest(history, state, context, flatten(square(100, 100, 6), -2));
    applyWithRest(history, state, context, {
      type: 'add_water',
      params: { id: 'lake', kind: 'lake', area: square(100, 100, 6), level: 0, params: {} },
    });
    applyWithRest(history, state, context, {
      type: 'draw_road',
      params: {
        roadId: 'r',
        points: [
          [70, 100],
          [130, 100],
        ],
        width: 6,
        grade: false,
      },
    });
    applyWithRest(history, state, context, placeRest('c', 'crate', 100, 100));
    const deck = y('c') - 0.5;
    expect(deck).toBeGreaterThan(0.9);
    // The lake bed rises above the water: no bridge is needed there any more.
    applyWithRest(history, state, context, flatten(square(100, 100, 8), 0.5));
    expect(y('c') - 0.5).toBeCloseTo(0.5, 2);
  });
});

describe('a sculpt stroke beside a house grades it once, at the end (P2-43 final review)', () => {
  it('rests the house on the stroke as it goes and levels its ground once when the stroke ends', () => {
    const { state, history, context, y } = setup();
    applyWithRest(history, state, context, placeRest('h', 'house', 100, 100));
    history.beginGroup();
    const stroke: ReturnType<typeof applyWithRest> = [];
    for (let tick = 0; tick < 6; tick += 1)
      stroke.push(...applyWithRest(history, state, context, raise(101 + tick * 0.5, 100, 3)));
    const sculpts = (steps: typeof stroke) => steps.filter((step) => step.applied.type === 'sculpt_terrain');
    // Only the brush's own six ticks: the house never levelled its ground in between.
    expect(sculpts(stroke)).toHaveLength(6);
    const ended = endRestGroup(history, state, context);
    expect(sculpts(ended)).toHaveLength(2);
    const corners = square(100, 100, 2).map(([cx, cz]) => state.terrain.heightAt(cx, cz));
    for (const height of corners) expect(height).toBeCloseTo(state.terrain.heightAt(100, 100), 2);
    expect(y('h')).toBeCloseTo(state.terrain.heightAt(100, 100), 2);
    // A smooth blend ring: from the base edge outward the ground never jumps more than the step it
    // would take anyway (no plateau stacked by repeated soft flattens).
    const ring = [102.5, 103.5, 104.5, 105.5].map((gx) => state.terrain.heightAt(gx, 100));
    for (let i = 1; i < ring.length; i += 1) expect(Math.abs(ring[i]! - ring[i - 1]!)).toBeLessThan(1.5);
  });

  it('grades what a drag left pending before a new group begins', () => {
    const { state, history, context } = setup();
    applyWithRest(history, state, context, placeRest('h', 'house', 90, 100));
    applyWithRest(history, state, context, raise(110, 100, 4));
    history.beginGroup();
    applyWithRest(history, state, context, move('h', 110, 9, 100));
    const flushed = beginRestGroup(history, state, context);
    expect(flushed.filter((step) => step.applied.type === 'sculpt_terrain')).toHaveLength(2);
    expect(history.grouping).toBe(true);
    const corners = square(110, 100, 2).map(([cx, cz]) => state.terrain.heightAt(cx, cz));
    for (const height of corners) expect(height).toBeCloseTo(state.terrain.heightAt(110, 100), 2);
    endRestGroup(history, state, context);
  });
});
