import {
  GameEventName,
  isLegacyGateTag,
  MAX_TERRAIN_SLOPE,
  rideFromParams,
  SIZE_TIERS,
  type CommandPayload,
  type Game,
  type ItemInstance,
  type PlacementRules,
  type Ride,
  type WorldDocument,
} from '@genvr/contracts';
import { getLibraryItem, SPAWN_POINT_ID } from '@genvr/core-library';
import { insidePolygon, place, worldBox, type FloorSurface, type Placed, type Vec3 } from './geometry.js';
import { isTool, repairGame, undeclaredCounters } from './game-repair.js';
import { checkItemRules } from './item-rules.js';
import { checkReach } from './reach.js';
import { asBoxShape } from './rest/box-shape.js';
import { defaultFromY, rest, restFeet, SINK, SurfaceIndex, yawOf, type RestShape } from './rest/index.js';
import { checkScripts, scriptUsage, zoneTagsOf } from './script-checks.js';

export { worldBox } from './geometry.js';
export { repairGame } from './game-repair.js';

/** A door cut into a wall (the runtime and the API compute them with `doorSpots`). */
export interface WorldDoor {
  wallId: string;
  openingId: string;
  x: number;
  z: number;
  sill: number;
  normal: readonly [number, number];
  width: number;
}

/** What the validator needs to know about the world beyond the document (the runtime answers). */
export interface WorldEnvironment {
  /** Terrain height at a point. */
  groundAt(x: number, z: number): number;
  /**
   * Highest surface at or below `fromY` at a point: ground, water, roads, floors, or the top of
   * another item (never the item `ignore` itself).
   */
  supportBelow(x: number, z: number, fromY: number, ignore: string): number;
  /** Water surface at a point, or null where there is no water. */
  waterAt?(x: number, z: number): number | null;
  /** Local box of an item type, whether it blocks the player, and whether it is a building part. */
  itemShape(itemId: string): {
    min: readonly [number, number, number];
    max: readonly [number, number, number];
    /**
     * What a player bumps into, where that is much smaller than the box (a tree's trunk, not its
     * crown). Overlaps and the spawn are checked with it; resting uses the whole box.
     */
    blocks?: {
      min: readonly [number, number, number];
      max: readonly [number, number, number];
    };
    solid: boolean;
    /** Basic parts and grid blocks are made to overlap or touch; they are not reported. */
    part: boolean;
    /** The item type is made to hang in the air (manifest `physics.floats`). */
    floats?: boolean;
    /** Players climb it (manifest `physics.climbable`): ladders lead up to their top. */
    climbable?: boolean;
  } | null;
  /** The item's display name (Core Library or package), if known. */
  itemName?(itemId: string): string | null;
  /** Triangles of one copy of an item type, if known (performance budget). */
  itemTriangles?(itemId: string): number | null;
  /** Ground steeper than `degrees` allows, one spot per area (the terrain's `steepCells`). */
  steepCells?(degrees: number): Array<{ x: number; z: number; degrees: number }>;
  /** Doors cut into walls. */
  doors?(): WorldDoor[];
  /** Placement rules of an item type (manifest `placement`, P2-11), or null for none. */
  itemRules?(itemId: string): PlacementRules | null;
  /** Soil of the ground at a point (grass, dirt, sand, rock, snow, mud). */
  soilAt?(x: number, z: number): string;
  /** Room floors (closed walls), for walking checks. */
  floors?(): readonly FloorSurface[];
  /** Solid wall blocks around doors and windows (`wallBoxes` of `@genvr/world`), for walking checks. */
  wallBoxes?(): readonly WallBlock[];
  /**
   * The rest law's shape for an item type: its box and how it rests (P2-43). When given, floating,
   * buried and slope findings are judged against the law (`rest`) instead of the older box test;
   * without it, callers keep the box test below.
   */
  restShape?(itemId: string): RestShape | null;
  /**
   * Everything the world scatters that is not in the document (woods, painted cover, P2-43): not
   * one finding per tree, but one alarm finding for however many are in the air, since that always
   * means the law or the drawing broke, not something a creator did.
   */
  scattered?(): ItemInstance[];
  /**
   * The rest law's own surface index for this place (P2-43 final review, C1): with it, the checks
   * ask exactly what the law asked when it placed things (bridge decks, the law's item shapes);
   * without it, `validateWorld` builds one from the functions above.
   */
  surfaces?(): SurfaceIndex;
  /** How the place is played (side view turns riding off); free when not given. */
  playView?: 'free' | 'side';
  /** Players the place holds; the size tier's cap when not given. */
  maxPlayers?: number;
}

/** A solid block of wall: center, half extents (along the wall, up, thickness), turn about Y. */
export interface WallBlock {
  center: readonly [number, number, number];
  half: readonly [number, number, number];
  yaw: number;
}

/** Every finding code (the API's response schema is built from this list). */
export const WORLD_FINDING_CODES = [
  'floating',
  'buried',
  'drowned',
  'overlap',
  'spawn-blocked',
  'spawn-water',
  'heavy-place',
  'many-items',
  'steep',
  'slope',
  'door',
  'rule',
  'unreachable',
  'game-no-spawn',
  'game-team-no-spawn',
  'game-loadout-not-tool',
  'game-counter-undeclared',
  'game-zone-tag-missing',
  'game-zone-tag-unused',
  'game-clock-only',
  'game-timer-not-started',
  'game-timer-after-time-up',
  'game-event-not-emitted',
  'ride-side-view',
  'ride-water-dry',
  'ride-tag-unused',
  'ride-many',
  'ride-seats-vs-players',
  'script-no-game',
  'script-too-big',
  'script-unknown-event',
  'script-counter-undeclared',
  'script-zone-tag-missing',
  'script-disabled',
  'script-dynamic-name',
  'script-endless-loop',
  'script-syntax',
  'script-unreviewed-copy',
  'script-awaiting-review',
  'script-rejected',
  'script-checks-unavailable',
] as const;
export type WorldFindingCode = (typeof WORLD_FINDING_CODES)[number];

export interface WorldFinding {
  /** Stable while the problem stays the same (for lists and dismissals). */
  id: string;
  code: WorldFindingCode;
  level: 'warning' | 'info';
  message: string;
  /** Items the finding is about (the studio can select them). */
  instanceIds: string[];
  /** Commands that fix it as one undo step, or null when a person has to decide. */
  fix: CommandPayload[] | null;
  /** A place the finding is about when it is not an item (a door, a closed-in area): world box. */
  area?: { min: [number, number, number]; max: [number, number, number] };
  /** The place script the finding is about, and where in its source (lines and columns from 1). */
  script?: { id: string; line?: number; column?: number };
}

export interface WorldReport {
  findings: WorldFinding[];
  stats: { items: number; triangles: number };
}

/**
 * Place budget for phones (P2-12, decision 81): above it a place still opens, but phones slow
 * down. First numbers; they follow real device measurements.
 */
export const PLACE_BUDGET = { triangles: 400_000, items: 3_000 } as const;

/** A gap bigger than this under an item counts as floating (meters). */
const FLOAT_GAP = 0.3;
/** A gap bigger than this under a scattered thing (woods, painted cover) is the law or the
 * drawing breaking, not a creator's placement, so it gets a much tighter tolerance (meters). */
const SCATTER_GAP = 0.05;
/** Share of the smaller item that must be inside the other to count as an overlap. */
const OVERLAP_SHARE = 0.35;
/** A step up or down a player can still walk through a doorway (meters). */
const DOOR_STEP = 0.6;
/** How far in front of a door there must be room to stand (meters). */
const DOOR_REACH = 1;
/** Findings of one kind listed at most (a broken place should not flood the list). */
const MAX_PER_CODE = 50;
/** How far to the side of the start point a missing team's spawn point is placed (meters). */
const TEAM_SPAWN_SIDE = 4;
/** Rideable items a place holds before phones feel it (movement modes, spec 14). */
const RIDE_MANY = 32;
/** How far from a water surface an item moving on water may be placed (the room's water band). */
const RIDE_WATER_BAND = 2;

/** The rideable items of a place with their rides, read as the room and the runtime read them. */
function rideablesOf(doc: WorldDocument): Array<{ instance: ItemInstance; ride: Ride }> {
  const out: Array<{ instance: ItemInstance; ride: Ride }> = [];
  for (const instance of doc.instances) {
    const ride = rideFromParams(instance.params, getLibraryItem(instance.itemId)?.manifest.ride);
    if (ride) out.push({ instance, ride });
  }
  return out;
}

const round = (value: number) => Math.round(value * 100) / 100;
const moveBy = (instance: ItemInstance, dy: number): CommandPayload => ({
  type: 'transform_item',
  params: {
    instanceId: instance.instanceId,
    position: [
      instance.transform.position[0],
      round(instance.transform.position[1] + dy),
      instance.transform.position[2],
    ],
  },
});

/**
 * World validator v1 (P2-12, docs/ENGINE-RULES.md): items floating above what is under them,
 * items buried in the ground, solid items inside each other, a spawn point inside an item or in
 * deep water, and the place's phone budget. Floating and buried items come with a fix (one
 * undo step); the rest needs a person. Pure: the same checks run in the studio and in workers.
 */
export function validateWorld(doc: WorldDocument, env: WorldEnvironment): WorldReport {
  const nameOf = (instance: ItemInstance) =>
    instance.name ?? env.itemName?.(instance.itemId) ?? instance.itemId.split('.').pop()!.replace(/-/g, ' ');
  const findings: WorldFinding[] = [];
  const counts = new Map<WorldFindingCode, number>();
  const add = (finding: WorldFinding) => {
    const count = counts.get(finding.code) ?? 0;
    counts.set(finding.code, count + 1);
    if (count < MAX_PER_CODE) findings.push(finding);
  };

  const placed: Placed[] = [];
  let triangles = 0;
  for (const instance of doc.instances) {
    triangles += env.itemTriangles?.(instance.itemId) ?? 0;
    const shape = env.itemShape(instance.itemId);
    if (shape) placed.push(place(instance, shape));
  }

  // Resting: buried in the ground, floating above whatever is under it, or (P2-43, when the
  // environment knows the rest law) on ground too steep for the item's rest mode. An environment
  // with `restShape` judges every item against the law with `rest`, which also gives tilted items
  // their fix; older callers keep the plain box test below.
  const surfaces = env.restShape
    ? (env.surfaces?.() ??
      new SurfaceIndex(doc, {
        groundAt: env.groundAt,
        ...(env.waterAt ? { waterAt: env.waterAt } : {}),
        itemShape: env.itemShape,
        restShape: env.restShape,
        ...(env.floors ? { floors: env.floors() } : {}),
      }))
    : null;

  for (const item of placed) {
    const { instance, min, max, feet } = item;
    const height = Math.max(0.01, max[1] - min[1]);
    let buried = false;

    if (surfaces) {
      const shape = env.restShape!(instance.itemId);
      if (shape && shape.rule.mode !== 'float' && !item.floats) {
        const result = rest(instance, shape, surfaces);
        if (!result.ok) {
          // A map marker (a spawn point, a zone) is not a physical thing: it may
          // stand on any ground, however wide it is.
          if (!getLibraryItem(instance.itemId)?.manifest.marker)
            add({
              id: `slope:${instance.instanceId}`,
              code: 'slope',
              level: 'warning',
              message: `${nameOf(instance)} stands on ground too steep for it.`,
              instanceIds: [instance.instanceId],
              fix: null,
            });
        } else {
          const gap = instance.transform.position[1] - result.position[1];
          const sink = shape.rule.sink ?? SINK;
          const fix: CommandPayload[] = [
            {
              type: 'transform_item',
              params: {
                instanceId: instance.instanceId,
                position: result.position,
                rotation: result.rotation,
                // Rested by the law where it is applied (P2-43 final review): a graded building
                // levels its ground, and the server resolves it the same way.
                rest: true,
              },
            },
          ];
          if (gap > FLOAT_GAP)
            add({
              id: `floating:${instance.instanceId}`,
              code: 'floating',
              level: 'warning',
              message: `${nameOf(instance)} floats ${round(gap)} m above what is under it.`,
              instanceIds: [instance.instanceId],
              fix,
            });
          else if (-gap > sink + 0.5) {
            buried = true;
            add({
              id: `buried:${instance.instanceId}`,
              code: 'buried',
              level: 'warning',
              message: `${nameOf(instance)} is ${round(-gap)} m under the ground.`,
              instanceIds: [instance.instanceId],
              fix,
            });
          }
        }
      }
    } else {
      const ground = Math.max(...feet.map(([x, z]) => env.groundAt(x, z)));
      const sunk = ground - min[1];
      if (sunk > Math.max(0.5, height * 0.5)) {
        buried = true;
        add({
          id: `buried:${instance.instanceId}`,
          code: 'buried',
          level: 'warning',
          message: `${nameOf(instance)} is ${round(sunk)} m under the ground.`,
          instanceIds: [instance.instanceId],
          fix: [moveBy(instance, sunk)],
        });
      }
    }
    if (buried) continue;

    // Under water (P2-40): giving a place a starter world can leave a bench at the bottom of a
    // lake. The ground was not overwritten and the item has not moved, so this is neither buried
    // nor floating; it is simply drowned. There is no fix, because where it should go instead is
    // the creator's to decide, and a thing meant to be under water is a fair thing to build.
    // Things that belong in water (sea life, rocks: `stands` has `water`) are not drowned there (ITEMS-close-01).
    const belongsInWater = getLibraryItem(instance.itemId)?.manifest.placement?.stands?.includes('water') ?? false;
    const water = env.waterAt?.((min[0] + max[0]) / 2, (min[2] + max[2]) / 2) ?? null;
    if (!belongsInWater && water !== null && water > max[1])
      add({
        id: `drowned:${instance.instanceId}`,
        code: 'drowned',
        level: 'info',
        message: `${nameOf(instance)} is ${round(water - max[1])} m under the water.`,
        instanceIds: [instance.instanceId],
        fix: null,
      });

    if (!surfaces) {
      if (item.floats) continue; // Meant to hang in the air (P2-11).
      const support = Math.max(
        ...feet.map(([x, z]) => env.supportBelow(x, z, min[1] + 0.05, instance.instanceId)),
      );
      const gap = min[1] - support;
      if (gap > FLOAT_GAP)
        add({
          id: `floating:${instance.instanceId}`,
          code: 'floating',
          level: 'warning',
          message: `${nameOf(instance)} floats ${round(gap)} m above what is under it.`,
          instanceIds: [instance.instanceId],
          fix: [moveBy(instance, -gap)],
        });
    }
  }

  // Scattered things in the air (P2-43): woods and painted cover are not in the document, so a
  // spot the law or the drawing gets wrong is one alarm finding for the count, not one row per
  // tree — the creator did not place these, and there is nothing for them to Fix. Only real
  // floating counts (P2-43 final review, I3): the base is above what is under it at every foot.
  // Scatter stands a thing at the ground under its middle, which on a slope is a little into the
  // ground on the uphill side, and a rock's sink is not a fault either, so burial is never counted.
  if (surfaces && env.restShape) {
    let count = 0;
    let box: { min: Vec3; max: Vec3 } | null = null;
    for (const scattered of env.scattered?.() ?? []) {
      const shape = env.restShape(scattered.itemId);
      if (!shape || shape.rule.mode === 'float') continue;
      const { position, rotation, scale } = scattered.transform;
      const baseY = position[1] + shape.min[1]! * scale[1]!;
      const fromY = defaultFromY(scattered, shape);
      const feet = restFeet(shape, scale, yawOf(rotation), position[0], position[2]);
      const gap = Math.min(
        ...feet.map(([fx, fz]) => baseY - surfaces.below(fx, fz, fromY, scattered.instanceId)),
      );
      if (gap <= SCATTER_GAP) continue;
      count += 1;
      const b = worldBox(scattered, asBoxShape(shape));
      box = box
        ? {
            min: [0, 1, 2].map((i) => Math.min(box!.min[i]!, b.min[i]!)) as Vec3,
            max: [0, 1, 2].map((i) => Math.max(box!.max[i]!, b.max[i]!)) as Vec3,
          }
        : b;
    }
    if (count > 0)
      add({
        id: 'floating:scatter',
        code: 'floating',
        level: 'warning',
        message: `${count} scattered things are in the air.`,
        instanceIds: [],
        fix: null,
        ...(box ? { area: { min: box.min, max: box.max } } : {}),
      });
  }

  // Each item's own placement rules (P2-11, owner note): where it stands, upright, free space.
  if (env.itemRules)
    for (const item of placed) {
      const rules = env.itemRules(item.instance.itemId);
      if (!rules) continue;
      for (const broken of checkItemRules(item, rules, env, placed, nameOf))
        if (!broken.ok)
          add({
            id: `rule:${broken.rule}:${item.instance.instanceId}`,
            code: 'rule',
            level: 'warning',
            message: broken.message!,
            instanceIds: [item.instance.instanceId],
            fix: broken.fix,
          });
    }

  // Solid items inside each other (a grid of 4 m cells keeps this fast in big places). Trees are
  // measured at their trunks: crowns overlapping is what woods look like.
  const CELL = 4;
  const cells = new Map<string, Placed[]>();
  const solids = placed.filter((item) => item.solid && !item.part);
  for (const item of solids) {
    for (let x = Math.floor(item.body.min[0] / CELL); x <= Math.floor(item.body.max[0] / CELL); x++)
      for (let z = Math.floor(item.body.min[2] / CELL); z <= Math.floor(item.body.max[2] / CELL); z++) {
        const key = `${x},${z}`;
        const list = cells.get(key) ?? [];
        list.push(item);
        cells.set(key, list);
      }
  }
  const volume = (item: Placed) =>
    (item.body.max[0] - item.body.min[0]) *
    (item.max[1] - item.min[1]) *
    (item.body.max[2] - item.body.min[2]);
  const checked = new Set<string>();
  for (const list of cells.values()) {
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const [a, b] = [list[i]!, list[j]!];
        const ids = [a.instance.instanceId, b.instance.instanceId].sort();
        const key = ids.join('|');
        if (checked.has(key)) continue;
        checked.add(key);
        if (a.instance.groupId && a.instance.groupId === b.instance.groupId) continue;
        const inside = [0, 1, 2].map((axis) =>
          Math.max(
            0,
            Math.min(a.body.max[axis]!, b.body.max[axis]!) - Math.max(a.body.min[axis]!, b.body.min[axis]!),
          ),
        );
        const shared = inside[0]! * inside[1]! * inside[2]!;
        const smaller = Math.min(volume(a), volume(b));
        if (smaller > 0.001 && shared > smaller * OVERLAP_SHARE)
          add({
            id: `overlap:${key}`,
            code: 'overlap',
            level: 'warning',
            message: `${nameOf(a.instance)} and ${nameOf(b.instance)} are inside each other.`,
            instanceIds: ids,
            fix: null,
          });
      }
  }

  // Spawn: players must not start inside an item or in deep water.
  const [sx, sy, sz] = doc.spawn.position;
  const feetY = Math.max(env.groundAt(sx, sz), sy - 1);
  const blocking = solids.find(
    (item) =>
      sx > item.body.min[0] &&
      sx < item.body.max[0] &&
      sz > item.body.min[2] &&
      sz < item.body.max[2] &&
      feetY + 0.9 > item.body.min[1] &&
      feetY + 0.1 < item.body.max[1],
  );
  if (blocking)
    add({
      id: `spawn-blocked:${blocking.instance.instanceId}`,
      code: 'spawn-blocked',
      level: 'warning',
      message: `Players start inside ${nameOf(blocking.instance)}. Move it or move the start point.`,
      instanceIds: [blocking.instance.instanceId],
      fix: null,
    });
  // Never inside a house (owner, 2026-10-07): the studio moves players to the nearest street, but the start point
  // should be outside in the first place.
  const house = doc.walls.find((wall) => wall.closed && insidePolygon(sx, sz, wall.points));
  if (house)
    add({
      id: `spawn-blocked:${house.id}`,
      code: 'spawn-blocked',
      level: 'warning',
      message: `Players start inside ${house.name ?? 'a building'}. Move the start point onto a street or open ground.`,
      instanceIds: [],
      fix: null,
    });
  const water = env.waterAt?.(sx, sz) ?? null;
  if (water !== null && water - env.groundAt(sx, sz) > 1.2)
    add({
      id: 'spawn-water',
      code: 'spawn-water',
      level: 'warning',
      message: 'Players start in deep water. Move the start point to dry ground.',
      instanceIds: [],
      fix: null,
    });

  // Game spawns (P9-12): a game should have a spawn point (without one the room uses the place's
  // start point), and with two teams each team needs one (a spawn point for any team serves
  // both). The fixes place them at the place's start point.
  if (doc.game) {
    const spawnPoints = doc.instances.filter((instance) => instance.itemId === SPAWN_POINT_ID);
    const taken = new Set(doc.instances.map((instance) => instance.instanceId));
    const freeId = (base: string) => {
      let id = base;
      for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
      return id;
    };
    const placeSpawn = (x: number, team?: 'red' | 'blue'): CommandPayload => ({
      type: 'place_item',
      params: {
        instanceId: freeId(team ? `spawn-point-${team}` : 'spawn-point'),
        itemId: SPAWN_POINT_ID,
        position: [x, sy, sz],
        ...(team ? { itemParams: { team } } : {}),
        // The start point is the hint; the rest law sets the height (P2-43).
        rest: true,
      },
    });
    if (spawnPoints.length === 0)
      add({
        id: 'game-no-spawn',
        code: 'game-no-spawn',
        level: 'warning',
        message:
          "The game has no spawn point. Spawn points choose where players start and come back; without one they all use the place's start point.",
        instanceIds: [],
        fix: [placeSpawn(sx)],
      });
    else if (doc.game.teams?.mode === 'two')
      for (const [team, side] of [
        ['red', -1],
        ['blue', 1],
      ] as const) {
        const serves = spawnPoints.some((instance) => {
          const value = instance.params.team;
          return value === team || (value !== 'red' && value !== 'blue');
        });
        if (!serves)
          add({
            id: `game-team-no-spawn:${team}`,
            code: 'game-team-no-spawn',
            level: 'warning',
            message: `Team ${team} has no spawn point. Add one for ${team} or for any team.`,
            instanceIds: [],
            fix: [placeSpawn(sx + side * TEAM_SPAWN_SIDE, team)],
          });
      }

    // The loadout (P9-12) gives players tools: an item that is not one (or not in the library)
    // never reaches a hand. The fix keeps the loadout's real tools (and makes the game's other
    // whole-game repairs too, see `repairGame`).
    const loadout = doc.game.loadout;
    if (loadout)
      for (const itemId of new Set(loadout.items.filter((id) => !isTool(id))))
        add({
          id: `game-loadout-not-tool:${itemId}`,
          code: 'game-loadout-not-tool',
          level: 'warning',
          message: getLibraryItem(itemId)
            ? `${getLibraryItem(itemId)!.manifest.name} in the game's loadout is not a tool players can hold. Take it out.`
            : `The game's loadout has an item that is not in the library (${itemId}). Take it out.`,
          instanceIds: [],
          fix: [{ type: 'set_game', params: { game: repairGame(doc.game, scriptUsage(doc).counters) } }],
        });

    for (const finding of checkGameRules(doc, doc.game)) add(finding);
  }

  // Creator scripts (P2-10): names they use that point at nothing, sizes, switched off, no game.
  for (const finding of checkScripts(doc)) add(finding);

  // Rideable items (movement modes): generic, whatever the items are.
  const rideables = rideablesOf(doc);
  if (rideables.length > 0 && env.playView === 'side')
    add({
      id: 'ride-side-view',
      code: 'ride-side-view',
      level: 'info',
      message: `Riding is off in side-view places, so ${rideables.length === 1 ? 'the rideable item stays' : `the ${rideables.length} rideable items stay`} where they are.`,
      instanceIds: rideables.map((entry) => entry.instance.instanceId),
      fix: null,
    });
  for (const { instance, ride } of rideables) {
    if (ride.model !== 'water') continue;
    const [x, y, z] = instance.transform.position;
    const water = env.waterAt?.(x, z) ?? null;
    if (water === null || Math.abs(water - y) > RIDE_WATER_BAND)
      add({
        id: `ride-water-dry:${instance.instanceId}`,
        code: 'ride-water-dry',
        level: 'warning',
        message: `${nameOf(instance)} is a rideable item that moves on water, but there is no water where it stands, so nobody can ride it. Move it onto water.`,
        instanceIds: [instance.instanceId],
        fix: null,
      });
  }
  if (rideables.length > RIDE_MANY)
    add({
      id: 'ride-many',
      code: 'ride-many',
      level: 'warning',
      message: `${rideables.length} rideable items; phones stay smooth up to ${RIDE_MANY}.`,
      instanceIds: [],
      fix: null,
    });
  const seats = rideables.reduce((sum, entry) => sum + entry.ride.seats, 0);
  const players = env.maxPlayers ?? SIZE_TIERS[doc.sizeTier].maxPlayers;
  if (seats > players)
    add({
      id: 'ride-seats-vs-players',
      code: 'ride-seats-vs-players',
      level: 'info',
      message: `The rideable items have ${seats} seats, more than the ${players} players the place holds.`,
      instanceIds: [],
      fix: null,
    });

  // Steep ground (P2-11): steeper than the style allows (older edits or road and room grading).
  const style = doc.style.base;
  for (const spot of env.steepCells?.(MAX_TERRAIN_SLOPE[style]) ?? []) {
    const r = 8;
    const area: Array<[number, number]> = [
      [round(spot.x - r), round(spot.z - r)],
      [round(spot.x + r), round(spot.z - r)],
      [round(spot.x + r), round(spot.z + r)],
      [round(spot.x - r), round(spot.z + r)],
    ];
    const smooth: CommandPayload = {
      type: 'sculpt_terrain',
      params: { area, operation: 'smooth', strength: 1, soft: true },
    };
    add({
      id: `steep:${Math.round(spot.x)},${Math.round(spot.z)}`,
      code: 'steep',
      level: 'warning',
      message: `The ground near (${Math.round(spot.x)}, ${Math.round(spot.z)}) is ${spot.degrees}° steep; the ${style} style allows ${MAX_TERRAIN_SLOPE[style]}°.`,
      instanceIds: [],
      fix: [smooth, smooth, smooth],
    });
  }

  // Doors (P2-11): both sides of a doorway must be a place to stand, reachable in one step.
  for (const door of env.doors?.() ?? []) {
    let problem: string | null = null;
    let blocker: Placed | undefined;
    for (const side of [1, -1]) {
      const x = door.x + door.normal[0] * side * DOOR_REACH;
      const z = door.z + door.normal[1] * side * DOOR_REACH;
      const ground = env.groundAt(x, z);
      const water = env.waterAt?.(x, z) ?? null;
      blocker = solids
        .concat(placed.filter((item) => item.solid && item.part))
        .find(
          (item) =>
            x > item.body.min[0] &&
            x < item.body.max[0] &&
            z > item.body.min[2] &&
            z < item.body.max[2] &&
            item.body.min[1] < door.sill + 1.8 &&
            item.body.max[1] > door.sill + DOOR_STEP,
        );
      if (blocker) problem = `is blocked by ${nameOf(blocker.instance)}`;
      else if (ground - door.sill > DOOR_STEP) problem = 'opens into the ground';
      else if (water !== null && water - ground > 1.2 && water > door.sill - DOOR_STEP)
        problem = 'opens into deep water';
      else if (door.sill - env.supportBelow(x, z, door.sill + DOOR_STEP, '') > DOOR_STEP)
        problem = `opens onto a drop of ${round(door.sill - env.supportBelow(x, z, door.sill + DOOR_STEP, ''))} m`;
      if (problem) break;
    }
    if (problem)
      add({
        id: `door:${door.wallId}:${door.openingId}`,
        code: 'door',
        level: 'warning',
        message: `A door ${problem}.`,
        instanceIds: blocker ? [blocker.instance.instanceId] : [],
        fix: null,
      });
  }

  // Reachability from the start point (P2-11): items made to be used, doors, closed-in areas.
  // A door the door check already reported is not reported again.
  if (!blocking)
    for (const finding of checkReach(doc, env, placed, nameOf))
      if (!findings.some((other) => `unreachable-${other.id}` === finding.id)) add(finding);

  // The place's phone budget.
  if (triangles > PLACE_BUDGET.triangles)
    add({
      id: 'heavy-place',
      code: 'heavy-place',
      level: 'warning',
      message: `The items have about ${triangles.toLocaleString('en-US')} triangles; phones stay smooth up to ${PLACE_BUDGET.triangles.toLocaleString('en-US')}.`,
      instanceIds: [],
      fix: null,
    });
  if (doc.instances.length > PLACE_BUDGET.items)
    add({
      id: 'many-items',
      code: 'many-items',
      level: 'warning',
      message: `${doc.instances.length.toLocaleString('en-US')} items; phones stay smooth up to ${PLACE_BUDGET.items.toLocaleString('en-US')}.`,
      instanceIds: [],
      fix: null,
    });

  for (const [code, count] of counts)
    if (count > MAX_PER_CODE)
      findings.push({
        id: `more:${code}`,
        code,
        level: 'info',
        message: `${count - MAX_PER_CODE} more of the same kind are not listed.`,
        instanceIds: [],
        fix: null,
      });
  return { findings, stats: { items: doc.instances.length, triangles } };
}

/** The events a zone tag narrows (`when.tag` is ignored on any other event). */
const ZONE_EVENTS: ReadonlySet<string> = new Set(['zone_entered', 'zone_exited', 'zone_crossed']);
/** The events a ride tag narrows. */
const RIDE_EVENTS: ReadonlySet<string> = new Set(['mounted', 'dismounted']);

/**
 * Checks of a game's generic rules (P9-12 generic rules, Task 8): names that point at nothing.
 * The engine never interprets a counter name, a zone tag or a custom event, so a typo is not an
 * error to it, only a rule that silently never does anything; these findings say so. Nothing here
 * knows what a game means by any name.
 *
 * - A counter named by a rule, the ranking or a display that the game does not declare (one fix, on
 *   the first of them, declares them all per player, starting at 0).
 * - A zone tag a rule listens to or teleports to that no zone in the place has (except the tags a
 *   migrated stored race is written for, `isLegacyGateTag`), and (info) a zone whose tag no rule
 *   uses.
 * - (info) A game only the clock can end: no `win`, and every `end_match` waits for `time_up`.
 * - A rule waiting for `timer_fired` when no rule starts a timer, and a timer started on `time_up`
 *   (the match is decided in that same moment, so it never fires: a rule that decides the match
 *   at the end must do so while handling `time_up` itself).
 * - A custom event a rule listens to that no rule raises with `emit`.
 * - A ride tag a rule hears (`mounted`, `dismounted`) or asks for (`riding`) that no rideable item has.
 *
 * The place's enabled scripts count too (P2-10): their literal emits raise custom events, their literal zone tags use
 * zones, and the counters they name are declared by the same fix; a script that works a name out while running
 * turns the "nobody raises / nobody uses" findings off (spec 8).
 */
export function checkGameRules(doc: WorldDocument, game: Game): WorldFinding[] {
  const findings: WorldFinding[] = [];
  const rules = game.rules ?? [];
  const engineEvents: ReadonlySet<string> = new Set(GameEventName.options);
  const scripts = scriptUsage(doc);

  // Counters named but not declared. One fix declares every missing counter (as many as there is
  // room for, the scripts' too) and sits on the first finding.
  const { undeclared } = undeclaredCounters(game);
  const { declaredByFix } = undeclaredCounters(game, scripts.counters);
  undeclared.forEach((missing, index) => {
    const fixes = index === 0 && declaredByFix.length > 0;
    findings.push({
      id: `game-counter-undeclared:${missing}`,
      code: 'game-counter-undeclared',
      level: 'warning',
      message:
        `The game uses the counter "${missing}", but no counter has that name. Declare it or use a declared name.` +
        (fixes && undeclared.length > 1 ? ` The fix declares all ${declaredByFix.length} missing counters.` : ''),
      instanceIds: [],
      fix: fixes ? [{ type: 'set_game', params: { game: repairGame(game, scripts.counters) } }] : null,
    });
  });

  // Zone tags: those the place has (instance ids per tag) and those the rules use.
  const zones = zoneTagsOf(doc);
  const used: string[] = [];
  const use = (tag: string | undefined) => {
    if (tag !== undefined && !used.includes(tag)) used.push(tag);
  };
  for (const rule of rules) {
    if (ZONE_EVENTS.has(rule.when.event)) use(rule.when.tag);
    for (const action of rule.do) if (action.kind === 'teleport_to_zone') use(action.tag);
  }
  // A stored race read as rules is written for every old gate position it could have (the rules
  // cannot see the world), so its tags without a zone are expected, not a designer's mistake.
  for (const tag of used.filter((t) => !zones.has(t) && !isLegacyGateTag(t)))
    findings.push({
      id: `game-zone-tag-missing:${tag}`,
      code: 'game-zone-tag-missing',
      level: 'warning',
      message: `A rule uses the zone tag "${tag}", but no zone in the place has it. Give an item that tag or change the rule.`,
      instanceIds: [],
      fix: null,
    });
  for (const [tag, ids] of zones)
    if (!used.includes(tag) && !scripts.zoneTags.has(tag) && !scripts.everyZone && !scripts.dynamic)
      findings.push({
        id: `game-zone-tag-unused:${tag}`,
        code: 'game-zone-tag-unused',
        level: 'info',
        message: `No rule uses the zone tag "${tag}", so ${ids.length === 1 ? 'that zone does' : `those ${ids.length} zones do`} nothing yet.`,
        instanceIds: ids,
        fix: null,
      });

  // Ride tags: a rule hearing getting on or off, or asking whether the player rides, with a tag no
  // rideable item has never matches. Ride tags and zone tags are separate names.
  const rideTags = new Set(rideablesOf(doc).flatMap((entry) => (entry.ride.tag ? [entry.ride.tag] : [])));
  const rideUsed: string[] = [];
  const useRide = (tag: string | undefined) => {
    if (tag !== undefined && !rideUsed.includes(tag)) rideUsed.push(tag);
  };
  for (const rule of rules) {
    if (RIDE_EVENTS.has(rule.when.event)) useRide(rule.when.tag);
    for (const condition of rule.if) if (condition.kind === 'riding') useRide(condition.tag);
  }
  for (const tag of rideUsed.filter((t) => !rideTags.has(t)))
    findings.push({
      id: `ride-tag-unused:${tag}`,
      code: 'ride-tag-unused',
      level: 'warning',
      message: `A rule uses the ride tag "${tag}", but no rideable item in the place has it. Give a rideable item that tag or change the rule.`,
      instanceIds: [],
      fix: null,
    });

  // Endings: without `win`, a game whose every `end_match` waits for time up ends only by the clock.
  const endsEarly = rules.some(
    (rule) => rule.when.event !== 'time_up' && rule.do.some((action) => action.kind === 'end_match'),
  );
  if (game.win === undefined && !endsEarly) {
    const minutes = Math.round((game.match.durationSec / 60) * 10) / 10;
    findings.push({
      id: 'game-clock-only',
      code: 'game-clock-only',
      level: 'info',
      message: `Only the clock ends the match (after ${minutes} min). Add a rule that ends it earlier if play should stop sooner.`,
      instanceIds: [],
      fix: null,
    });
  }

  // Timers: one started on time up never fires; a rule waiting for a timer needs one started.
  rules.forEach((rule, index) => {
    if (rule.when.event !== 'time_up') return;
    for (const action of rule.do)
      if (action.kind === 'start_timer')
        findings.push({
          id: `game-timer-after-time-up:${index}:${action.name}`,
          code: 'game-timer-after-time-up',
          level: 'warning',
          message: `A rule starts the timer "${action.name}" when time is up, but the match is decided in that same moment, so the timer never fires. End the match in the rule for time up itself.`,
          instanceIds: [],
          fix: null,
        });
  });
  const starts = rules.some((rule) => rule.do.some((action) => action.kind === 'start_timer'));
  if (!starts && rules.some((rule) => rule.when.event === 'timer_fired'))
    findings.push({
      id: 'game-timer-not-started',
      code: 'game-timer-not-started',
      level: 'warning',
      message: 'A rule waits for a timer to end, but no rule starts a timer.',
      instanceIds: [],
      fix: null,
    });

  // Custom events: heard only when a rule raises them with `emit`.
  const emitted = new Set(rules.flatMap((rule) => rule.do.flatMap((a) => (a.kind === 'emit' ? [a.event] : []))));
  for (const event of scripts.emits) emitted.add(event);
  const listened = scripts.dynamic
    ? []
    : [...new Set(rules.map((rule) => rule.when.event).filter((e) => !engineEvents.has(e)))];
  for (const event of listened.filter((e) => !emitted.has(e)))
    findings.push({
      id: `game-event-not-emitted:${event}`,
      code: 'game-event-not-emitted',
      level: 'warning',
      message: `A rule listens for the event "${event}", but no rule raises it.`,
      instanceIds: [],
      fix: null,
    });
  return findings;
}
