import type { AvatarPresentationEvent } from './presentation.js';
import {
  Game,
  newGame,
  PAINT_RULE_MAX_BOX,
  Ride,
  RIDE_PARAMS,
  RIDE_PRESETS,
  rideFromParams,
  rideToParams,
  SIZE_TIERS,
  WORLD_GENERATOR,
  AVAILABLE_WORLD_STYLES,
  supportsWorldStarter,
  ZONE_PARAMS,
  zoneFromParams,
  type CommandPayload,
  type SideMove,
  type WorldDocument,
} from '@genvr/contracts';
import {
  getCoreItem,
  describeGeneratedControls,
  describeOceanControls,
  generatedControlValueError,
  getGround,
  getLibraryItem,
  getOceanResource,
  itemFootprint,
  getRoadType,
  groundRef,
  queryLibrary,
  starterGroundMaterials,
  zoneShapeOfItem,
} from '@genvr/core-library';
import { generatedParamsError } from '@genvr/validator';
import {
  Block,
  decodeHeightTile,
  starterGround,
  starterWorldCommands,
  VOXEL_LAYERS,
  VOXEL_MIN_Y,
  worldHeightAt,
  BUILDING_WALL_MATERIAL,
  defaultRoofHeight,
  WALL_SURFACES,
  type TerrainData,
} from '@genvr/world';
import type { ScriptRecording } from '@genvr/contracts';
import type { ScriptLogLine } from '@genvr/script';
import { getScripts, getScriptLogs, scriptApi, setScript, testScript, type ScriptEngine } from './scripts.js';
import { BUILD_BLOCKS, isToolName, TOOL_ARGS, type ToolArgs, type ToolName } from './tools.js';
import {
  describeGame,
  describeRideables,
  describeRules,
  gameJson,
  WORLD_SUMMARY_PAGE,
  worldSummary,
} from './summary.js';

/** One chat message in the Ollama chat format. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  /** Name of the tool a `tool` message answers. */
  tool_name?: string;
}

export interface ToolCall {
  function: { name: string; arguments: Record<string, unknown> | string };
}

/** One model reply; `onText` receives the text as it streams in. */
export type ChatModel = (
  messages: ChatMessage[],
  onText: (delta: string) => void,
  signal?: AbortSignal,
  /** Place in the model's waiting line (P4-05): requests ahead, 0 once the model works on it. */
  onQueue?: (ahead: number) => void,
) => Promise<{ content: string; tool_calls: ToolCall[] }>;

/** What the assistant can see and change: the editor's world (the studio runtime). */
export interface AssistantHost {
  shareStudio?(input: ToolArgs<'share_studio'>): Promise<unknown>;
  presentAvatar?(event: AvatarPresentationEvent): string | null;
  presentationInfo?(): string;
  avatarVoice?(input: ToolArgs<'avatar_voice'>): Promise<unknown>;
  userAvatarLibrary?(input: ToolArgs<'user_avatar_library'>): Promise<unknown>;
  world(): WorldDocument;
  heightAt(x: number, z: number): number;
  /**
   * Where a new item stands at x, z (P2-11): ground, room floor, or on building parts; with
   * `on`, on top of that item. Null when `on` is unknown. Without it, items stand on the ground.
   */
  restingPoint?(x: number, z: number, on?: string): [number, number, number] | null;
  /**
   * The item's own placement rules at a spot (P2-11): null when it may stand there, otherwise
   * why not (a tree on sand, a bench facing a wall). Without it, every spot is allowed.
   */
  canStand?(itemId: string, position: [number, number, number], yaw?: number): string | null;
  /** Applies commands as one undo step; returns an error message, or null when all applied. */
  apply(commands: CommandPayload[]): string | null;
  /** Digs and fills a pond at x, z; returns an error message or null. */
  addWater(x: number, z: number): string | null;
  /** Where the builder stands and the way they face (radians, 0 = +z), for "here" and "in front". */
  focus(): { x: number; z: number; yaw?: number };
  /**
   * Side-view (2D) places (decision 93): the z of the line players move on (they start at the
   * spawn point); null or absent in 3D places. The camera looks at the line from the +z side.
   */
  sideLine?(): number | null;
  /** Extra moves the creator gave the side-view place (decision 95); none when absent. */
  sideMoves?(): readonly SideMove[];
  /**
   * Places made of 1 m blocks (P2-26): the block tools work, and `heightAt` is the top of the
   * blocks (the first free layer). False or absent elsewhere.
   */
  blockGround?(): boolean;
  /**
   * Catalog search by meaning (P4-03): approved items closest to the words, best first. Null or a
   * failure means it is not available; `search_catalog` then matches words only.
   */
  searchCatalog?(query: string, signal?: AbortSignal): Promise<CatalogHit[] | null>;
  /**
   * Whether an item that is not in the Core Library may be placed (an approved uploaded 3D model).
   * Hosts without a memory of earlier searches (MCP calls) answer it; checked before the items
   * `search_catalog` offered.
   */
  isPlaceable?(itemId: string): boolean;
  /**
   * The script engine (P2-10): the compile-only check and the dry run of `@genvr/script`. Without it the script
   * tools still list, write and check scripts statically, and `test_script` says dry runs are not available.
   */
  scripts?: ScriptEngine;
  /** The place's script log from its open room, after `since` (ms of the room clock); empty when none is open. */
  scriptLog?(since?: number): Promise<ScriptLogLine[]>;
  /** The script-visible events of the open room's last match and its seed (for `test_script`); null for none. */
  scriptRecording?(): Promise<ScriptRecording | null>;
}

/** One result of the catalog search by meaning. */
export interface CatalogHit {
  id: string;
  name: string;
  caption?: string | null;
  /** Store category; uploaded `3d-models` items can be placed (their packages load, P2-16). */
  category?: string;
}

/**
 * Uploaded items the search offered to each host: the model may place them although they are
 * not in the Core Library (the world loads their packages).
 */
const offered = new WeakMap<AssistantHost, Set<string>>();

export type AssistantEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool'; name: string; args: unknown; ok: boolean; result: string }
  | { type: 'ask'; question: string; options: string[] }
  | { type: 'done'; text: string }
  /** Waiting for the model: requests ahead in line (0 when it starts). */
  | { type: 'queue'; ahead: number };

export interface RunOptions {
  model: ChatModel;
  host: AssistantHost;
  /** Earlier messages of this conversation (without the system message). */
  history: ChatMessage[];
  prompt: string;
  onEvent: (event: AssistantEvent) => void;
  /** Model calls per request (each may call several tools). */
  maxSteps?: number;
  signal?: AbortSignal;
  random?: () => number;
}

/** Failed tool calls in a row before the assistant gives up (one retry after an error, plus one). */
const MAX_FAILURES = 2;

const newId = (prefix: string, random: () => number) =>
  `${prefix}-${Math.floor(random() * 2 ** 40)
    .toString(36)
    .padStart(8, '0')}`;
const round = (v: number) => Math.round(v * 100) / 100;
const yawQuat = (degrees: number): [number, number, number, number] => {
  const half = (degrees * Math.PI) / 360;
  return [0, round(Math.sin(half) * 1000) / 1000, 0, round(Math.cos(half) * 1000) / 1000];
};
/** A turn about y, then a lean toward the item's front (+z) about its own x (place_items). */
const turnAndLean = (turnDeg: number, leanDeg: number): [number, number, number, number] => {
  const y = (turnDeg * Math.PI) / 360;
  const x = (leanDeg * Math.PI) / 360;
  const r = (v: number) => Math.round(v * 1e6) / 1e6;
  return [
    r(Math.cos(y) * Math.sin(x)),
    r(Math.sin(y) * Math.cos(x)),
    r(-Math.sin(y) * Math.sin(x)),
    r(Math.cos(y) * Math.cos(x)),
  ];
};
const circle = (x: number, z: number, radius: number, sides = 16): Array<[number, number]> =>
  Array.from({ length: sides }, (_, i) => {
    const a = (i / sides) * Math.PI * 2;
    return [round(x + Math.cos(a) * radius), round(z + Math.sin(a) * radius)];
  });

/**
 * Whether ground stored before a world was given still stands at its old height (P2-40): a stored
 * chunk beats the generator, so the builder is told rather than surprised. Measured on the ground
 * the host draws, every 8 m, because the document does not list chunks that are not saved yet.
 */
function keptOldGround(host: AssistantHost, fresh: TerrainData, half: number): boolean {
  // Against the fresh world with its water in, so the river's own bed is not mistaken for it.
  for (let x = -half; x <= half; x += 8)
    for (let z = -half; z <= half; z += 8)
      if (Math.abs(host.heightAt(x, z) - fresh.heightAt(x, z)) > 0.05) return true;
  return false;
}

/** Ids `starterWorldCommands` gives the things around the spawn (P2-40). */
const SPAWN_RING_ID = /^spawn-\d+$/;

/** Why a height-field tool does nothing in a block place (P2-26). */
const BLOCK_GROUND_REFUSAL =
  'this place is made of blocks, so it has no smooth ground to give a world or cover to. Use fill_blocks and block_floor here.';

/** How far in front of the builder "here" is, and the space kept free around them. */
const FRONT_DISTANCE = 12;
const BUILDER_ROOM = 2.5;

/**
 * Side-view places (P2-23): items this close to the players' line are put exactly on it, and
 * nothing goes more than `cameraSide` in front of it (between the camera and the players).
 * Platforms are `depth` deep across the line and `thickness` thick when they hang in the air.
 * Scattered scenery stays behind `path`, so the way is free.
 */
const SIDE = { snap: 1.5, cameraSide: 1, depth: 2, path: 1.5, thickness: 0.4 } as const;
/**
 * What players jump in a side-view place without running (runtime: 7 m/s up, gravity 22,
 * walking 4.5 m/s): about 1.1 m up; about 3 m across at the same height, about 1.9 m when going
 * 1 m up. Tried live: walking gaps of 2.5 m going up 1 m were too far.
 */
const JUMP = { up: 1, across: 3, acrossUp: 1.5 } as const;

/**
 * How far players jump with the place's moves (decision 95). A second jump at the top of the
 * first reaches about 2.2 m and stays up about twice as long; a dash in the air adds about 2.5 m
 * across (14 m/s for 0.18 s). The numbers keep some room, like the plain jump's.
 */
export function jumpReach(moves: readonly SideMove[]): { up: number; across: number; acrossUp: number } {
  const reach = moves.includes('double-jump') ? { up: 1.8, across: 4, acrossUp: 2.5 } : { ...JUMP };
  if (moves.includes('dash')) {
    reach.across += 2;
    reach.acrossUp += 2;
  }
  return reach;
}

/** Friendly names of the moves for the prompt. */
const MOVE_NAMES: Record<SideMove, string> = {
  'double-jump': 'a double jump (jump again in the air)',
  'wall-jump': 'a wall jump (jump off a wall while in the air)',
  dash: 'a dash (a short fast burst sideways)',
};
/** The Core ladder's height, and how far past a platform's edge its middle stands (half its depth). */
const LADDER_HEIGHT = 3;
const LADDER_OFFSET = 0.05;

function inFront(focus: { x: number; z: number; yaw?: number }, line: number | null) {
  const yaw = focus.yaw ?? 0;
  // In a side-view place "here" is along the line, on the side the builder faces.
  if (line !== null)
    return { x: Math.round(focus.x + (Math.sin(yaw) < 0 ? -1 : 1) * FRONT_DISTANCE), z: round(line) };
  return {
    x: Math.round(focus.x + Math.sin(yaw) * FRONT_DISTANCE),
    z: Math.round(focus.z + Math.cos(yaw) * FRONT_DISTANCE),
  };
}

/** Blocks one set_blocks command may change, and one assistant request at most (split into commands). */
const SET_BLOCKS_LIMIT = 4096;
const MAX_BLOCK_CHANGES = 32_768;

type BlockChange = [number, number, number, number];

/** Whole-block columns from one corner to the other, both included. */
function columns(a: { x1: number; z1: number; x2: number; z2: number }): Array<[number, number]> {
  const [x0, x1] = [Math.floor(Math.min(a.x1, a.x2)), Math.floor(Math.max(a.x1, a.x2))];
  const [z0, z1] = [Math.floor(Math.min(a.z1, a.z2)), Math.floor(Math.max(a.z1, a.z2))];
  const list: Array<[number, number]> = [];
  for (let z = z0; z <= z1; z += 1) for (let x = x0; x <= x1; x += 1) list.push([x, z]);
  return list;
}

/** The block columns a line through the points crosses, each once. */
function lineColumns(points: ReadonlyArray<readonly [number, number]>): Array<[number, number]> {
  const seen = new Set<string>();
  const list: Array<[number, number]> = [];
  for (let i = 1; i < points.length; i += 1) {
    const [ax, az] = points[i - 1]!;
    const [bx, bz] = points[i]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) * 4));
    for (let s = 0; s <= steps; s += 1) {
      const x = Math.floor(ax + ((bx - ax) * s) / steps);
      const z = Math.floor(az + ((bz - az) * s) / steps);
      if (seen.has(`${x},${z}`)) continue;
      seen.add(`${x},${z}`);
      list.push([x, z]);
    }
  }
  return list;
}

/** The block rules for the system prompt (places made of blocks, P2-26). */
function blockRules(): string[] {
  return [
    '- This place is made of 1 m blocks, like a block-building game. Build with blocks: fill_blocks (towers, platforms, huts with hollow: true), block_line (walls and fences along the ground), block_floor (squares, paths, beaches), dig_blocks (holes, pits, moats).',
    `- Blocks: ${BUILD_BLOCKS.join(', ')}. Corners are whole blocks and both are included; heights count blocks up from the ground.`,
    '- Items (trees, benches, lamps) stand on the blocks. Roads and walls you draw are made of blocks too.',
  ];
}

/** The side-view rules for the system prompt. */
function sideRules(line: number, half: number, moves: readonly SideMove[]): string[] {
  const z = round(line);
  const reach = jumpReach(moves);
  return [
    `- This is a 2D place seen from the side, like a platform game. Players only move left and right (x from -${half} to ${half}) on the line z=${z}, and jump; the camera looks at the line from the front (larger z).`,
    `- Build the game on the line (z=${z}): things to walk on, jump onto, or climb. Use build_platforms once for a course of platforms (it keeps every jump possible; ladder: true puts a ladder at its end), and a ladder (genvr.core.ladder) on the line to climb higher.`,
    moves.length
      ? `- Players here also have ${moves.map((move) => MOVE_NAMES[move]).join(', ')}. Use them: courses can be higher and gaps wider${moves.includes('wall-jump') ? ', and tall walls are for jumping off' : ''}.`
      : '- Players here have no extra moves: only walking and a normal jump.',
    `- Players jump about ${reach.up} m up and ${reach.across} m across; keep gaps and steps within that.`,
    `- Put scenery (trees, houses, hills) behind the line, at z between ${z - 15} and ${z - 3}. Never put anything at z above ${z + SIDE.cameraSide}: it would hide the players.`,
  ];
}

/**
 * The place-specific lines of the system prompt: the side-view line and jump reach, and the block
 * rules. Empty for a plain 3D place. Other doors to the tools (MCP) send the same notes.
 */
export function placeNotes(host: AssistantHost): string[] {
  const half = SIZE_TIERS[host.world().sizeTier].sideMeters / 2;
  const line = host.sideLine?.() ?? null;
  return [
    ...(line !== null ? sideRules(line, half, host.sideMoves?.() ?? []) : []),
    ...(host.blockGround?.() ? blockRules() : []),
  ];
}

export function systemPrompt(host: AssistantHost): string {
  const world = host.world();
  const half = SIZE_TIERS[world.sizeTier].sideMeters / 2;
  const focus = host.focus();
  const line = host.sideLine?.() ?? null;
  const front = inFront(focus, line);
  return [
    'You are the Genvr build assistant. You build 3D places for kids and teens by calling tools.',
    ...(host.presentAvatar ? ['Avatar presentation is available via present_avatar. Use it only when helpful; gestures and expressions are optional. Do not claim that a display card performs a real external action.', host.presentationInfo?.() ?? ''] : []),
    'Rules:',
    '- Always act with tools; never write code. Keep replies to one or two short, friendly sentences.',
    `- The ground is the x-z plane in meters, from -${half} to ${half}. y is up; heights are automatic.`,
    `- The builder stands at x=${Math.round(focus.x)}, z=${Math.round(focus.z)}. Never build on that spot.`,
    `- "Here" or "in front of me" means around x=${front.x}, z=${front.z} (${FRONT_DISTANCE} m in front of the builder).`,
    '- Use item ids from search_catalog or the list below. Never invent ids.',
    '- Ask with ask_user only when a choice really matters; otherwise pick something nice.',
    '- Keep places safe and friendly for kids.',
    ...placeNotes(host),
    '',
    'Items you can place:',
    ...queryLibrary({ type: 'model', style: world.style.base })
      .slice(0, 60)
      .map((entry) => `- ${entry.manifest.id}: ${entry.manifest.name}`),
    '',
    'The place now:',
    worldSummary(world, 30),
  ].join('\n');
}

/** Parses tool arguments (models send an object or a JSON string). */
function parseArgs(name: ToolName, raw: unknown) {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = raw.trim() ? JSON.parse(raw) : {};
    } catch {
      return { error: 'Arguments are not valid JSON.' };
    }
  }
  const parsed = TOOL_ARGS[name].safeParse(value ?? {});
  // A common mix-up: a time of day sent as weather.
  const preset = (value as { preset?: unknown } | null)?.preset;
  if (
    !parsed.success &&
    name === 'set_weather' &&
    (preset === 'sunset' || preset === 'night' || preset === 'day')
  )
    return { error: `${preset} is a sky, not a weather. Call set_sky with preset "${preset}".` };
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error: `Invalid ${issue?.path.join('.') || 'arguments'}: ${issue?.message ?? 'check the values'}`,
    };
  }
  return { args: parsed.data };
}

/** What one tool call did: its answer for the model, and a question for the builder (ask_user). */
export interface Outcome {
  ok: boolean;
  result: string;
  ask?: { question: string; options: string[] };
}

/** Runs one tool call against the host. */
export function executeTool(
  name: ToolName,
  args: unknown,
  host: AssistantHost,
  random: () => number = Math.random,
): Outcome {
  const done = (error: string | null, success: string): Outcome =>
    error ? { ok: false, result: `Error: ${error}` } : { ok: true, result: success };
  // Per-axis sizes (width, height, depth) only for parts, as the studio's Properties offer them; else the uniform size.
  const scaleOf = (
    itemId: string,
    size: number | undefined,
    stretch: [number, number, number] | undefined,
  ): { scale: [number, number, number] } | { error: string } => {
    if (!stretch) {
      const s = size ?? 1;
      return { scale: [s, s, s] };
    }
    if (!getCoreItem(itemId)?.resizable)
      return { error: `${itemId} cannot be stretched; only parts (Box, Wedge, Ball, Cylinder) can. Use size.` };
    return { scale: stretch.map(round) as [number, number, number] };
  };
  const world = host.world();
  const half = SIZE_TIERS[world.sizeTier].sideMeters / 2;
  const inside = (x: number, z: number) => Math.abs(x) <= half && Math.abs(z) <= half;
  const line = host.sideLine?.() ?? null;
  const unknownItem = (id: string) => {
    const core = getCoreItem(id);
    if (core && !core.manifest.styles.includes(world.style.base)) return `Item "${id}" does not support the ${world.style.base} world style. Use search_catalog for compatible items.`;
    return core || host.isPlaceable?.(id) || offered.get(host)?.has(id) ? null : `Unknown item "${id}". Use search_catalog to find item ids.`;
  };
  // Block places (P2-26): the top of the blocks in a column, and the changes as commands.
  const ground = (x: number, z: number) => Math.round(host.heightAt(x + 0.5, z + 0.5));
  const builder = host.focus();
  const builderColumn = [Math.floor(builder.x), Math.floor(builder.z)] as const;
  const applyBlocks = (changes: BlockChange[], success: string): Outcome => {
    if (!host.blockGround?.())
      return {
        ok: false,
        result: 'Error: this place has no blocks. Use place_item, draw_wall, and sculpt_terrain here.',
      };
    // Only real places inside the world; nobody gets walled in where the builder stands.
    const valid = changes.filter(
      ([x, y, z, block]) =>
        inside(x + 0.5, z + 0.5) &&
        y > VOXEL_MIN_Y &&
        y < VOXEL_MIN_Y + VOXEL_LAYERS &&
        !(block !== Block.air && x === builderColumn[0] && z === builderColumn[1] && y >= ground(x, z)),
    );
    if (valid.length === 0) return { ok: false, result: 'Error: that is outside the place.' };
    if (valid.length > MAX_BLOCK_CHANGES)
      return {
        ok: false,
        result: `Error: that is ${valid.length} blocks; at most ${MAX_BLOCK_CHANGES} at once. Build it in smaller parts.`,
      };
    const commands: CommandPayload[] = [];
    for (let i = 0; i < valid.length; i += SET_BLOCKS_LIMIT)
      commands.push({ type: 'set_blocks', params: { blocks: valid.slice(i, i + SET_BLOCKS_LIMIT) } });
    return done(host.apply(commands), success.replace('{count}', String(valid.length)));
  };

  switch (name) {
    case 'share_studio': return {ok:false,result:'Use the asynchronous tool runner for sharing.'};
    case 'avatar_voice': return { ok:false, result:'Use the asynchronous tool runner for voice operations.' };
    case 'user_avatar_library': return { ok: false, result: 'Use the asynchronous tool runner for private library operations.' };
    case 'present_avatar': {
      if (!host.presentAvatar) return { ok: false, result: 'Avatar presentation is not enabled in this host.' };
      const error = host.presentAvatar((args as ToolArgs<'present_avatar'>).event);
      return { ok: !error, result: error ?? 'Avatar presentation updated.' };
    }
    case 'get_resource_controls': {
      const { item_id } = args as ToolArgs<'get_resource_controls'>;
      const entry = getLibraryItem(item_id);
      const ocean = describeOceanControls(item_id);
      if (entry && ocean)
        return {
          ok: true,
          result: JSON.stringify({
            item_id,
            ...ocean,
            styles: entry.manifest.styles,
            apply_tool: 'set_sea',
            resource_argument: 'resource_id',
            control_arguments: {
              level: 'level',
              direction: 'swell.direction',
              period: 'swell.period',
              height: 'swell.height',
            },
            reset:
              'Pass swell:null to restore automatic direction and source defaults. Omitted swell preserves it; a swell object replaces the override. Pass level:null to remove the sea.',
            creator_package_controls: false,
          }),
        };
      if (!entry || !getCoreItem(item_id))
        return { ok: false, result: 'Resource is not a supported Core model or ocean in the library.' };
      const info = describeGeneratedControls(item_id);
      return {
        ok: true,
        result: JSON.stringify({
          item_id,
          scope: 'instance',
          ...(info ?? { controls: [] }),
          reset: 'Set a supported key to null to inherit its resource default.',
          world_defaults: false,
          creator_package_controls: false,
        }),
      };
    }
    case 'set_resource_params': {
      const a = args as ToolArgs<'set_resource_params'>;
      const instance = world.instances.find((item) => item.instanceId === a.instance_id);
      if (!instance)
        return { ok: false, result: 'Placed item not found. Read get_world_summary for instance ids.' };
      const info = describeGeneratedControls(instance.itemId);
      if (!info) return { ok: false, result: 'This item has no supported generated controls.' };
      const merged = { ...instance.params };
      for (const [key, value] of Object.entries(a.params)) {
        const control = info.controls.find((entry) => entry.key === key);
        if (!control) return { ok: false, result: `Unsupported resource control: ${key}.` };
        if (value === null) delete merged[key];
        else {
          const error = generatedControlValueError(control, value);
          if (error) return { ok: false, result: error };
          merged[key] = value;
        }
      }
      const error = generatedParamsError(instance.itemId, merged);
      if (error) return { ok: false, result: error };
      return done(
        host.apply([
          { type: 'set_item_params', params: { instanceId: instance.instanceId, params: a.params } },
        ]),
        JSON.stringify({
          instance_id: instance.instanceId,
          values: Object.fromEntries(
            info.controls.map((control) => [control.key, merged[control.key] ?? control.default]),
          ),
          scope: 'instance',
        }),
      );
    }
    case 'get_world_summary': {
      const { from_item } = args as ToolArgs<'get_world_summary'>;
      return { ok: true, result: worldSummary(world, WORLD_SUMMARY_PAGE, from_item ?? 0) };
    }
    case 'get_game': {
      const { from_rule } = args as ToolArgs<'get_game'>;
      return {
        ok: true,
        result: world.game
          ? gameJson(world.game, from_rule, describeRideables(world))
          : 'The place has no game.',
      };
    }
    case 'search_catalog': {
      const { query } = args as ToolArgs<'search_catalog'>;
      const { found, list } = wordSearch(query, world.style.base);
      return {
        ok: true,
        result:
          (found ? '' : 'Nothing matched; every item:\n') +
          list
            .map((entry) => `${entry.id}: ${entry.name}${entry.caption ? ` (${entry.caption})` : ''}`)
            .join('\n'),
      };
    }
    case 'place_item': {
      const a = args as ToolArgs<'place_item'>;
      const missing = unknownItem(a.itemId);
      if (missing) return { ok: false, result: `Error: ${missing}` };
      if (!inside(a.x, a.z)) return { ok: false, result: `Error: (${a.x}, ${a.z}) is outside the place.` };
      if (line !== null) {
        // Side view: on the line when close to it, never between the camera and the players.
        if (a.z > line + SIDE.cameraSide)
          return {
            ok: false,
            result: `Error: z=${a.z} is between the camera and the players. Use z=${round(line)} (on the line) or a smaller z for scenery behind it.`,
          };
        if (Math.abs(a.z - line) <= SIDE.snap) a.z = line;
      }
      const instanceId = newId('item', random);
      const point = host.restingPoint
        ? host.restingPoint(round(a.x), round(a.z), a.on)
        : [a.x, host.heightAt(a.x, a.z), a.z];
      if (!point) return { ok: false, result: `Error: there is no item ${a.on} to stand it on.` };
      const [x, y, z] = point.map(round) as [number, number, number];
      const sized = scaleOf(a.itemId, a.size, a.stretch);
      if ('error' in sized) return done(sized.error, '');
      const plain = sized.scale.every((v) => v === 1);
      // The item's own rules (P2-11); the host checks items at their normal size.
      const refused = plain ? host.canStand?.(a.itemId, [x, y, z], ((a.turn ?? 0) * Math.PI) / 180) : null;
      if (refused) return { ok: false, result: `Error: ${refused} Choose another spot.` };
      return done(
        host.apply([
          {
            type: 'place_item',
            params: {
              instanceId,
              itemId: a.itemId,
              position: [x, y, z],
              rotation: yawQuat(a.turn ?? 0),
              ...(plain ? {} : { scale: sized.scale }),
              ...(a.color ? { itemParams: { color: a.color } } : {}),
              // The spot above is the hint; the rest law sets the height and lean (P2-43).
              rest: true,
            },
          },
        ]),
        `Placed ${a.itemId} as ${instanceId} at (${x}, ${z})${a.on ? ` on ${a.on}` : ''}.`,
      );
    }
    case 'scatter_items': {
      const a = args as ToolArgs<'scatter_items'>;
      for (const id of a.itemIds) {
        const missing = unknownItem(id);
        if (missing) return { ok: false, result: `Error: ${missing}` };
      }
      const commands: CommandPayload[] = [];
      const builder = host.focus();
      let skipped = 0;
      let behind = 0;
      // Keep scattered items apart so trees do not grow into each other; dense requests (many
      // items in a small circle) get less room each.
      const spacing = Math.min(2, 0.8 * Math.sqrt((Math.PI * a.radius * a.radius) / a.count));
      const chosen: Array<[number, number]> = [];
      for (let i = 0; i < a.count; i += 1) {
        // Even spread over the disc (square root), random turn; a few tries to find room.
        let x = 0;
        let z = 0;
        for (let attempt = 0; attempt < 6; attempt += 1) {
          const r = a.radius * Math.sqrt(random());
          const angle = random() * Math.PI * 2;
          x = round(a.x + Math.cos(angle) * r);
          z = round(a.z + Math.sin(angle) * r);
          if (!chosen.some(([cx, cz]) => Math.hypot(cx - x, cz - z) < spacing)) break;
        }
        if (chosen.some(([cx, cz]) => Math.hypot(cx - x, cz - z) < spacing)) continue;
        // Keep the builder free (a forest "here" should not grow through them).
        if (!inside(x, z) || Math.hypot(x - builder.x, z - builder.z) < BUILDER_ROOM) continue;
        // Side view: scenery stays behind the players' line, off their path.
        if (line !== null && z > line - SIDE.path) {
          behind += 1;
          continue;
        }
        const itemId = a.itemIds[i % a.itemIds.length]!;
        const turn = Math.round(random() * 360);
        const position: [number, number, number] = [
          x,
          round(host.restingPoint?.(x, z)?.[1] ?? host.heightAt(x, z)),
          z,
        ];
        // Spots that break the item's rules are left out (no trees in the pond or on the road).
        if (host.canStand?.(itemId, position, (turn * Math.PI) / 180)) {
          skipped += 1;
          continue;
        }
        chosen.push([x, z]);
        commands.push({
          type: 'place_item',
          params: {
            instanceId: newId('item', random),
            itemId,
            position,
            rotation: yawQuat(turn),
            // Hint only: the rest law sets the height (P2-43).
            rest: true,
          },
        });
      }
      if (commands.length === 0)
        return {
          ok: false,
          result: skipped
            ? 'Error: those items cannot stand anywhere in that circle (wrong ground, water, or too steep).'
            : behind && line !== null
              ? `Error: this is a side-view place; scatter scenery behind the players' line, around z=${round(line - SIDE.path - a.radius - 1)}.`
              : 'Error: the area is outside the place.',
        };
      return done(
        host.apply(commands),
        `Placed ${commands.length} items around (${a.x}, ${a.z})${skipped ? `; ${skipped} spots did not suit them` : ''}${behind ? `; ${behind} spots on or in front of the players' line were left free` : ''}.`,
      );
    }
    case 'build_platforms': {
      const a = args as ToolArgs<'build_platforms'>;
      if (line === null)
        return {
          ok: false,
          result: 'Error: build_platforms is for side-view (2D) places. Use place_item here.',
        };
      const floating = a.floating ?? true;
      const jump = jumpReach(host.sideMoves?.() ?? []);
      // Every jump stays possible (small models do not fix gaps well): from the ground onto the
      // first platform and from each to the next, too high steps are lowered and too wide gaps
      // are closed by moving the platform toward the one before.
      let [moved, lowered] = [0, 0];
      let previous: { right: number; top: number } | null = null;
      const commands: CommandPayload[] = [];
      for (const platform of [...a.platforms].sort((p, q) => p.x - q.x)) {
        const width = platform.width ?? 3;
        let x = platform.x;
        let top = host.heightAt(x, line) + platform.height;
        const reach = previous ? previous.top : host.heightAt(x, line);
        if (top - reach > jump.up) {
          top = reach + jump.up;
          lowered += 1;
        }
        if (previous) {
          const across = top - previous.top > jump.up / 2 ? jump.acrossUp : jump.across;
          if (x - width / 2 - previous.right > across) {
            x = previous.right + across + width / 2;
            moved += 1;
          }
        }
        const [left, right] = [x - width / 2, x + width / 2];
        if (!inside(left, line) || !inside(right, line))
          return { ok: false, result: `Error: a platform at x=${round(x)} is outside the place.` };
        const ground = host.heightAt(x, line);
        // Solid blocks reach down to the lowest ground under them; thin ones hang in the air.
        const low = Math.min(ground, host.heightAt(left, line), host.heightAt(right, line));
        const thin = floating && top - SIDE.thickness > ground + 0.05;
        const bottom = round(thin ? top - SIDE.thickness : low);
        commands.push({
          type: 'place_item',
          params: {
            instanceId: newId('platform', random),
            itemId: 'genvr.core.part.box',
            position: [round(x), bottom, round(line)],
            scale: [round(width), round(Math.max(0.2, top - bottom)), SIDE.depth],
            itemParams: { color: a.color ?? '#8d6e63' },
            // Platforms in the air are meant to be there (the world checks leave them).
            ...(thin ? { floats: true } : {}),
          },
        });
        previous = { right, top };
      }
      const changes = [moved ? `moved ${moved} closer` : '', lowered ? `lowered ${lowered}` : ''].filter(
        Boolean,
      );
      const where = commands.map((command) =>
        command.type === 'place_item' ? `x=${command.params.position[0]}` : '',
      );
      const count = commands.length;
      const end = previous!;
      // A ladder on the far edge of the last platform, from the ground up to its top, facing away
      // from it (the Core ladder is 3 m high; it is stretched to fit).
      const ladderX = round(end.right + LADDER_OFFSET);
      const ladderGround = host.heightAt(ladderX, line);
      const climb = round(end.top - ladderGround);
      const ladder = a.ladder === true && climb > 0.3;
      if (ladder)
        commands.push({
          type: 'place_item',
          params: {
            instanceId: newId('item', random),
            itemId: 'genvr.core.ladder',
            position: [ladderX, round(ladderGround), round(line)],
            rotation: yawQuat(90),
            scale: [1, round(climb / LADDER_HEIGHT), 1],
          },
        });
      return done(
        host.apply(commands),
        `Built ${count} platforms on the players' line (z=${round(line)}) at ${where.join(', ')}; the course ends at x=${round(end.right)}, ${round(end.top - host.heightAt(end.right, line))} m above the ground.${ladder ? ` A ladder at x=${ladderX} goes from the ground up to the last platform.` : ''} ${changes.length ? `I ${changes.join(' and ')} so players can jump from one to the next. ` : ''}Every jump works; do not build them again.`,
      );
    }
    case 'fill_blocks': {
      const a = args as ToolArgs<'fill_blocks'>;
      const block = Block[a.block];
      // A hollow box is a hut: tall enough to walk in (models often leave the height out).
      const height = a.hollow ? Math.max(3, a.height ?? 4) : (a.height ?? 1);
      const raise = a.raise ?? 0;
      const area = columns(a);
      const [xs, zs] = [area.map(([x]) => x), area.map(([, z]) => z)];
      const [minX, maxX, minZ, maxZ] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
      const [middleX, middleZ] = [Math.floor((minX + maxX) / 2), Math.floor((minZ + maxZ) / 2)];
      // One flat box from the ground in its middle; standing on the ground (raise 0), each
      // column also reaches down to its own ground so it never floats over a dip.
      const bottom = ground(middleX, middleZ) + raise;
      const top = bottom + height - 1;
      // A hut gets a doorway two blocks high in the middle of the side facing the builder.
      const [dx, dz] = [builder.x - (minX + maxX + 1) / 2, builder.z - (minZ + maxZ + 1) / 2];
      const door =
        a.hollow && maxX - minX >= 2 && maxZ - minZ >= 2
          ? Math.abs(dx) > Math.abs(dz)
            ? { x: dx > 0 ? maxX : minX, z: middleZ }
            : { x: middleX, z: dz > 0 ? maxZ : minZ }
          : null;
      const changes: BlockChange[] = [];
      for (const [x, z] of area) {
        const low = raise === 0 && !a.hollow ? Math.min(bottom, ground(x, z)) : bottom;
        for (let y = low; y <= top; y += 1) {
          const shell = x === minX || x === maxX || z === minZ || z === maxZ || y === bottom || y === top;
          const doorway = door && x === door.x && z === door.z && (y === bottom + 1 || y === bottom + 2);
          changes.push([x, y, z, a.hollow && (!shell || doorway) ? Block.air : block]);
        }
      }
      return applyBlocks(
        changes,
        `Filled {count} blocks of ${a.block} from (${minX}, ${minZ}) to (${maxX}, ${maxZ}), ${height} high${a.hollow ? `, hollow inside${door ? ` with a doorway at (${door.x}, ${door.z})` : ''}` : ''}; its top is at y=${top + 1}.`,
      );
    }
    case 'block_line': {
      const a = args as ToolArgs<'block_line'>;
      const block = Block[a.block];
      const height = a.height ?? 2;
      const changes: BlockChange[] = [];
      for (const [x, z] of lineColumns(a.points)) {
        const from = ground(x, z);
        for (let y = from; y < from + height; y += 1) changes.push([x, y, z, block]);
      }
      return applyBlocks(changes, `Built a line of {count} ${a.block} blocks, ${height} high.`);
    }
    case 'block_floor': {
      const a = args as ToolArgs<'block_floor'>;
      const block = Block[a.block];
      const changes = columns(a).map(([x, z]): BlockChange => [x, ground(x, z) - 1, z, block]);
      return applyBlocks(changes, `Changed the top of {count} ground blocks to ${a.block}.`);
    }
    case 'dig_blocks': {
      const a = args as ToolArgs<'dig_blocks'>;
      const changes: BlockChange[] = [];
      for (const [x, z] of columns(a)) {
        const from = ground(x, z);
        for (let y = from - a.depth; y < from; y += 1) changes.push([x, y, z, Block.air]);
      }
      return applyBlocks(
        changes,
        `Dug {count} blocks away, ${a.depth} deep (low holes next to water fill with water).`,
      );
    }
    case 'move_item': {
      const a = args as ToolArgs<'move_item'>;
      const instance = world.instances.find((i) => i.instanceId === a.instanceId);
      if (!instance)
        return {
          ok: false,
          result: `Error: no placed item "${a.instanceId}". Use get_world_summary for ids.`,
        };
      if (
        a.x === undefined &&
        a.z === undefined &&
        a.turn === undefined &&
        a.size === undefined &&
        a.stretch === undefined
      )
        return { ok: false, result: 'Error: give a new x and z, a turn, a size or a stretch.' };
      const [oldX, , oldZ] = instance.transform.position;
      let targetX = a.x ?? oldX;
      let targetZ = a.z ?? oldZ;
      if (!inside(targetX, targetZ))
        return { ok: false, result: `Error: (${targetX}, ${targetZ}) is outside the place.` };
      if (line !== null && a.z !== undefined) {
        // Side view, as place_item: on the line when close to it, never between camera and players.
        if (targetZ > line + SIDE.cameraSide)
          return {
            ok: false,
            result: `Error: z=${targetZ} is between the camera and the players. Use z=${round(line)} (on the line) or a smaller z for scenery behind it.`,
          };
        if (Math.abs(targetZ - line) <= SIDE.snap) targetZ = line;
      }
      [targetX, targetZ] = [round(targetX), round(targetZ)];
      const point = host.restingPoint?.(targetX, targetZ) ?? [
        targetX,
        host.heightAt(targetX, targetZ),
        targetZ,
      ];
      const [x, y, z] = point.map(round) as [number, number, number];
      const [qx, qy, qz, qw] = instance.transform.rotation;
      const rotation: [number, number, number, number] =
        a.turn !== undefined ? yawQuat(a.turn) : [qx, qy, qz, qw];
      const [sx, sy, sz] = instance.transform.scale;
      let scale: [number, number, number] = [sx, sy, sz];
      if (a.size !== undefined || a.stretch !== undefined) {
        const sized = scaleOf(instance.itemId, a.size, a.stretch);
        if ('error' in sized) return done(sized.error, '');
        scale = sized.scale;
      }
      // The item's own rules (P2-11), checked at its normal size as place_item does.
      const yaw = 2 * Math.atan2(rotation[1], rotation[3]);
      const refused = scale.every((s) => s === 1) ? host.canStand?.(instance.itemId, [x, y, z], yaw) : null;
      if (refused) return { ok: false, result: `Error: ${refused} Choose another spot.` };
      return done(
        host.apply([
          {
            type: 'transform_item',
            // The spot is the hint; the rest law sets the height and lean (P2-43).
            params: { instanceId: instance.instanceId, position: [x, y, z], rotation, scale, rest: true },
          },
        ]),
        `Moved ${instance.instanceId} to (${x}, ${z}).`,
      );
    }
    case 'remove_items': {
      const { instanceIds } = args as ToolArgs<'remove_items'>;
      const existing = new Set(world.instances.map((i) => i.instanceId));
      const missing = instanceIds.filter((id) => !existing.has(id));
      if (missing.length) return { ok: false, result: `Error: no items with ids ${missing.join(', ')}.` };
      return done(
        host.apply(instanceIds.map((instanceId) => ({ type: 'remove_item', params: { instanceId } }))),
        `Removed ${instanceIds.length} items.`,
      );
    }
    case 'draw_road': {
      const a = args as ToolArgs<'draw_road'>;
      const type = getRoadType(`genvr.core.road.${a.roadType ?? 'street'}`);
      const roadId = newId('road', random);
      return done(
        host.apply([
          {
            type: 'draw_road',
            params: {
              roadId,
              points: a.points.map(([x, z]) => [round(x), round(z)]),
              width: type.width,
              materialId: type.id,
              ...(a.lanes ? { lanes: a.lanes } : {}),
              ...(a.oneway ? { oneway: true } : {}),
            },
          },
        ]),
        `Drew a ${type.name} (${roadId}).`,
      );
    }
    case 'pave_area': {
      const a = args as ToolArgs<'pave_area'>;
      const materials = {
        slabs: 'genvr.core.ground.large-grey-tiles',
        asphalt: 'genvr.core.ground.asphalt-02',
        pavers: 'genvr.core.ground.concrete-pavers-02',
      } as const;
      const pavingId = newId('paving', random);
      return done(
        host.apply([
          {
            type: 'add_paving',
            params: {
              pavingId,
              area: a.points.map(([x, z]) => [round(x), round(z)]),
              materialId: materials[a.material ?? 'slabs'],
            },
          },
        ]),
        `Paved an area in ${a.material ?? 'slabs'} (${pavingId}).`,
      );
    }
    case 'draw_wall': {
      const a = args as ToolArgs<'draw_wall'>;
      // Models often repeat the first corner at the end of a room; the room closes by itself.
      const [first, last] = [a.points[0]!, a.points.at(-1)!];
      if (a.closed && a.points.length > 3 && first[0] === last[0] && first[1] === last[1])
        a.points = a.points.slice(0, -1);
      const wallId = newId('wall', random);
      return done(
        host.apply([
          {
            type: 'draw_wall',
            params: {
              wallId,
              points: a.points.map(([x, z]) => [round(x), round(z)]),
              closed: a.closed ?? false,
              ...(a.height ? { height: a.height } : {}),
              ...(a.material && a.material !== 'plaster' ? { materialId: WALL_SURFACES[a.material] } : {}),
            },
          },
        ]),
        `Drew a ${a.closed ? 'room' : 'wall'} (${wallId}).`,
      );
    }
    case 'build_house': {
      const a = args as ToolArgs<'build_house'>;
      const [first, last] = [a.points[0]!, a.points.at(-1)!];
      if (a.points.length > 3 && first[0] === last[0] && first[1] === last[1]) a.points = a.points.slice(0, -1);
      const points = a.points.map(([x, z]) => [round(x), round(z)] as [number, number]);
      const levels = a.levels ?? 2;
      const roof = a.roof ?? 'gabled';
      const wallId = newId('house', random);
      return done(
        host.apply([
          {
            type: 'draw_wall',
            params: {
              wallId,
              points,
              closed: true,
              height: a.height ?? levels * 3,
              materialId: BUILDING_WALL_MATERIAL,
              // Seen from outside: the ground stays as it is, like the real town houses (R4b).
              grade: false,
              building: {
                facade: a.facade ?? 'plaster',
                levels,
                roofShape: roof,
                ...(roof !== 'flat' ? { roofHeight: a.roofHeight ?? defaultRoofHeight(points, roof) } : {}),
                ...(a.facadeColor ? { facadeColor: a.facadeColor } : {}),
                ...(a.roofMaterial ? { roofMaterial: a.roofMaterial } : {}),
                ...(a.roofColor ? { roofColor: a.roofColor } : {}),
              },
              ...(a.name ? { name: a.name } : {}),
            },
          },
        ]),
        `Built a house (${wallId}).`,
      );
    }
    case 'add_water': {
      const a = args as ToolArgs<'add_water'>;
      return done(host.addWater(a.x, a.z), `Added water at (${a.x}, ${a.z}).`);
    }
    case 'draw_river': {
      const a = args as ToolArgs<'draw_river'>;
      const outside = a.points.find(([x, z]) => !inside(x, z));
      if (outside) return done(`The point (${outside[0]}, ${outside[1]}) is outside the place.`, '');
      const width = a.width ?? 8;
      return done(
        host.apply([
          {
            type: 'draw_river',
            params: { riverId: newId('river', random), points: a.points, width, flow: a.flow ?? 1.5 },
          },
        ]),
        // The builder is told whether this river can be swum in, because the width decides it.
        `River drawn, ${width} m wide. It carves its bed and runs downhill` +
          (width >= 11 ? ', deep enough to swim in.' : '; too shallow to swim in, widen it past 11 m.'),
      );
    }
    case 'set_sea': {
      const a = args as ToolArgs<'set_sea'>;
      const selected = a.resource_id === undefined ? world.environment.sea?.resourceId : a.resource_id;
      if (a.level !== null && selected) {
        const resource = getOceanResource(selected);
        if (!resource || !resource.manifest.styles.includes(world.style.base))
          return { ok: false, result: 'This ocean resource does not support the current world style.' };
      }
      return done(
        host.apply([
          {
            type: 'set_sea',
            params: {
              level: a.level,
              ...(a.resource_id !== undefined ? { resourceId: a.resource_id } : {}),
              ...(a.swell !== undefined ? { swell: a.swell } : {}),
            },
          },
        ]),
        a.level === null ? 'The sea is gone.' : `The sea now fills everything below ${a.level} m.`,
      );
    }
    case 'sculpt_terrain': {
      const a = args as ToolArgs<'sculpt_terrain'>;
      return done(
        host.apply([
          {
            type: 'sculpt_terrain',
            params: {
              area: circle(a.x, a.z, a.radius),
              operation: a.operation,
              strength: a.strength ?? 0.6,
              soft: true,
            },
          },
        ]),
        `Terrain ${a.operation} done at (${a.x}, ${a.z}).`,
      );
    }
    case 'paint_terrain': {
      const a = args as ToolArgs<'paint_terrain'>;
      // A named ground material (P2-37) counts as its own soil.
      const material = a.material ? getGround(a.material) : undefined;
      if (a.material && !material) return done(`There is no ground material called ${a.material}.`, '');
      const area = circle(a.x, a.z, a.radius);
      return done(
        host.apply([
          material
            ? {
                type: 'paint_terrain',
                params: { area, soilId: material.soil, material: groundRef(material) },
              }
            : { type: 'paint_terrain', params: { area, soilId: a.soil } },
        ]),
        `Painted ${material?.name ?? a.soil} at (${a.x}, ${a.z}).`,
      );
    }
    case 'make_world': {
      const a = args as ToolArgs<'make_world'>;
      if (host.blockGround?.()) return done(BLOCK_GROUND_REFUSAL, '');
      if (!supportsWorldStarter(world.style.base, a.kind)) return done(`The ${a.kind} generator is available only in Realistic worlds. This ${world.style.base} world's style is preserved.`, '');
      const seed = {
        seed: a.seed ?? Math.floor(random() * 0x7fffffff),
        kind: a.kind,
        generator: WORLD_GENERATOR,
      };
      // A new world replaces the old one's spawn ring rather than growing a second ring round it;
      // the removals are in the same batch, so one Undo brings the old ring back.
      const oldRing = world.terrain.world
        ? world.instances.filter((i) => SPAWN_RING_ID.test(i.instanceId)).map((i) => i.instanceId)
        : [];
      const kept = world.instances.filter((i) => !oldRing.includes(i.instanceId));
      // The same batch the create flow builds, so the spawn ring is never forgotten. The seed's own
      // height is only a hint: the spawn items ask for rest, and a stored chunk beats the generator.
      // The kind's ground (task 7): its own slots, and the old kind's slots it does not set go back
      // to the style's default rather than keep a mountain's rock in a valley.
      const ground = starterGroundMaterials(a.kind);
      const oldGround = world.terrain.world ? starterGroundMaterials(world.terrain.world.kind) : {};
      const palette = [...new Set([...Object.keys(ground), ...Object.keys(oldGround)])].map(
        (slot): CommandPayload => ({
          type: 'set_ground_material',
          params: { slot: Number(slot), material: ground[slot] ?? null },
        }),
      );
      const error = host.apply([
        ...oldRing.map((instanceId): CommandPayload => ({ type: 'remove_item', params: { instanceId } })),
        ...palette,
        ...starterWorldCommands(
          { ...world, instances: kept },
          seed,
          (x, z) => worldHeightAt(seed, x, z, half),
          (itemId) => {
            const core = getCoreItem(itemId);
            return core ? itemFootprint(core, world.style.base) : null;
          },
        ),
      ]);
      if (error) return done(error, '');
      return done(
        null,
        `The place is now a ${a.kind} world (seed ${seed.seed}), with trees and rocks around the spawn.` +
          (oldRing.length ? ` They replace the ${oldRing.length} of the old world.` : '') +
          (keptOldGround(host, starterGround(seed, world.sizeTier, world.style.base), half)
            ? ' Ground that was already shaped or painted kept its old height.'
            : ''),
      );
    }
    case 'cover_ground': {
      const a = args as ToolArgs<'cover_ground'>;
      if (host.blockGround?.()) return done(BLOCK_GROUND_REFUSAL, '');
      if (!inside(a.x, a.z)) return done(`The point (${a.x}, ${a.z}) is outside the place.`, '');
      // Cover grows by the world's rules, so a place without one draws none of it (and the paint
      // would store flat ground that a world given later could not reshape).
      if (!world.terrain.world)
        return done('this place has no world yet, so nothing grows on it. Use make_world first.', '');
      return done(
        host.apply([{ type: 'paint_cover', params: { area: circle(a.x, a.z, a.radius), cover: a.cover } }]),
        a.cover === 'cleared'
          ? `Cleared the ground at (${a.x}, ${a.z}); nothing grows there now.`
          : a.cover === 'default'
            ? `The ground at (${a.x}, ${a.z}) follows the world again.`
            : `Scattered ${a.cover} at (${a.x}, ${a.z}).`,
      );
    }
    case 'set_ground_heights': {
      const a = args as ToolArgs<'set_ground_heights'>;
      if (host.blockGround?.()) return done(BLOCK_GROUND_REFUSAL, '');
      try {
        decodeHeightTile(a.heights_cm, a.cols * a.rows, a.base);
      } catch (error) {
        return done(`heights_cm: ${(error as Error).message}`, '');
      }
      return done(
        host.apply([
          {
            type: 'set_heights',
            params: {
              x0: a.x0,
              z0: a.z0,
              cols: a.cols,
              rows: a.rows,
              step: a.step,
              base: a.base,
              heights: a.heights_cm,
            },
          },
        ]),
        `Wrote ${a.cols} x ${a.rows} ground heights from (${a.x0}, ${a.z0}) every ${a.step} m.`,
      );
    }
    case 'place_items': {
      const { items } = args as ToolArgs<'place_items'>;
      const commands: CommandPayload[] = [];
      for (const [index, item] of items.entries()) {
        const which = `item ${index + 1} (${item.itemId})`;
        const missing = unknownItem(item.itemId);
        if (missing) return done(`${which}: ${missing}`, '');
        if (!inside(item.x, item.z))
          return done(`${which}: (${item.x}, ${item.z}) is outside the place.`, '');
        const refused = item.params ? generatedParamsError(item.itemId, item.params) : null;
        if (refused) return done(`${which}: ${refused}`, '');
        const sized = scaleOf(item.itemId, item.size, item.stretch);
        if ('error' in sized) return done(`${which}: ${sized.error}`, '');
        const plain = sized.scale.every((v) => v === 1);
        const exact = item.y !== undefined;
        commands.push({
          type: 'place_item',
          params: {
            instanceId: newId('item', random),
            itemId: item.itemId,
            position: [item.x, exact ? item.y! : host.heightAt(item.x, item.z), item.z],
            rotation: turnAndLean(item.turn ?? 0, item.lean ?? 0),
            ...(plain ? {} : { scale: sized.scale }),
            ...(item.params ? { itemParams: { ...item.params } } : {}),
            // Without a height the rest law sets it (P2-43); with one the item stays exactly there.
            ...(exact ? {} : { rest: true }),
          },
        });
      }
      return done(host.apply(commands), `Placed ${commands.length} items.`);
    }
    case 'paint_ground_rule': {
      const a = args as ToolArgs<'paint_ground_rule'>;
      if (host.blockGround?.()) return done(BLOCK_GROUND_REFUSAL, '');
      if ((a.soil === undefined && a.material === undefined) === (a.cover === undefined))
        return done('give a soil (or a material) or a cover, not both.', '');
      const box: [number, number, number, number] = [
        Math.min(a.x1, a.x2),
        Math.min(a.z1, a.z2),
        Math.max(a.x1, a.x2),
        Math.max(a.z1, a.z2),
      ];
      if (box[2] - box[0] > PAINT_RULE_MAX_BOX || box[3] - box[1] > PAINT_RULE_MAX_BOX)
        return done(`the box must be at most ${PAINT_RULE_MAX_BOX} m on each side.`, '');
      const material = a.material ? getGround(a.material) : undefined;
      if (a.material && !material) return done(`There is no ground material called ${a.material}.`, '');
      const soilId = material ? material.soil : a.soil;
      return done(
        host.apply([
          {
            type: 'paint_rule',
            params: {
              box,
              ...(soilId ? { soilId } : {}),
              ...(material ? { material: groundRef(material) } : {}),
              ...(a.cover ? { cover: a.cover } : {}),
              ...(a.height ? { height: a.height } : {}),
              ...(a.slope ? { slope: a.slope } : {}),
              ...(a.depth_below_sea ? { depth: a.depth_below_sea } : {}),
            },
          },
        ]),
        `Painted ${material?.name ?? soilId ?? a.cover} where the rule holds in (${box.join(', ')}).`,
      );
    }
    case 'set_sky': {
      const { preset, cycle_minutes: minutes } = args as ToolArgs<'set_sky'>;
      const a = args as ToolArgs<'set_sky'>;
      // Tidewater world (task 2): a fixed hour, the sun path and the wind live in the sky params.
      const settings = {
        ...(a.time_of_day !== undefined ? { timeOfDay: a.time_of_day } : {}),
        ...(a.sun_azimuth !== undefined ? { sunAzimuth: a.sun_azimuth } : {}),
        ...(a.wind_direction !== undefined ? { windDirection: a.wind_direction } : {}),
        ...(a.wind_speed !== undefined ? { windSpeed: a.wind_speed } : {}),
      };
      if (Object.keys(settings).length > 0 && !(minutes && minutes >= 1))
        return done(
          host.apply([{ type: 'set_sky', params: { preset, params: settings } }]),
          `Sky is now ${preset}` +
            (a.time_of_day !== undefined ? ` at ${a.time_of_day} h` : '') +
            (a.wind_speed !== undefined ? `, wind ${a.wind_speed} m/s` : '') +
            '.',
        );
      // A day-night cycle (P2-02) starts from day; a storm sky keeps its clouds.
      if (minutes && minutes >= 1) {
        const cycle = Math.round(minutes);
        const base = preset === 'storm' ? 'storm' : 'day';
        return done(
          host.apply([{ type: 'set_sky', params: { preset: base, params: { cycle, ...settings } } }]),
          `Day and night now follow each other, ${cycle} minutes per day.`,
        );
      }
      return done(host.apply([{ type: 'set_sky', params: { preset } }]), `Sky is now ${preset}.`);
    }
    case 'set_story': {
      const a = args as ToolArgs<'set_story'>;
      if (a.stops === null)
        return done(host.apply([{ type: 'set_story', params: { story: null } }]), 'The story is gone.');
      if (a.stops.length < 2) return { ok: false, result: 'A story needs at least 2 stops.' };
      const stops = a.stops.map((stop) => ({
        camera: {
          position: stop.position,
          target: stop.look_at,
          ...(stop.fov !== undefined ? { fov: stop.fov } : {}),
          ease: stop.ease ?? ('in_out' as const),
        },
        ...(stop.kicker ? { kicker: stop.kicker } : {}),
        title: stop.title,
        ...(stop.text ? { text: stop.text } : {}),
        side: stop.side ?? ('left' as const),
      }));
      return done(
        host.apply([{ type: 'set_story', params: { story: { ...(a.title ? { title: a.title } : {}), stops } } }]),
        `The story has ${stops.length} stops; see it at /showcase?place=${world.experienceId}.`,
      );
    }
    case 'set_weather': {
      const { preset } = args as ToolArgs<'set_weather'>;
      return done(host.apply([{ type: 'set_weather', params: { preset } }]), `Weather is now ${preset}.`);
    }
    case 'set_style': {
      const { base } = args as ToolArgs<'set_style'>;
      if (!AVAILABLE_WORLD_STYLES.includes(base)) return done('This world style is not available yet.', '');
      if ((base === 'voxel') !== Boolean(world.voxels)) return done('Voxel ground requires a new Voxel world. The current ground type is preserved.', '');
      const incompatible = world.instances.filter(item => { const core = getCoreItem(item.itemId); return core && !core.manifest.styles.includes(base); });
      if ((world.terrain.world && base !== 'realistic') || incompatible.length) return done('This style is not compatible with the current world and its items. Create a new world in that style.', '');
      return done(
        host.apply([{ type: 'set_style', params: { ...world.style, base } }]),
        `Style is now ${base}.`,
      );
    }
    case 'set_game': {
      const a = args as ToolArgs<'set_game'>;
      if (a.remove)
        return done(
          host.apply([{ type: 'set_game', params: { game: null } }]),
          'The place has no game now; it is an ordinary world again.',
        );
      // Only the given settings change; a place without a game starts from `newGame()`.
      const current = world.game ?? newGame();
      const next: Game = { ...current, match: { ...current.match } };
      if (a.teams) next.teams = { mode: a.teams, friendlyFire: current.teams?.friendlyFire ?? false };
      if (a.minutes !== undefined) next.match.durationSec = Math.round(a.minutes * 60);
      if (a.min_players !== undefined) next.match.minPlayers = a.min_players;
      if (a.health !== undefined) next.health = { max: a.health };
      if (a.respawn_seconds !== undefined)
        next.respawn = { delaySec: a.respawn_seconds, protectSec: current.respawn?.protectSec ?? 2 };
      if (a.tools !== undefined) {
        // Only library tools reach a hand (the Checks report any other item in a loadout).
        const notTool = a.tools.find((id) => !getLibraryItem(id)?.manifest.tool);
        if (notTool !== undefined)
          return {
            ok: false,
            result: `Error: ${notTool} is not a tool players can hold. Use search_catalog to find tools.`,
          };
        if (a.tools.length > 0) next.loadout = { items: [...new Set(a.tools)] };
        else delete next.loadout;
      }
      const parsed = Game.safeParse(next);
      if (!parsed.success) return gameError(parsed.error);
      return done(
        host.apply([{ type: 'set_game', params: { game: parsed.data } }]),
        `The game is now a ${describeGame(parsed.data)}.`,
      );
    }
    case 'set_rules': {
      // The same data the rules editor saves, checked as a whole game and saved as one set_game.
      const a = args as ToolArgs<'set_rules'>;
      if (
        (a.rules && (a.add_rules || a.remove_rules)) ||
        (a.counters && (a.add_counters || a.remove_counters)) ||
        (a.hud && (a.add_hud || a.remove_hud))
      )
        return {
          ok: false,
          result:
            'Error: give a whole list (rules, counters, hud) or changes to it (add_..., remove_...), not both.',
        };
      const next: Game = { ...(world.game ?? newGame()) };
      for (const part of a.remove ?? []) delete next[part];
      const list = <K extends 'counters' | 'rules' | 'hud'>(key: K, value: Game[K] | undefined) => {
        if (value === undefined) return;
        if (value.length > 0) next[key] = value;
        else delete next[key];
      };
      list('counters', a.counters);
      list('rules', a.rules);
      list('hud', a.hud);
      // Changes that keep the rest of a list (the designer's own rules stay as they are).
      const withoutIndexes = <T>(items: readonly T[], drop: readonly number[] | undefined, word: string) => {
        const missing = (drop ?? []).find((i) => i >= items.length);
        if (missing !== undefined)
          return `Error: there is no ${word} ${missing}; the game has ${items.length} ${word}s. Use get_game for their indexes.`;
        return items.filter((_, i) => !drop?.includes(i));
      };
      if (a.add_rules || a.remove_rules) {
        const kept = withoutIndexes(next.rules ?? [], a.remove_rules, 'rule');
        if (typeof kept === 'string') return { ok: false, result: kept };
        list('rules', [...kept, ...(a.add_rules ?? [])]);
      }
      if (a.add_hud || a.remove_hud) {
        const kept = withoutIndexes(next.hud ?? [], a.remove_hud, 'display');
        if (typeof kept === 'string') return { ok: false, result: kept };
        list('hud', [...kept, ...(a.add_hud ?? [])]);
      }
      if (a.add_counters || a.remove_counters) {
        const counters = next.counters ?? [];
        const unknown = a.remove_counters?.find((name) => !counters.some((c) => c.name === name));
        if (unknown !== undefined)
          return {
            ok: false,
            result: `Error: the game has no counter "${unknown}". Use get_game for its counters.`,
          };
        list('counters', [
          ...counters.filter((c) => !a.remove_counters?.includes(c.name)),
          ...(a.add_counters ?? []),
        ]);
      }
      if (a.ranking) next.ranking = a.ranking;
      if (a.highest_score_wins === true) next.win = { by: 'highest_score' };
      if (a.highest_score_wins === false) delete next.win;
      const parsed = Game.safeParse(next);
      if (!parsed.success) return gameError(parsed.error);
      return done(
        host.apply([{ type: 'set_game', params: { game: parsed.data } }]),
        `The game now has ${describeRules(parsed.data)}.`,
      );
    }
    case 'set_zone': {
      const a = args as ToolArgs<'set_zone'>;
      const instance = world.instances.find((i) => i.instanceId === a.instanceId);
      if (!instance)
        return {
          ok: false,
          result: `Error: no placed item "${a.instanceId}". Use get_world_summary for ids.`,
        };
      const own = zoneShapeOfItem(instance.itemId);
      if (a.shape === 'off') {
        if (own)
          return {
            ok: false,
            result: `Error: ${instance.instanceId} is a zone item and always a zone. Remove it with remove_items instead.`,
          };
        const params = { [ZONE_PARAMS.shape]: null, [ZONE_PARAMS.tag]: null, [ZONE_PARAMS.visible]: null };
        return done(
          host.apply([{ type: 'set_item_params', params: { instanceId: instance.instanceId, params } }]),
          `${instance.instanceId} is an ordinary item again.`,
        );
      }
      if (a.shape === undefined && a.tag === undefined && a.visible === undefined)
        return { ok: false, result: 'Error: give a shape, a tag or visible.' };
      const current = zoneFromParams(instance.params, own);
      const named = instance.params[ZONE_PARAMS.shape];
      const shape = a.shape ?? current?.shape ?? (named === 'area' || named === 'gate' ? named : own);
      if (!shape) return { ok: false, result: 'Error: give the zone a shape: area or gate.' };
      const tag = a.tag ?? current?.tag;
      if (!tag) return { ok: false, result: 'Error: give the zone a tag (the name its rules use).' };
      const params: Record<string, string | boolean | null> = {};
      // A zone item's own shape is stored as no param (the item gives it), as the studio does.
      if (a.shape !== undefined) params[ZONE_PARAMS.shape] = a.shape === own ? null : a.shape;
      if (a.tag !== undefined) params[ZONE_PARAMS.tag] = a.tag;
      if (a.visible !== undefined) params[ZONE_PARAMS.visible] = a.visible ? true : null;
      return done(
        host.apply([{ type: 'set_item_params', params: { instanceId: instance.instanceId, params } }]),
        `${instance.instanceId} is a zone ${shape} tagged "${tag}".`,
      );
    }
    case 'set_ride': {
      const a = args as ToolArgs<'set_ride'>;
      const instance = world.instances.find((i) => i.instanceId === a.instance_id);
      if (!instance)
        return {
          ok: false,
          result: `Error: no placed item "${a.instance_id}". Use get_world_summary for ids.`,
        };
      const itemDefault = getLibraryItem(instance.itemId)?.manifest.ride;
      const current = rideFromParams(instance.params, itemDefault);
      const apply = (params: Record<string, string | number | boolean | null>) =>
        host.apply([{ type: 'set_item_params', params: { instanceId: instance.instanceId, params } }]);
      if (a.model === null) {
        const params = rideToParams(null);
        // An item rideable by itself keeps its own default unless the model names none.
        if (itemDefault?.model) params[RIDE_PARAMS.model] = 'off';
        return done(apply(params), `${instance.instanceId} is not rideable any more.`);
      }
      const model = a.model ?? current?.model;
      if (!model) return { ok: false, result: 'Error: give the item a model: ground, water or air.' };
      // A new model (or preset: true) starts from the model's starting numbers, keeping seats and tag.
      const base: Ride =
        a.preset || !current || current.model !== model
          ? {
              model,
              ...RIDE_PRESETS[model],
              seats: current?.seats ?? RIDE_PRESETS[model].seats,
              ...(current?.tag ? { tag: current.tag } : {}),
            }
          : current;
      const changes = {
        seats: a.seats,
        maxSpeed: a.max_speed,
        reverse: a.reverse,
        accel: a.accel,
        turn: a.turn,
        grip: a.grip,
        gravity: a.gravity,
        climb: a.climb,
        glide: a.glide,
        ceiling: a.ceiling,
        camera: a.camera,
        seatHeight: a.seat_height,
        pose: a.pose,
        reach: a.reach,
        exit: a.exit,
        returnSec: a.return_seconds,
      };
      const next: Record<string, unknown> = { ...base };
      for (const [key, value] of Object.entries(changes)) if (value !== undefined) next[key] = value;
      if (a.tag === null) delete next.tag;
      else if (a.tag !== undefined) next.tag = a.tag;
      const parsed = Ride.safeParse(next);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return {
          ok: false,
          result: `Error: invalid ${issue?.path.map(String).join('.') || 'ride'}: ${issue?.message ?? 'check the values'}.`,
        };
      }
      const ride = parsed.data;
      const where =
        ride.model === 'ground' ? 'on the ground' : ride.model === 'water' ? 'on water' : 'in the air';
      return done(
        apply(rideToParams(ride)),
        `${instance.instanceId} is rideable ${where}: ${ride.seats} seat${ride.seats === 1 ? '' : 's'}, top speed ${ride.maxSpeed} m/s${ride.tag ? `, tag "${ride.tag}"` : ''}.`,
      );
    }
    case 'ask_user': {
      const a = args as ToolArgs<'ask_user'>;
      return { ok: true, result: 'Asked the builder.', ask: { question: a.question, options: a.options } };
    }
    case 'get_script_api':
      return scriptApi(args as ToolArgs<'get_script_api'>);
    case 'get_scripts':
      return getScripts(args as ToolArgs<'get_scripts'>, host);
    case 'set_script':
    case 'test_script':
    case 'get_script_logs':
      // They wait for the script engine or the room: `runTool` runs them (`scriptTool`).
      return { ok: false, result: `Error: ${name} runs through runTool.` };
  }
}

/** The script tools that wait for the engine or the room (P2-10). */
const ASYNC_SCRIPT_TOOLS: ReadonlySet<ToolName> = new Set(['set_script', 'test_script', 'get_script_logs']);

/** Runs a script tool that waits for the script engine or the room. */
function scriptTool(
  name: ToolName,
  args: unknown,
  host: AssistantHost,
  random: () => number,
): Promise<Outcome> {
  if (name === 'set_script') return setScript(args as ToolArgs<'set_script'>, host, random);
  if (name === 'test_script') return testScript(args as ToolArgs<'test_script'>, host);
  return getScriptLogs(args as ToolArgs<'get_script_logs'>, host);
}

/** A game the contracts' `Game` schema refused, as a tool error the model can act on. */
function gameError(error: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> }): Outcome {
  const issue = error.issues[0];
  return {
    ok: false,
    result: `Error: invalid ${issue?.path.map(String).join('.') || 'game'}: ${issue?.message ?? 'check the values'}.`,
  };
}

/** Core models and supported world resources matching a name, id or subcategory. */
function wordSearch(query: string, style: WorldDocument['style']['base']): { found: boolean; list: CatalogHit[] } {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const all = queryLibrary({ style }).filter(
    (entry) => entry.manifest.type === 'model' || getOceanResource(entry.manifest.id),
  );
  const found = all.filter((entry) => {
    const text = `${entry.manifest.name} ${entry.manifest.id} ${entry.manifest.subcategory}`.toLowerCase();
    return words.some((word) => text.includes(word.replace(/s$/, '')));
  });
  return {
    found: found.length > 0,
    list: (found.length ? found : all)
      .slice(0, 20)
      .map((entry) => ({
        id: entry.manifest.id,
        name: entry.manifest.name,
        ...(getOceanResource(entry.manifest.id)
          ? { caption: 'World ocean; apply with set_sea resource_id; inspect get_resource_controls' }
          : {}),
      })),
  };
}

/** Results by meaning listed before the word matches. */
const MEANING_HITS = 8;

/**
 * `search_catalog` with the host's search by meaning (P4-03): the closest items first (with
 * their caption, so the model can choose well), then word matches not listed yet. Only items the
 * world can draw are offered: Core models, ocean resources and approved uploaded 3D models (P2-16).
 */
async function searchCatalog(query: string, host: AssistantHost, signal?: AbortSignal): Promise<Outcome> {
  const hits = await Promise.resolve(host.searchCatalog?.(query, signal)).catch(() => null);
  const placeable = (hits ?? [])
    .filter((hit) => { const entry = getLibraryItem(hit.id); return entry ? entry.manifest.styles.includes(host.world().style.base) && Boolean(getCoreItem(hit.id) || getOceanResource(hit.id)) : hit.category === '3d-models'; })
    .slice(0, MEANING_HITS);
  for (const hit of placeable) {
    if (getCoreItem(hit.id) || getOceanResource(hit.id)) continue;
    const known = offered.get(host) ?? new Set<string>();
    known.add(hit.id);
    offered.set(host, known);
  }
  if (placeable.length === 0) return executeTool('search_catalog', { query }, host);
  const words = wordSearch(query, host.world().style.base);
  const listed = new Set(placeable.map((hit) => hit.id));
  const more = words.found ? words.list.filter((hit) => !listed.has(hit.id)) : [];
  const line = (hit: CatalogHit) =>
    `${hit.id}: ${hit.name}${
      getOceanResource(hit.id)
        ? ' (World ocean; apply with set_sea resource_id; inspect get_resource_controls)'
        : hit.caption
          ? ` (${hit.caption})`
          : ''
    }`;
  return { ok: true, result: [...placeable, ...more].slice(0, 20).map(line).join('\n') };
}

export interface RunToolOptions {
  signal?: AbortSignal | undefined;
  random?: (() => number) | undefined;
}

/** One tool call: its outcome and the arguments it ran with (parsed when they were valid). */
async function callTool(
  name: string,
  rawArgs: unknown,
  host: AssistantHost,
  { signal, random = Math.random }: RunToolOptions,
): Promise<{ outcome: Outcome; args: unknown }> {
  if (!isToolName(name))
    return { outcome: { ok: false, result: `Error: there is no tool named ${name}.` }, args: rawArgs };
  const parsed = parseArgs(name, rawArgs);
  if ('error' in parsed) return { outcome: { ok: false, result: `Error: ${parsed.error}` }, args: rawArgs };
  if(name==='share_studio'){
    if(!host.shareStudio)return {outcome:{ok:false,result:'Sharing is not connected in this host.'},args:parsed.args};
    try{return {outcome:{ok:true,result:JSON.stringify(await host.shareStudio(parsed.args as ToolArgs<'share_studio'>))},args:parsed.args};}catch(error){return {outcome:{ok:false,result:error instanceof Error?error.message:String(error)},args:parsed.args};}
  }
  if (name === 'avatar_voice') {
    if (!host.avatarVoice) return {outcome:{ok:false,result:'Local voice service is not connected in this host.'},args:parsed.args};
    try {return {outcome:{ok:true,result:JSON.stringify(await host.avatarVoice(parsed.args as ToolArgs<'avatar_voice'>))},args:parsed.args};}
    catch(error) {return {outcome:{ok:false,result:error instanceof Error?error.message:String(error)},args:parsed.args};}
  }
  if (name === 'user_avatar_library') {
    if (!host.userAvatarLibrary) return { outcome: { ok: false, result: 'Private user library is not connected in this host.' }, args: parsed.args };
    try { return { outcome: { ok: true, result: JSON.stringify(await host.userAvatarLibrary(parsed.args as ToolArgs<'user_avatar_library'>)) }, args: parsed.args }; }
    catch (error) { return { outcome: { ok: false, result: error instanceof Error ? error.message : String(error) }, args: parsed.args }; }
  }
  const outcome =
    name === 'search_catalog'
      ? await searchCatalog((parsed.args as ToolArgs<'search_catalog'>).query, host, signal)
      : ASYNC_SCRIPT_TOOLS.has(name)
        ? await scriptTool(name, parsed.args, host, random)
        : executeTool(name, parsed.args, host, random);
  return { outcome, args: parsed.args };
}

/**
 * The one entry point for a tool call, whoever makes it (the built-in loop, MCP): parses the
 * arguments (an object or a JSON string) with the tool's schema, runs `search_catalog` with the
 * host's search by meaning, and every other tool with `executeTool`.
 */
export async function runTool(
  name: string,
  rawArgs: unknown,
  host: AssistantHost,
  options: RunToolOptions = {},
): Promise<Outcome> {
  return (await callTool(name, rawArgs, host, options)).outcome;
}

/**
 * The tool loop (task P4-02): sends the conversation to the model, runs every tool call it makes,
 * returns the results, and repeats until the model answers in words, asks the builder, or runs
 * out of steps. An invalid call gets its error back so the model can fix it once more.
 * Returns the conversation to keep for the next request (without the system message).
 */
export async function runAssistant({
  model,
  host,
  history,
  prompt,
  onEvent,
  maxSteps = 8,
  signal,
  random = Math.random,
}: RunOptions): Promise<ChatMessage[]> {
  const conversation: ChatMessage[] = [...history, { role: 'user', content: prompt }];
  let failures = 0;
  for (let step = 0; step < maxSteps; step += 1) {
    if (signal?.aborted) break;
    const messages = [{ role: 'system' as const, content: systemPrompt(host) }, ...conversation];
    const reply = await model(
      messages,
      (delta) => onEvent({ type: 'text', delta }),
      signal,
      (ahead) => onEvent({ type: 'queue', ahead }),
    );
    conversation.push({
      role: 'assistant',
      content: reply.content,
      ...(reply.tool_calls.length ? { tool_calls: reply.tool_calls } : {}),
    });
    if (reply.tool_calls.length === 0) {
      onEvent({ type: 'done', text: reply.content });
      return conversation;
    }
    let asked: Outcome['ask'] | undefined;
    for (const call of reply.tool_calls) {
      const name = call.function.name;
      const { outcome, args } = await callTool(name, call.function.arguments, host, { signal, random });
      failures = outcome.ok ? 0 : failures + 1;
      onEvent({ type: 'tool', name, args, ok: outcome.ok, result: outcome.result });
      conversation.push({ role: 'tool', tool_name: name, content: outcome.result });
      if (outcome.ask) asked = outcome.ask;
    }
    if (asked) {
      onEvent({ type: 'ask', question: asked.question, options: asked.options });
      return conversation;
    }
    if (failures > MAX_FAILURES) {
      const text = 'Sorry, I could not do that. Try saying it another way.';
      conversation.push({ role: 'assistant', content: text });
      onEvent({ type: 'done', text });
      return conversation;
    }
  }
  const text = 'I stopped here. Tell me what to do next.';
  conversation.push({ role: 'assistant', content: text });
  onEvent({ type: 'done', text });
  return conversation;
}
