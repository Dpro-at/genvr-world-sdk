import {
  SIZE_TIERS,
  WorldDocument,
  type CommandPayload,
  type SizeTier,
  type Style,
  type WorldSeed,
} from '@genvr/contracts';
import { spawnRing, type Footprint } from './scatter.js';
import { applyCommand, createWorldState } from './apply.js';
import type { TerrainData } from './terrain-data.js';
import { circleArea, planWaterFill } from './water.js';
import { CLEARING_RADIUS, ISLAND_SEA_LEVEL } from './world-generator.js';

type Point = [number, number];

/**
 * Giving a place a starter world, as commands (P2-40 task 4).
 *
 * Every caller builds the same world this way — the create flow, the World tab and the assistant —
 * so none of them can forget the spawn items, the water (task 7) or invent a different clearing. It is a batch rather
 * than one big command on purpose: each piece keeps its own exact inverse, which is the rule every
 * command in this package follows, and `applyBatch` is what makes the lot one undo step.
 */
export function starterWorldCommands(
  doc: Pick<WorldDocument, 'instances' | 'sizeTier' | 'environment' | 'terrain' | 'style'>,
  world: WorldSeed,
  /**
   * Ground height after the world is given. Callers with no stored chunks can pass
   * `worldHeightAt`; a place that has been built in must apply `generate_world` first and then
   * pass the terrain's own `heightAt`, because a stored chunk beats the generator.
   */
  heightAt: (x: number, z: number) => number,
  /** Each item's footprint, so the ring keeps its things apart (see `spawnRing`). */
  footprint?: (itemId: string) => Footprint | null,
): CommandPayload[] {
  const taken = new Set(doc.instances.map((i) => i.instanceId));
  // A world given again takes its own water away first (never water the creator made), so a valley
  // made into mountains does not keep the valley's river, nor an island's sea.
  const commands: CommandPayload[] = [];
  if (doc.environment.water.some((w) => w.id === STARTER_WATER_IDS.lake))
    commands.push({ type: 'remove_water', params: { waterId: STARTER_WATER_IDS.lake } });
  if (doc.environment.rivers.some((r) => r.id === STARTER_WATER_IDS.river))
    commands.push({ type: 'remove_river', params: { riverId: STARTER_WATER_IDS.river } });
  if (
    doc.terrain.world?.kind === 'island' &&
    doc.environment.sea?.level === ISLAND_SEA_LEVEL &&
    world.kind !== 'island'
  )
    commands.push({ type: 'set_sea', params: { level: null } });
  commands.push(
    { type: 'generate_world', params: { world } },
    ...starterWater(world, doc.sizeTier, doc.style.base),
  );
  let n = 0;
  for (const thing of spawnRing({ heightAt }, world, undefined, footprint)) {
    // A place given a world twice must not clash with the first ring's ids.
    while (taken.has(`spawn-${n}`)) n += 1;
    const id = `spawn-${n}`;
    taken.add(id);
    commands.push({
      type: 'place_item',
      params: {
        instanceId: id,
        itemId: thing.itemId,
        position: thing.position,
        rotation: [0, Math.sin(thing.yaw / 2), 0, Math.cos(thing.yaw / 2)],
        scale: [thing.scale, thing.scale, thing.scale],
        // The law, not the seed's ground height, decides where it stands (P2-43).
        rest: true,
      },
    });
  }
  return commands;
}

/** Ids of the water a starter world brings, so a world given again replaces its own water only. */
export const STARTER_WATER_IDS = { lake: 'starter-lake', river: 'starter-river' } as const;
/** How far the river keeps from the spawn when it passes it (m): well outside the clearing. */
const RIVER_AROUND_SPAWN = CLEARING_RADIUS * 2.5;
/** Rivers from 11 m are deep enough to swim in (R4); a starter river is one. */
const STARTER_RIVER_WIDTH = 12;
/** A basin dug where the ground has none: this wide, lowered at most this many times. */
const LAKE_DIG_RADIUS = 28;
const LAKE_DIGS = 3;
const STARTER_WATER_REACH = 500;

/**
 * The water a kind of world starts with (P2-40 task 7, design 3.4), made of R4's own commands so
 * it edits, undoes and saves like water the creator drew: a valley's river into a lake at its far
 * end, the island's sea, the plain's lake in its dip, and a river down the mountain pass into a lake
 * where it comes out. Lakes fill the basin the ground already has, as the Water tool does.
 *
 * Worked out on the seed's own ground, so it is the same on every device and the server. A river
 * never runs through the spawn clearing: it bends around it.
 */
export function starterWater(
  world: WorldSeed,
  sizeTier: SizeTier,
  style: Style = 'realistic',
): CommandPayload[] {
  return planStarter(world, sizeTier, style).water;
}

/**
 * The ground a fresh place of this world stands on once its water is in: the seed's ground with
 * the river's bed carved and any lake basin dug. What "untouched" means for a starter world.
 */
export function starterGround(world: WorldSeed, sizeTier: SizeTier, style: Style = 'realistic'): TerrainData {
  return planStarter(world, sizeTier, style).terrain;
}

function planStarter(
  world: WorldSeed,
  sizeTier: SizeTier,
  style: Style,
): { water: CommandPayload[]; terrain: TerrainData } {
  const { commands, scratch } = planWater(world, sizeTier, style);
  // The digs were tried on the scratch place while planning; the rest is applied now.
  for (const command of commands) if (command.type !== 'sculpt_terrain') applyCommand(scratch, command);
  return { water: commands, terrain: scratch.terrain };
}

function planWater(world: WorldSeed, sizeTier: SizeTier, style: Style) {
  const half = SIZE_TIERS[sizeTier].sideMeters / 2;
  // How far from the middle the river and its lake reach: the whole place up to a medium one, and
  // no further in bigger ones, where a river end to end would pass R4's 1000 m limit.
  const reach = Math.min(half, STARTER_WATER_REACH);
  // A scratch place with this world and nothing else: every command below is tried on it first,
  // so what is planned is exactly what applying the batch will do.
  const scratch = createWorldState(
    WorldDocument.parse({
      schemaVersion: 1,
      experienceId: 'starter-water',
      version: 0,
      // The place's own style, because its slope limit shapes how the river's banks are carved.
      style: { base: style },
      sizeTier,
      access: { mode: 'private' },
      environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
      terrain: { world },
      spawn: { position: [0, 0, 0] },
    }),
  );
  const terrain = scratch.terrain;
  const lowestNear = (x0: number, x1: number, z0: number, z1: number): Point => {
    let best: Point = [x0, z0];
    let low = Infinity;
    for (let x = x0; x <= x1; x += 4)
      for (let z = z0; z <= z1; z += 4) {
        const h = terrain.heightAt(x, z);
        if (h < low) [low, best] = [h, [x, z]];
      }
    return best;
  };
  // The basin the ground already has; where it has none (the fall runs straight off the edge),
  // one is dug with the Terrain tool's own "lower" first, so the river still ends in a lake.
  const lake = (at: Point): CommandPayload[] => {
    const out: CommandPayload[] = [];
    for (let dig = 0; dig <= LAKE_DIGS; dig += 1) {
      const fill = planWaterFill(terrain, at[0], at[1]);
      if (fill) {
        out.push({
          type: 'add_water',
          params: { id: STARTER_WATER_IDS.lake, kind: 'lake', ...fill, params: {} },
        });
        return out;
      }
      if (dig === LAKE_DIGS) break;
      const lower: CommandPayload = {
        type: 'sculpt_terrain',
        params: {
          area: circleArea(at[0], at[1], LAKE_DIG_RADIUS),
          operation: 'lower',
          strength: 1,
          soft: true,
        },
      };
      applyCommand(scratch, lower);
      out.push(lower);
    }
    return [];
  };
  // Down the middle (x = 0) from one end to the other, bending out around the spawn clearing.
  const riverAlongZ = (from: number, to: number, side: number): CommandPayload => {
    const dir = Math.sign(to - from);
    const bend = RIVER_AROUND_SPAWN * side;
    const points: Point[] = [
      [0, from],
      [0, -dir * reach * 0.35],
      [bend * 0.8, -dir * RIVER_AROUND_SPAWN * 0.9],
      [bend, 0],
      [bend * 0.8, dir * RIVER_AROUND_SPAWN * 0.9],
      [0, dir * reach * 0.35],
      [0, to],
    ];
    return {
      type: 'draw_river',
      params: {
        riverId: STARTER_WATER_IDS.river,
        points: points.map(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]),
        width: STARTER_RIVER_WIDTH,
        flow: 1.5,
      },
    };
  };
  // Which way the river bends is part of the seed, so two valleys are not mirror copies.
  const side = world.seed % 2 === 0 ? 1 : -1;
  const commands = ((): CommandPayload[] => {
    switch (world.kind) {
      case 'island':
        // The shape makes the coast; the sea only says how high the water stands.
        return [{ type: 'set_sea', params: { level: ISLAND_SEA_LEVEL } }];
      case 'plain':
        return lake(lowestNear(-half * 0.6, -half * 0.25, 0, half * 0.4));
      case 'valley': {
        // The valley falls toward +z (the way the camera first looks) into a basin at the far end.
        const end = lowestNear(-reach * 0.1, reach * 0.1, reach * 0.55, reach * 0.9);
        return [...lake(end), riverAlongZ(-reach * 0.85, end[1], side)];
      }
      case 'mountains': {
        // Down the pass from whichever end is higher, into a lake where it comes out.
        const north = terrain.heightAt(0, reach * 0.8);
        const south = terrain.heightAt(0, -reach * 0.8);
        const [from, to] = north > south ? [reach * 0.85, -reach * 0.8] : [-reach * 0.85, reach * 0.8];
        const end = lowestNear(-reach * 0.1, reach * 0.1, Math.min(to * 0.7, to), Math.max(to * 0.7, to));
        return [...lake(end), riverAlongZ(from, end[1], side)];
      }
    }
  })();
  return { commands, scratch };
}
