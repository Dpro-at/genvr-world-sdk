import {
  rideFromParams,
  SIZE_TIERS,
  zoneFromParams,
  zoneSize,
  type Game,
  type ItemInstance,
  type WorldDocument,
  type Zone,
} from '@genvr/contracts';
import { getCoreItem, getLibraryItem, zoneShapeOfItem } from '@genvr/core-library';
import { WALL_SURFACES } from '@genvr/world';

const r = (v: number) => Math.round(v * 10) / 10;

/** Items one `get_world_summary` page lists (`from_item` gives the next page). */
export const WORLD_SUMMARY_PAGE = 100;

/**
 * The most characters one summary page has: a page ends before 100 items when the next item line
 * would pass it (long zone lines), so an MCP answer with its data line, place version and place
 * notes stays under the 8000-character result cap.
 */
export const WORLD_SUMMARY_CHARS = 6500;

/** How the summary's compass words map to the place's axes (shown when the place has zones). */
export const DIRECTIONS_LINE = 'Directions: north is -z, east is +x; turn 0° faces south (+z).';

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'] as const;

/** The item's turn about the vertical axis in whole degrees, 0 to 359 (0 faces +z, as `turn` in the tools). */
function turnDegrees(rotation: readonly number[]): number {
  const deg = Math.round((2 * Math.atan2(rotation[1] ?? 0, rotation[3] ?? 1) * 180) / Math.PI);
  return ((deg % 360) + 360) % 360;
}

/** The compass word of a turn: forward is (sin turn, cos turn) in x and z, north is -z. */
function compassOf(turnDeg: number): (typeof COMPASS)[number] {
  const bearing = (180 - turnDeg + 360) % 360;
  return COMPASS[Math.round(bearing / 45) % 8]!;
}

/** The axis of a compass word, so the words and the coordinates agree in the model's reading. */
const AXES: Record<(typeof COMPASS)[number], string> = {
  north: '-z',
  'north-east': '+x -z',
  east: '+x',
  'south-east': '+x +z',
  south: '+z',
  'south-west': '-x +z',
  west: '-x',
  'north-west': '-x -z',
};

/**
 * A zone in words for its item line: the shape and tag, its size from the item's scale, and for a
 * gate its facing and the heading that counts (a gate counts one way only, along its facing).
 */
function describeZone(zone: Zone, instance: ItemInstance): string {
  const size = zoneSize(zone.shape, instance.transform.scale);
  const turn = turnDegrees(instance.transform.rotation);
  const head = `, zone ${zone.shape} "${zone.tag}"`;
  if (zone.shape === 'gate') {
    const compass = compassOf(turn);
    return `${head}, ${r(size.width)} m wide, facing ${compass} (turn ${turn}°), counts when crossed heading ${compass} (${AXES[compass]})`;
  }
  return `${head}, ${r(size.width)} m wide x ${r(size.depth)} m deep${turn === 0 ? '' : `, turn ${turn}°`}`;
}

/**
 * Compact description of a world for the model's prompt (task P4-03 grows this): size, look,
 * and the objects with ids and ground positions. `maxItems` limits the item list; `fromItem`
 * starts it later (a page), and a cut list ends with `more_items_from: N`, the next page's start.
 * A page also ends early when it would pass `WORLD_SUMMARY_CHARS` (its first item is always shown).
 */
export function worldSummary(world: WorldDocument, maxItems: number, fromItem = 0): string {
  const side = SIZE_TIERS[world.sizeTier].sideMeters;
  const lines = [
    `Size: ${side} x ${side} m. Style: ${world.style.base}. Sky: ${world.environment.sky.preset}${Number(world.environment.sky.params.cycle) > 0 ? ` (day and night cycle, ${Number(world.environment.sky.params.cycle)} minutes per day)` : ''}. Weather: ${world.environment.weather.preset}.`,
    groundLine(world),
    `Game: ${world.game ? describeGame(world.game) : 'none'}.`,
    `Items: ${world.instances.length}${fromItem > 0 ? ` (listed from ${fromItem})` : ''}.`,
  ];
  const rideables = describeRideables(world);
  if (rideables) lines.push(`${rideables}.`);
  if (world.instances.some((i) => zoneFromParams(i.params, zoneShapeOfItem(i.itemId)))) lines.push(DIRECTIONS_LINE);
  const tail = tailLines(world);
  // Room kept for the tail, the "and N more" line and the next-page marker.
  const budget = WORLD_SUMMARY_CHARS - [...lines, ...tail].join('\n').length - 64;
  let used = 0;
  let end = Math.min(world.instances.length, fromItem + maxItems);
  for (let index = fromItem; index < end; index++) {
    const instance = world.instances[index]!;
    const [x, , z] = instance.transform.position;
    const name = instance.name ?? getCoreItem(instance.itemId)?.manifest.name ?? instance.itemId;
    const zone = zoneFromParams(instance.params, zoneShapeOfItem(instance.itemId));
    const ride = rideFromParams(instance.params, getLibraryItem(instance.itemId)?.manifest.ride);
    const line = `- ${instance.instanceId}: ${name} (${instance.itemId}) at (${r(x)}, ${r(z)})${zone ? describeZone(zone, instance) : ''}${ride ? `, rideable ${ride.model}${ride.tag ? ` "${ride.tag}"` : ''}` : ''}${instance.locked ? ', locked' : ''}`;
    if (index > fromItem && used + line.length + 1 > budget) {
      end = index;
      break;
    }
    used += line.length + 1;
    lines.push(line);
  }
  if (world.instances.length > end) {
    lines.push(`- and ${world.instances.length - end} more`);
    lines.push(`more_items_from: ${end}`);
  }
  lines.push(...tail);
  return lines.join('\n');
}

/** Roads, walls, water, rivers and the sea, after the item list. */
function tailLines(world: WorldDocument): string[] {
  const lines: string[] = [];
  const firstPoint = (points: ReadonlyArray<readonly [number, number]>) =>
    points[0] ? `from (${r(points[0][0])}, ${r(points[0][1])})` : '';
  if (world.roads.length) {
    lines.push(`Roads: ${world.roads.length}.`);
    for (const road of world.roads.slice(0, 20))
      lines.push(`- ${road.id}${road.name ? ` "${road.name}"` : ''} ${firstPoint(road.points)}`);
  }
  // The look a wall was drawn with (draw_wall material), so a builder adds more of the same.
  const wallLook = (materialId: string | undefined) => {
    const look = Object.entries(WALL_SURFACES).find(([, ground]) => ground === materialId)?.[0];
    return look ? ` (${look})` : '';
  };
  if (world.walls.length) {
    lines.push(`Walls and rooms: ${world.walls.length}.`);
    for (const wall of world.walls.slice(0, 20))
      lines.push(
        `- ${wall.id} ${wall.closed ? 'room' : 'wall'}${wallLook(wall.materialId)} ${firstPoint(wall.points)}` +
          (wall.openings.length ? `, openings: ${wall.openings.map((o) => `${o.id} ${o.kind}`).join(', ')}` : ''),
      );
  }
  if (world.pavings.length) {
    lines.push(`Paved areas: ${world.pavings.length}.`);
    for (const paving of world.pavings.slice(0, 20)) lines.push(`- ${paving.id} ${firstPoint(paving.area)}`);
  }
  if (world.environment.water.length) {
    lines.push(`Water: ${world.environment.water.length}.`);
    for (const water of world.environment.water.slice(0, 20))
      lines.push(`- ${water.id} ${water.kind} ${firstPoint(water.area)}`);
  }
  // Rivers and the sea (P2-39): without these the assistant cannot see water that is already
  // there, and would draw a new river over one that exists.
  if (world.environment.rivers.length) {
    lines.push(`Rivers: ${world.environment.rivers.length}.`);
    for (const river of world.environment.rivers.slice(0, 20))
      lines.push(
        `- ${river.id}${river.name ? ` "${river.name}"` : ''} ${r(river.width)} m wide ${firstPoint(river.points)}`,
      );
  }
  if (world.environment.sea) lines.push(`Sea up to ${r(world.environment.sea.level)} m.`);
  // The scroll story (SCROLL-02): set_story replaces all stops, so the assistant needs them all.
  if (world.story?.stops.length) {
    lines.push(`Story${world.story.title ? ` "${world.story.title}"` : ''}: ${world.story.stops.length} stops.`);
    world.story.stops.forEach((stop, index) => {
      const { position: p, target: t } = stop.camera;
      lines.push(
        `- ${index + 1}. "${stop.title}" ${stop.side} camera (${p.map(r).join(', ')}) looks at (${t.map(r).join(', ')})` +
          (stop.camera.fov ? ` fov ${r(stop.camera.fov)}` : ''),
      );
    });
  }
  return lines;
}

/**
 * What the ground is (P2-40): without this the assistant cannot tell a starter world from a flat
 * field, and would make a new world over one the builder already has.
 */
function groundLine(world: WorldDocument): string {
  if (world.voxels) return 'Ground: blocks.';
  const seed = world.terrain.world;
  return seed ? `Ground: a ${seed.kind} world (seed ${seed.seed}).` : 'Ground: flat, not made from a world.';
}

/**
 * The game in a few words (P9-12), from the generic parts it has: "5 min, two teams, highest
 * score wins" or "10 min, 2 counters, 5 rules, ranked by points".
 */
export function describeGame(game: Game): string {
  const parts = [`${r(game.match.durationSec / 60)} min`];
  if (game.teams) parts.push(game.teams.mode === 'two' ? 'two teams' : 'teams off');
  if (game.win) parts.push('highest score wins');
  if (game.counters?.length) parts.push(count(game.counters.length, 'counter'));
  if (game.rules?.length) parts.push(count(game.rules.length, 'rule'));
  if (game.ranking) parts.push(`ranked by ${game.ranking.by}`);
  if (game.hud?.length) parts.push(count(game.hud.length, 'display'));
  return parts.join(', ');
}

/**
 * The game's rules in counts (`set_rules` answers with it): "3 counters, 5 rules, ranked by
 * points, 2 displays"; counters and rules are always counted, even when there are none.
 */
export function describeRules(game: Game): string {
  const parts = [count(game.counters?.length ?? 0, 'counter'), count(game.rules?.length ?? 0, 'rule')];
  if (game.ranking) parts.push(`ranked by ${game.ranking.by}`);
  if (game.hud?.length) parts.push(count(game.hud.length, 'display'));
  if (!game.win) parts.push('no highest-score win');
  return parts.join(', ');
}

/**
 * The rideable items of a place by model ("3 rideable items: 2 ground, 1 air"), or null when it
 * has none.
 */
export function describeRideables(world: WorldDocument): string | null {
  const byModel = { ground: 0, water: 0, air: 0 };
  let total = 0;
  for (const instance of world.instances) {
    const ride = rideFromParams(instance.params, getLibraryItem(instance.itemId)?.manifest.ride);
    if (!ride) continue;
    byModel[ride.model] += 1;
    total += 1;
  }
  if (total === 0) return null;
  const parts = (Object.entries(byModel) as Array<[string, number]>)
    .filter(([, n]) => n > 0)
    .map(([model, n]) => `${n} ${model}`);
  return `${count(total, 'rideable item')}: ${parts.join(', ')}`;
}

/** The most characters `get_game` answers with; a longer rule list comes in pages. */
export const GAME_JSON_LIMIT = 6000;

/**
 * The game's own data for the model (`get_game`): the clock and teams, counters, rules with
 * their index (what `remove_rules` takes), ranking, displays with their index and whether the
 * highest score wins. Rules from `fromRule` on are shown until the answer would pass
 * `GAME_JSON_LIMIT`; `more_rules_from` then names the next page.
 */
export function gameJson(game: Game, fromRule = 0, rideables: string | null = null): string {
  const base = {
    ...(rideables ? { rideable_items: rideables } : {}),
    minutes: r(game.match.durationSec / 60),
    teams: game.teams?.mode ?? 'none',
    highest_score_wins: game.win !== undefined,
    counters: game.counters ?? [],
    ranking: game.ranking ?? null,
    hud: (game.hud ?? []).map((binding, index) => ({ index, ...binding })),
  };
  const all = (game.rules ?? []).map((rule, index) => ({ index, ...rule }));
  const rules: typeof all = [];
  const text = (more?: number) =>
    JSON.stringify({ ...base, rules, ...(more === undefined ? {} : { more_rules_from: more }) });
  for (let i = fromRule; i < all.length; i++) {
    rules.push(all[i]!);
    // Room for the page marker too; the first rule of a page is always shown.
    if (text(all.length).length > GAME_JSON_LIMIT && rules.length > 1) {
      rules.pop();
      return text(i);
    }
  }
  return text();
}

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
