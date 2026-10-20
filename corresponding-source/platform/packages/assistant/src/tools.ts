import { MotionLabOperation, StudioShareRequest } from '@genvr/contracts';
import {
  Counter,
  GAME_LIMITS,
  HEIGHT_TILE_MAX,
  HudBinding,
  PlaceScript,
  Ranking,
  RIDE_LIMITS,
  RideModel,
  Rule,
  RULE_LIMITS,
  SCRIPT_LIMITS,
  ScriptId,
  ScriptTestEvent,
  Sea,
  SeaSwell,
  SkyPreset,
  Style,
  WeatherPreset,
  WorldSeed,
} from '@genvr/contracts';
import { WALL_SURFACES, type WallSurface } from '@genvr/world';
import { z } from 'zod';
import { AvatarPresentationEvent } from './presentation.js';

/**
 * Assistant tools (docs/AI-TOOLS.md). Each tool is a friendly front for one or more world
 * commands: the model gives places on the ground (x, z) and names, the loop fills in ids, ground
 * heights, and rotations, and every result is a normal command (undo, saving, co-building).
 */

const Coordinate = z.number().min(-4000).max(4000);
const Point = z.tuple([Coordinate, Coordinate]);
/** Width, height and depth in metres for parts (Box, Wedge, Ball, Cylinder), as the studio's Properties stretch them. */
const Stretch = z
  .tuple([z.number().min(0.1).max(50), z.number().min(0.1).max(50), z.number().min(0.1).max(50)])
  .describe('Parts only (Box, Wedge, Ball, Cylinder): width, height and depth in metres; replaces size. A Wedge ramp rises toward its back');

/** Blocks the assistant builds with in block places (P2-26), like the Blocks tool's picker. */
export const BUILD_BLOCKS = [
  'grass',
  'dirt',
  'sand',
  'stone',
  'snow',
  'gravel',
  'planks',
  'cobble',
  'brick',
  'paving',
  'path',
] as const;
const BlockName = z.enum(BUILD_BLOCKS);
/** Two opposite corners of an area on the ground, in meters (one block is 1 m). */
const Area = {
  x1: Coordinate,
  z1: Coordinate,
  x2: Coordinate,
  z2: Coordinate,
};

/** Most items one `place_items` call places (one saved change holds at most 200 commands). */
export const PLACE_ITEMS_MAX = 200;

export const TOOL_ARGS = {
  share_studio: z.object({action:z.enum(['inspect','open','create']),request:StudioShareRequest.optional()}).strict(),
  avatar_voice: z.object({ action: z.enum(['models','install','voices','clone','assign','speak','job','recordings','audio','replay','demo','playback','demo_all','preview','preview_demo','prepare_previews','remove','design','save_design','export_voice']), preview:z.boolean().optional(), voiceType:z.enum(['male','female','child']).optional(), description:z.string().max(400).optional(), confirm:z.boolean().optional(), command:z.enum(['play','pause','stop','seek','rate','volume']).optional(), value:z.number().finite().optional(), demoId:z.string().max(80).optional(), audioId:z.string().uuid().optional(), model:z.string().max(80).optional(), jobId:z.string().uuid().optional(), voiceId:z.string().uuid().optional(), name:z.string().max(80).optional(), audio:z.string().max(12*1024*1024).optional(), consent:z.boolean().optional(), projectId:z.string().max(120).optional(), target:z.string().regex(/^(self|[A-Za-z0-9_-]{1,100})$/).default('self'), text:z.string().max(1200).optional(), language:z.string().max(8).optional() }).strict(),
  user_avatar_library: z.object({ action: z.enum(['list', 'assign', 'play', 'delete']), target: z.string().regex(/^(self|[A-Za-z0-9_-]{1,100})$/).default('self'), id: z.string().max(150).nullable().optional(), query: z.string().max(200).default(''), offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(100).default(30) }).strict(),
  present_avatar: z.object({ event: AvatarPresentationEvent }).strict(),
  /**
   * The Avatar tab (AV-01, Avatar design A0–A9): read and change the character itself — body, shape, muscle, fat,
   * face controls, colours, hair — the view mode (skeleton, muscles, fat…), a held facial expression, a move, and
   * save / export the recipe. `recipe` parts merge into the current recipe and are checked by the recipe schema.
   */
  avatar_studio: z.object({
    action: z.enum(['inspect', 'set', 'view', 'expression', 'play', 'save', 'export', 'reset_shape', 'undo', 'redo']),
    recipe: z.record(z.string(), z.unknown()).optional(),
    view: z.enum(['normal', 'first-person', 'skeleton', 'skeleton-mesh', 'wireframe', 'clay', 'normals', 'muscles', 'fat']).optional(),
    shading: z.enum(['smooth', 'flat']).optional(),
    expression: z.enum(['neutral', 'smile', 'angry', 'sad', 'surprised', 'thinking']).optional(),
    clip: z.string().max(150).optional(),
  }).strict(),
  /**
   * The Lab area of a motion lab project (MOTION-LAB L1 + L2): build a measured course, run the lab robot,
   * read scores and keep motion versions. One operation per call; the owner gates live in the lab controller.
   */
  motion_lab: z.object({ operation: MotionLabOperation }).strict(),
  get_resource_controls: z.object({
    item_id: z
      .string()
      .min(1)
      .max(128)
      .describe(
        'Core library model or ocean resource id; returns supported controls, scope and source defaults',
      ),
  }),
  set_resource_params: z.object({
    instance_id: z.string().min(1).max(128),
    params: z
      .record(z.string().min(1).max(64), z.union([z.number(), z.string().max(256), z.boolean(), z.null()]))
      .refine(
        (params) => Object.keys(params).length > 0 && Object.keys(params).length <= 16,
        'Provide 1 to 16 control values; null resets an override',
      ),
  }),
  get_world_summary: z.object({
    from_item: z
      .number()
      .int()
      .min(0)
      .max(100_000)
      .optional()
      .describe('List items from this index on (a long list comes in pages; see more_items_from)'),
  }),
  /** The game's own data (counters, numbered rules, ranking, displays), read before changing it. */
  get_game: z.object({
    from_rule: z
      .number()
      .int()
      .min(0)
      .max(RULE_LIMITS.rules)
      .optional()
      .describe('Show rules from this index on (a long list comes in pages)'),
  }),
  search_catalog: z.object({
    query: z.string().max(80).describe('Words to look for, e.g. "tree", "bench", "house"'),
  }),
  place_item: z.object({
    itemId: z.string().max(128).describe('Item id from search_catalog, e.g. genvr.core.tree.round'),
    x: Coordinate,
    z: Coordinate,
    turn: z.number().min(-360).max(360).optional().describe('Turn in degrees (0 = facing +z)'),
    size: z.number().min(0.2).max(10).optional().describe('Size factor, 1 = normal'),
    stretch: Stretch.optional(),
    on: z
      .string()
      .max(128)
      .optional()
      .describe('Instance id of a placed item to stand it on, e.g. a table for a lamp'),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional()
      .describe('Tint color such as #e53935'),
    material: z.enum(['plastic', 'wood', 'stone', 'metal', 'glass', 'neon']).optional().describe('Surface, as the Appearance tab: plastic (default), wood, stone, metal, glass, neon'),
  }),
  scatter_items: z.object({
    itemIds: z.array(z.string().max(128)).min(1).max(8).describe('Items to mix, e.g. trees and rocks'),
    x: Coordinate,
    z: Coordinate,
    radius: z.number().min(1).max(200).describe('Radius of the area in meters'),
    count: z.number().int().min(1).max(60),
  }),
  build_platforms: z.object({
    platforms: z
      .array(
        z.object({
          x: Coordinate.describe('Middle of the platform along the line'),
          height: z.number().min(0).max(30).describe('Top of the platform above the ground in meters'),
          width: z.number().min(0.5).max(30).optional().describe('Length along the line (3 m by default)'),
        }),
      )
      .min(1)
      .max(30),
    floating: z
      .boolean()
      .optional()
      .describe(
        'true (default): thin platforms in the air; false: solid blocks from the ground up, like steps',
      ),
    ladder: z
      .boolean()
      .optional()
      .describe('true adds a ladder at the end of the course, from the ground up to the last platform'),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional()
      .describe('Color such as #8d6e63'),
  }),
  /** Moves, turns or resizes one placed item: one transform_item, the rest law sets its height. */
  move_item: z.object({
    instanceId: z.string().max(128).describe('Instance id of a placed item (from get_world_summary)'),
    x: Coordinate.optional().describe('New x (the item keeps its x when left out)'),
    z: Coordinate.optional().describe('New z (the item keeps its z when left out)'),
    turn: z.number().min(-360).max(360).optional().describe('Turn in degrees (0 = facing +z)'),
    size: z.number().min(0.2).max(10).optional().describe('Size factor, 1 = normal'),
    stretch: Stretch.optional(),
  }),
  remove_items: z.object({
    instanceIds: z.array(z.string().max(128)).min(1).max(100),
  }),
  list_library: z.object({
    kind: z
      .enum(['models', 'game', 'roads', 'ground', 'walls', 'water', 'sky', 'moves', 'effects'])
      .describe('A kind of the Items tab: models (3D), game, roads, ground, walls, water, sky, moves, effects'),
    group: z
      .enum(['parts', 'nature', 'props-and-decor', 'structures', 'building-blocks'])
      .optional()
      .describe('3D only: Parts, Nature, Props, Buildings or Blocks'),
    offset: z.number().int().min(0).max(5000).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }),
  set_item_look: z.object({
    instanceIds: z.array(z.string().max(128)).min(1).max(100),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional().describe('Tint such as #e53935; null gives back its own colour'),
    material: z.enum(['plastic', 'wood', 'stone', 'metal', 'glass', 'neon']).nullable().optional().describe('Surface; null gives back plastic'),
  }),
  name_items: z.object({
    instanceIds: z.array(z.string().max(128)).min(1).max(100),
    name: z.string().max(64).nullable().describe('Shown in the Explorer; null takes the name away'),
  }),
  group_items: z.object({
    instanceIds: z.array(z.string().max(128)).min(2).max(100),
    name: z.string().min(1).max(64).optional(),
  }),
  ungroup_items: z.object({ groupId: z.string().max(128).describe('Group id from get_world_summary') }),
  set_item_flags: z.object({
    instanceIds: z.array(z.string().max(128)).min(1).max(100),
    anchored: z.boolean().optional().describe('false lets physics move it while playing'),
    floats: z.boolean().nullable().optional().describe('true keeps it in the air; null gives the choice back to the item'),
  }),
  settle_items: z.object({
    instanceIds: z.array(z.string().max(128)).min(1).max(100).describe('Let them fall and come to rest, like in play'),
  }),
  edit_river: z.object({
    riverId: z.string().max(128).describe('River id from get_world_summary'),
    points: z.array(Point).min(2).max(50).optional().describe('A new course; the bed is carved again'),
    width: z.number().min(2).max(40).optional(),
    widen: z.number().min(1).max(2).optional(),
    flow: z.number().min(0).max(6).optional(),
  }),
  add_opening: z.object({
    wallId: z.string().max(128).describe('Wall id from get_world_summary'),
    kind: z.enum(['door', 'window']),
    at: Point.describe('A point [x, z] on or near the wall; the opening goes on the closest straight part'),
    width: z.number().min(0.4).max(6).optional().describe('Metres (door 1.2, window 1.4 by default)'),
    height: z.number().min(0.4).max(10).optional().describe('Metres (door 2.2, window 1.2 by default)'),
    bottom: z.number().min(0).max(10).optional().describe('Window: metres above the wall base (1 by default); doors start at 0'),
  }),
  remove_parts: z.object({
    parts: z
      .array(
        z.object({
          kind: z.enum(['road', 'wall', 'water', 'river', 'paving', 'opening']),
          id: z.string().max(128),
          wallId: z.string().max(128).optional().describe('For an opening: the wall it is in'),
        }),
      )
      .min(1)
      .max(50),
  }),
  lock_items: z.object({
    instanceIds: z.array(z.string().max(128)).min(1).max(100),
  }),
  world_history: z.object({
    action: z.enum(['undo', 'redo']),
  }),
  fill_blocks: z.object({
    ...Area,
    block: BlockName,
    height: z.number().int().min(1).max(32).optional().describe('Blocks high (1 by default)'),
    raise: z
      .number()
      .int()
      .min(0)
      .max(32)
      .optional()
      .describe('Blocks above the ground where it starts (0 = standing on the ground)'),
    hollow: z
      .boolean()
      .optional()
      .describe('true: only the outside (walls, floor, and roof) with air inside, like a hut'),
  }),
  block_line: z.object({
    points: z
      .array(Point)
      .min(2)
      .max(20)
      .describe('Points [x, z] the line goes through, e.g. [[0,10],[12,10]]'),
    block: BlockName,
    height: z.number().int().min(1).max(16).optional().describe('Blocks high (2 by default)'),
  }),
  block_floor: z.object({ ...Area, block: BlockName }),
  dig_blocks: z.object({
    ...Area,
    depth: z.number().int().min(1).max(16).describe('How many blocks deep'),
  }),
  draw_road: z.object({
    points: z.array(Point).min(2).max(50).describe('Points [x, z] along the road'),
    roadType: z
      .enum(['street', 'dirt', 'tram', 'rail', 'fantasy', 'path'])
      .optional()
      .describe('Kind of road (street by default)'),
    lanes: z
      .number()
      .int()
      .min(1)
      .max(8)
      .optional()
      .describe('Traffic lanes of a street, both directions together; lane lines are painted between them'),
    oneway: z.boolean().optional().describe('true: traffic runs one way, along the points (no centre line)'),
    width: z.number().min(2).max(16).optional().describe('Metres across; the kind of road decides when left out'),
    sidewalk: z.number().min(0.5).max(6).optional().describe('Raised sidewalk in metres on each side; none when left out'),
    sidewalkSide: z.enum(['both', 'left', 'right']).optional().describe('Which sides get the sidewalk, along the points (both by default)'),
  }),
  pave_area: z.object({
    points: z
      .array(Point)
      .min(3)
      .max(100)
      .describe('Outline [x, z] of a square, market place or car park, at least 3 corners'),
    material: z
      .enum(['slabs', 'asphalt', 'pavers'])
      .optional()
      .describe('Grey slabs (squares, by default), asphalt (car parks) or concrete pavers'),
  }),
  draw_wall: z.object({
    points: z
      .array(Point)
      .min(2)
      .max(50)
      .describe('Corner points [x, z], at least 1 m apart; a 6 x 6 room: [[0,10],[6,10],[6,16],[0,16]]'),
    closed: z.boolean().optional().describe('true makes a room (the last corner joins the first)'),
    height: z.number().min(0.5).max(12).optional(),
    material: z
      .enum(['plaster', ...Object.keys(WALL_SURFACES)] as ['plaster', ...WallSurface[]])
      .optional()
      .describe('Look of the wall: light plaster bricks by default; old-stone for old castle and town walls'),
  }),
  build_house: z.object({
    points: z
      .array(Point)
      .min(3)
      .max(50)
      .describe('Outline [x, z] of the building, at least 3 corners 1 m apart; a 10 x 8 house: [[0,0],[10,0],[10,8],[0,8]]'),
    height: z.number().min(2.5).max(300).optional().describe('Wall height to the eaves in metres (default 3 per storey)'),
    levels: z.number().int().min(1).max(4).optional().describe('Storeys: rows of windows (default 2)'),
    facade: z.enum(['plaster', 'brick', 'stone', 'concrete', 'wood']).optional(),
    facadeColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional().describe('Paint over the facade, e.g. #e8dcc0'),
    roof: z.enum(['flat', 'gabled', 'hipped', 'pyramidal', 'skillion']).optional().describe('Roof shape (default gabled)'),
    roofHeight: z.number().min(0.5).max(80).optional().describe('Eaves to ridge in metres (default: a usual pitch)'),
    roofMaterial: z.enum(['tiles', 'slate', 'metal', 'concrete', 'thatch']).optional(),
    roofColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    name: z.string().min(1).max(64).optional(),
  }),
  add_water: z.object({
    x: Coordinate,
    z: Coordinate,
  }),
  draw_river: z.object({
    points: z
      .array(Point)
      .min(2)
      .max(50)
      .describe('Points [x, z] along the river, from where it starts down to where it ends'),
    width: z
      .number()
      .min(2)
      .max(40)
      .optional()
      .describe('Metres across (8 by default); from 11 it is deep enough to swim in'),
    flow: z.number().min(0).max(6).optional().describe('How fast the water runs (1.5 by default)'),
    widen: z
      .number()
      .min(1)
      .max(2)
      .optional()
      .describe('How much wider it gets towards its end: 1 = the same all along, 1.3 by default (Wider at end)'),
  }),
  set_sea: z.strictObject({
    level: z
      .number()
      .min(-50)
      .max(50)
      .nullable()
      .describe('Height the sea fills up to; null takes the sea away'),
    resource_id: Sea.shape.resourceId
      .unwrap()
      .nullable()
      .optional()
      .describe(
        'Ocean resource id from search_catalog; omitted preserves selection, null restores automatic legacy selection',
      ),
    swell: SeaSwell.strict()
      .nullable()
      .optional()
      .describe(
        'Supported shore-wave direction, period and height; replaces the swell override, null restores automatic direction and source defaults, omitted preserves it',
      ),
  }),
  sculpt_terrain: z.object({
    x: Coordinate,
    z: Coordinate,
    radius: z.number().min(1).max(100),
    operation: z.enum(['raise', 'lower', 'flatten', 'smooth']),
    strength: z.number().min(0.1).max(1).optional(),
  }),
  paint_terrain: z.object({
    x: Coordinate,
    z: Coordinate,
    radius: z.number().min(1).max(100),
    soil: z.enum(['grass', 'dirt', 'sand', 'rock', 'snow']),
    /** Realistic places: a ground material from the library by name (P2-37), e.g. grass-005. */
    material: z.string().max(40).optional(),
  }),
  make_world: z.object({
    kind: WorldSeed.shape.kind.describe(
      'valley: hills with a fall down the middle; island: land with sea all round; plain: gentle and open; mountains: high ground with a pass',
    ),
    seed: WorldSeed.shape.seed
      .optional()
      .describe('Leave out for a new world; the same seed gives the same world'),
  }),
  cover_ground: z.object({
    x: Coordinate,
    z: Coordinate,
    radius: z.number().min(1).max(100),
    cover: z
      .enum(['plants', 'pebbles', 'cleared', 'default'])
      .describe(
        'plants or pebbles scatter them; cleared takes away the trees, grass and cover there; default undoes painted cover and cleared ground',
      ),
  }),
  set_sky: z.object({
    preset: SkyPreset,
    /** Minutes per day for a day-night cycle (P2-02); 0 keeps the sky fixed. */
    cycle_minutes: z.number().min(0).max(120).optional(),
    /** Tidewater world (task 2): a fixed hour, the sun's path turned, and the wind; all optional. */
    time_of_day: z
      .number()
      .min(0)
      .max(24)
      .optional()
      .describe('Hour of the day, 0-24 (e.g. 16.2 for late afternoon)'),
    sun_azimuth: z
      .number()
      .min(-180)
      .max(180)
      .optional()
      .describe("Turns the sun's daily path about the vertical, in degrees (0 = the sun sets in the west)"),
    wind_direction: z
      .number()
      .min(0)
      .lt(360)
      .optional()
      .describe('Where the wind comes from, degrees clockwise from north (-z)'),
    wind_speed: z.number().min(0).max(30).optional().describe('Wind speed in m/s (7 is a fresh breeze)'),
  }),
  /** A rectangle of exact ground heights (MCP build clients, Tidewater world task 2). */
  set_ground_heights: z.object({
    x0: Coordinate.describe('South-west corner x (snapped to the ground grid)'),
    z0: Coordinate.describe('South-west corner z (snapped to the ground grid)'),
    cols: z.number().int().min(1).max(HEIGHT_TILE_MAX).describe('Grid points along +x (at most 129)'),
    rows: z.number().int().min(1).max(HEIGHT_TILE_MAX).describe('Grid points along +z (at most 129)'),
    step: z.number().positive().max(64).describe('Metres between points: the ground spacing (2 m)'),
    base: z.number().min(-1000).max(1000).describe('Heights are given relative to this height in metres'),
    heights_cm: z
      .string()
      .max(Math.ceil((HEIGHT_TILE_MAX * HEIGHT_TILE_MAX * 2) / 3) * 4)
      .describe('base64 of little-endian int16 centimetres above base, row by row (+x first, then +z)'),
  }),
  /** Many exact placements in one change (MCP build clients, Tidewater world task 2). */
  place_items: z.object({
    items: z
      .array(
        z.object({
          itemId: z.string().max(128),
          x: Coordinate,
          z: Coordinate,
          y: z
            .number()
            .min(-200)
            .max(600)
            .optional()
            .describe('Exact height of the base; left out, the item rests on what is under it'),
          turn: z.number().min(-360).max(360).optional().describe('Turn in degrees (0 = facing +z)'),
          size: z.number().min(0.05).max(20).optional().describe('Size factor, 1 = normal'),
          stretch: Stretch.optional(),
          lean: z
            .number()
            .min(-45)
            .max(45)
            .optional()
            .describe('Tilt in degrees toward the front of the item (+z before the turn)'),
          params: z
            .record(z.string().max(32), z.union([z.string().max(64), z.number(), z.boolean()]))
            .optional()
            .describe("The item's own settings, e.g. the parameters of a generated item within its limits"),
        }),
      )
      .min(1)
      .max(PLACE_ITEMS_MAX),
  }),
  /** Paint a soil or a cover where a rule holds (MCP build clients, Tidewater world task 2). */
  paint_ground_rule: z.object({
    ...Area,
    soil: z.enum(['grass', 'dirt', 'sand', 'rock', 'snow', 'mud']).optional(),
    material: z
      .string()
      .max(40)
      .optional()
      .describe('Realistic places: a ground material by name, counting as its soil'),
    cover: z.enum(['plants', 'pebbles', 'cleared', 'default']).optional(),
    height: z
      .tuple([z.number(), z.number()])
      .optional()
      .describe('Only where the ground is between these heights (m)'),
    slope: z
      .tuple([z.number().min(0).max(90), z.number().min(0).max(90)])
      .optional()
      .describe('Only where the ground is this steep, in degrees'),
    depth_below_sea: z
      .tuple([z.number(), z.number()])
      .optional()
      .describe('Only where the ground lies this many metres below the sea'),
  }),
  set_weather: z.object({
    preset: WeatherPreset,
    strength: z.number().min(0.2).max(2).optional().describe('How much rain, snow or sand falls: 1 is the preset (WORLD-W4); kept when only the preset changes'),
  }),
  /** The place's scroll story (SCROLL-02): every call replaces all stops. */
  set_lights: z.object({
    action: z.enum(['list', 'add', 'update', 'remove', 'three_point']).describe('three_point replaces every light with a key, a fill and a back light on the avatar'),
    id: z.string().max(80).optional().describe('Light id from list (update, remove)'),
    name: z.string().min(1).max(80).optional(),
    enabled: z.boolean().optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    intensity: z.number().min(0).max(200).optional().describe('Brightness (20 by default)'),
    angle: z.number().min(5).max(85).optional().describe('Beam width in degrees'),
    softness: z.number().min(0).max(1).optional().describe('Soft edge, 0 hard .. 1 soft'),
    distance: z.number().min(1).max(200).optional().describe('Reach in metres'),
    follows: z.string().max(120).nullable().optional().describe('"self" follows the avatar, an actor id follows it, null stays at a world position'),
    position: z.tuple([Coordinate, z.number().min(-500).max(500), Coordinate]).optional().describe('[x, y, z]; an offset from the actor when it follows one'),
    aim: z.tuple([Coordinate, z.number().min(-500).max(500), Coordinate]).optional().describe('Where it points, [x, y, z]'),
  }),
  set_spawn: z.object({
    x: Coordinate,
    z: Coordinate,
    turn: z.number().min(-360).max(360).optional().describe('Facing in degrees (0 = +z)'),
  }),
  set_water_look: z.object({
    clarity: z.number().min(1).max(20).optional().describe('How far you see through the water, metres'),
    waves: z.enum(['calm', 'normal', 'rough']).optional(),
  }),
  set_story: z.strictObject({
    title: z.string().max(120).optional().describe('Name of the story page'),
    stops: z
      .array(
        z.strictObject({
          position: z
            .tuple([z.number(), z.number(), z.number()])
            .describe('Camera x, height y, z in metres (absolute height, not above the ground)'),
          look_at: z.tuple([z.number(), z.number(), z.number()]).describe('The point the camera looks at, x, y, z in metres'),
          fov: z.number().min(10).max(120).optional().describe('Lens: vertical field of view in degrees (50 by default; wider shows more)'),
          ease: z
            .enum(['linear', 'in', 'out', 'in_out'])
            .optional()
            .describe('How the flight to the next stop speeds up and slows down (in_out by default)'),
          kicker: z.string().max(60).optional().describe('Small line above the title'),
          title: z.string().max(120).describe('Title shown at this stop'),
          text: z.string().max(600).optional().describe('A sentence or two under the title'),
          side: z
            .enum(['left', 'right', 'center'])
            .optional()
            .describe('Side of the screen the words sit on, away from what the stop shows'),
        }),
      )
      .max(32)
      .nullable()
      .describe('The stops in order, 2 to 32; null removes the story'),
  }),
  set_style: z.object({ base: Style }),
  /** The place's game (P9-12): unset fields keep the game's current settings. */
  set_game: z.object({
    /** True removes the game: the place is an ordinary world again. */
    remove: z.boolean().optional(),
    teams: z.enum(['none', 'two']).optional(),
    minutes: z
      .number()
      .min(GAME_LIMITS.durationSec.min / 60)
      .max(GAME_LIMITS.durationSec.max / 60)
      .optional(),
    health: z.number().int().min(GAME_LIMITS.health.min).max(GAME_LIMITS.health.max).optional(),
    respawn_seconds: z
      .number()
      .int()
      .min(GAME_LIMITS.respawnDelaySec.min)
      .max(GAME_LIMITS.respawnDelaySec.max)
      .optional(),
    min_players: z.number().int().min(GAME_LIMITS.minPlayers.min).max(GAME_LIMITS.minPlayers.max).optional(),
    tools: z
      .array(z.string().max(128))
      .max(GAME_LIMITS.loadoutItems)
      .optional()
      .describe('Item ids of the tools every player holds (only items that are tools); [] takes them away'),
  }),
  /**
   * The game's generic rules (generic rules Task 8): the same data the Place settings rules editor
   * saves. A given list replaces the game's list; parts not given stay as they are.
   */
  set_rules: z.object({
    add_counters: z
      .array(Counter)
      .max(RULE_LIMITS.counters)
      .optional()
      .describe('Counters to add to the game, keeping the ones it has'),
    remove_counters: z
      .array(z.string().max(RULE_LIMITS.name))
      .max(RULE_LIMITS.counters)
      .optional()
      .describe('Names of counters to take away (from get_game)'),
    add_rules: z
      .array(Rule)
      .max(RULE_LIMITS.rules)
      .optional()
      .describe('Rules to add after the ones the game has, keeping them'),
    remove_rules: z
      .array(z.number().int().min(0))
      .max(RULE_LIMITS.rules)
      .optional()
      .describe('Indexes of rules to take away, as get_game numbers them'),
    add_hud: z
      .array(HudBinding)
      .max(RULE_LIMITS.hud)
      .optional()
      .describe('Displays to add, keeping the ones the game has'),
    remove_hud: z
      .array(z.number().int().min(0))
      .max(RULE_LIMITS.hud)
      .optional()
      .describe('Indexes of displays to take away, as get_game numbers them'),
    counters: z
      .array(Counter)
      .max(RULE_LIMITS.counters)
      .optional()
      .describe('Replaces the whole counter list (read it with get_game first; add_counters keeps it)'),
    rules: z
      .array(Rule)
      .max(RULE_LIMITS.rules)
      .optional()
      .describe('Replaces the whole rule list (read it with get_game first; add_rules keeps it)'),
    ranking: Ranking.optional().describe('The counter that orders players (high or low first)'),
    hud: z
      .array(HudBinding)
      .max(RULE_LIMITS.hud)
      .optional()
      .describe(
        'Replaces the whole display list (a counter, their place, or the time left; add_hud keeps it)',
      ),
    remove: z
      .array(z.enum(['counters', 'rules', 'ranking', 'hud']))
      .max(4)
      .optional()
      .describe('Parts to take away from the game'),
    highest_score_wins: z
      .boolean()
      .optional()
      .describe(
        'false: the highest score no longer wins (a rule with end_match must end the match); true turns it back on',
      ),
  }),
  /** Any placed item can be a zone (generic rules): an area or a gate with a tag the rules name. */
  set_zone: z.object({
    instanceId: z.string().max(128).describe('Instance id of a placed item (from get_world_summary)'),
    shape: z
      .enum(['area', 'gate', 'off'])
      .optional()
      .describe('area: players are inside it; gate: players cross it going forward; off: no zone any more'),
    tag: z
      .string()
      .trim()
      .min(1)
      .max(RULE_LIMITS.name)
      .optional()
      .describe('The name the rules use for this zone'),
    visible: z.boolean().optional().describe('true: players see the zone while playing'),
  }),
  /**
   * Any placed item can be ridden (movement modes): a movement model (the medium) and generic
   * numbers, stored as the item's params through one `set_item_params`.
   */
  set_ride: z.object({
    instance_id: z.string().max(128).describe('Instance id of a placed item (from get_world_summary)'),
    model: RideModel.nullable()
      .optional()
      .describe(
        'ground: follows the surface; water: floats on water; air: flies; null: not rideable any more',
      ),
    preset: z
      .boolean()
      .optional()
      .describe("true: start again from the model's starting numbers (a new model always starts from them)"),
    seats: z
      .number()
      .int()
      .min(1)
      .max(RIDE_LIMITS.seats)
      .optional()
      .describe('Riders it carries; seat 1 steers'),
    max_speed: z.number().min(1).max(RIDE_LIMITS.maxSpeed).optional().describe('Top speed forward, m/s'),
    reverse: z.number().min(0).max(1).optional().describe('Top speed backward as a share of the top speed'),
    accel: z
      .number()
      .min(RIDE_LIMITS.accel[0])
      .max(RIDE_LIMITS.accel[1])
      .optional()
      .describe('m/s gained per second'),
    turn: z
      .number()
      .min(RIDE_LIMITS.turnDeg[0])
      .max(RIDE_LIMITS.turnDeg[1])
      .optional()
      .describe('Degrees per second at full steer'),
    grip: z.number().min(0).max(1).optional().describe('1: no sideways sliding; 0: slides freely'),
    gravity: z.number().min(0).max(3).optional().describe('Gravity multiplier'),
    climb: z
      .number()
      .min(RIDE_LIMITS.climb[0])
      .max(RIDE_LIMITS.climb[1])
      .optional()
      .describe('air: up and down speed, m/s'),
    glide: z.boolean().optional().describe('air: true needs forward speed to stay up; false hovers'),
    ceiling: z
      .number()
      .min(RIDE_LIMITS.ceiling[0])
      .max(RIDE_LIMITS.ceiling[1])
      .optional()
      .describe('air: highest point above the ground under it, m'),
    camera: z
      .number()
      .min(RIDE_LIMITS.camera[0])
      .max(RIDE_LIMITS.camera[1])
      .optional()
      .describe('Camera distance, m'),
    seat_height: z.number().min(0).max(1).optional().describe("Seat height as a share of the item's height"),
    pose: z.enum(['sit', 'stand']).optional().describe('How riders are shown'),
    reach: z
      .number()
      .min(RIDE_LIMITS.reach[0])
      .max(RIDE_LIMITS.reach[1])
      .optional()
      .describe('How close to get on, m'),
    exit: z
      .number()
      .min(RIDE_LIMITS.exit[0])
      .max(RIDE_LIMITS.exit[1])
      .optional()
      .describe('Get-off distance, m'),
    return_seconds: z
      .number()
      .min(RIDE_LIMITS.returnSec[0])
      .max(RIDE_LIMITS.returnSec[1])
      .optional()
      .describe('Seconds an empty item waits before going back to its place; 0 stays'),
    tag: z
      .string()
      .trim()
      .min(1)
      .max(RIDE_LIMITS.tag)
      .nullable()
      .optional()
      .describe('The name rules use for it (mounted, dismounted, riding); null takes it away'),
  }),
  /** Place scripts (P2-10): the reference of the Genvr Script API (`SCRIPT_API` in the contracts). */
  get_script_api: z.object({
    part: z
      .enum(['guide', 'types'])
      .optional()
      .describe('guide (default): members, limits and examples; types: the TypeScript declarations'),
  }),
  get_scripts: z.object({
    script_id: ScriptId.optional().describe("A script's id (from the list) to read its source"),
    from_line: z
      .number()
      .int()
      .min(1)
      .max(100_000)
      .optional()
      .describe('Show the source from this line on (a long source comes in pages; see more_lines_from)'),
  }),
  /** One `set_script` command: add, change, switch on or off, or remove one script. */
  set_script: z.object({
    script_id: ScriptId.optional().describe('The script to change or remove; leave out to add a new one'),
    name: PlaceScript.shape.name.optional().describe('Its name (needed for a new script)'),
    source: z
      .string()
      .max(SCRIPT_LIMITS.sourceChars)
      .optional()
      .describe('The whole JavaScript source (classic script on the Genvr Script API)'),
    enabled: z.boolean().optional().describe('false switches it off (it stays saved and does not run)'),
    remove: z.boolean().optional().describe('true removes the script'),
  }),
  /** A dry run (spec 12): nothing is saved. */
  test_script: z.object({
    script_id: ScriptId.optional().describe(
      'A saved script to test (with source: test that text in its place)',
    ),
    source: z.string().max(SCRIPT_LIMITS.sourceChars).optional().describe('An unsaved draft to test'),
    events: z
      .array(ScriptTestEvent)
      .max(SCRIPT_LIMITS.testEvents)
      .optional()
      .describe(
        'Events to replay, as scripts hear them, with players as handles (p1, p2, ...) and an optional at (ms)',
      ),
    recording: z
      .literal('last_match')
      .optional()
      .describe("Replay the events of the place's last match in an open room instead"),
    players: z
      .number()
      .int()
      .min(1)
      .max(8)
      .optional()
      .describe('Players at the start when no player_joined is given (2)'),
    seed: z
      .number()
      .int()
      .min(0)
      .max(4_294_967_295)
      .optional()
      .describe('The random seed (the same seed, the same numbers)'),
  }),
  get_script_logs: z.object({
    since: z.number().min(0).optional().describe('Only lines after this time (ms of the room clock)'),
  }),
  ask_user: z.object({
    question: z.string().max(200),
    options: z.array(z.string().max(60)).min(2).max(5),
  }),
} as const;

export type ToolName = keyof typeof TOOL_ARGS;
export type ToolArgs<N extends ToolName> = z.infer<(typeof TOOL_ARGS)[N]>;

const DESCRIPTIONS: Record<ToolName, string> = {
  avatar_voice: 'Manage local avatar voices: design a synthetic voice using language/voiceType/text/description, audition its draft, save_design with audioId/name, then assign separately. Models and installation, authorized reference voice profiles (clone), assign a voice, generate speech (speak), and poll job status. Call models/voices first; install and speak return job IDs. Audio stays local. Arabic support depends on the selected model.',
  user_avatar_library: 'List private user characters and motions, assign an available character ID to self or a host agent, or play an available private motion ID. delete (id) removes an imported character or motion from this device only after the owner presses Delete in the Studio; it answers deleted or cancelled, and targets that used it fall back to the Standard robot. Built-in bodies cannot be deleted. No asset publishing or redistribution. List before choosing IDs.',
  share_studio: 'Inspect sharing capability, open the separate Share dialog, or create a host-authorized world/Avatar Live link. Creating requires explicit user authorization and an attached platform sharing service; local SDK cannot publish private data. Password enforcement belongs to the host server.',
  avatar_studio: 'Avatar tab: inspect the character (recipe, view, bones, height, whether the face can move); set merges recipe parts (name, body, shape {height, weight, scale, anime, muscle, fat, fatPattern, definition, muscles {group: -1..1}, fatRegions {region: -1..1}, face {feature: -1..1}}, colors {skin, hair, top, bottom, shoes}, hair); view sets the view mode (skeleton, muscles, fat…) and shading; expression holds a facial expression; play a move by id; save the character to My characters; export the recipe JSON; reset_shape back to the normal shape; undo / redo step through the character edits. Works on the live Studio only.',
  present_avatar: 'Use kind display to open/configure Avatar Live layouts (large, desktop, browser, compact, banner, circle, watch), background and framing. For saved world backgrounds, use worldId from inspect_studio.availableWorlds and optional worldSpot {position,target,player} XYZ coordinates; set worldId/worldSpot to null for the current live world view. Optionally show a gesture, facial expression, visual effect, notification or rich card when useful. Transient, never saves the world. target is self or a host agent ID. Use only available Core animation IDs. Never invent live app or stock data. No action permissions are granted by a card.',
  motion_lab: 'Motion lab (only in a motion lab project): { operation: { kind } }. Kinds: commands (list with help), inspect, course_get, course_set, obstacle_add {obstacle: {kind step|ramp|gap|low_wall|window, z, sizes in metres}}, obstacle_set {id, set}, obstacle_remove {id}, course_from_seed {seed, obstacles?, hardness?, street?}, traffic_set {street?, cars?}, settings_set {settings}, characters (who can run: the Standard robot and My characters; who runs now; follows the Avatar tab by default), who_set {who: a character id or "avatar"}, run {settings?, version?} (fixed step + seed, returns score and events), runs_list, scores {run?}, frame {run?, t}, view_set {overlays?, speed?}, versions, save_version {run?, note?}, save_best {version} (only asks: the owner confirms it in the Lab), rollback {version}, version_delete {version, confirm: true} (only versions an agent made, never the best). Sharing with the GenVR community (publishing): motions_mine (share state, rights), motion_similar {version}, share_prepare {version, share: {name, description?, tags?, preview_s?}} (prepares only), share {version, confirm: true} (owner only: you are refused, the owner confirms in the Lab), unshare {version, confirm: true}. Never prepare a share the owner did not ask for. Pose and key frames (board M11; frames at 60 per second, sliders named as in the Avatar pose panel, e.g. R.elbow.bend, L.index.mid, head.nod, root.y in metres): pose_list, pose_new {name, frames?, loop?, from: stand|t_pose}, pose_open {motion}, pose_get {frame}, pose_set {frame, joint, side: both|left|right, value} or {frame, values} (stops at the joint law; a change on a frame not keyed for that joint waits as a draft until key_add), key_add {frame, rows?: body|right_arm|right_hand|left_arm|left_hand|legs, ease?: linear|smooth|hold}, key_remove {frame, rows?}, key_ease {frame, ease}, key_copy {from, to, rows?}, limb_move {frame, limb: left_hand|right_hand|left_foot|right_foot, target: [x,y,z] or by: [dx,dy,dz] metres}, pin {limb, on}, pose_mirror {frame, mode: swap|left_to_right|right_to_left}, pose_test (Test in course), pose_save_version {note?}. Read inspect before changing the course. Best versions and scores compare runs of one character only.',
  get_resource_controls:
    'Read supported controls, scope, source defaults and documentation for a Core model or ocean resource. Models use instance-scoped set_resource_params; oceans use world-scoped set_sea. Empty model controls means no generated settings; creator package controls are not described.',
  set_resource_params:
    'Change supported generated controls on one placed Core item. Use keys and ranges from get_resource_controls; null removes an instance override and restores its resource default. Saved as a normal undoable change. Does not change world defaults or arbitrary script parameters.',
  get_world_summary:
    'Describe the place now: size, style, sky, items with ids and positions, roads, walls, water, rivers, and the sea. Items come 100 at a time; more_items_from names the from_item of the next page.',
  get_game:
    "Read the place's game as JSON: its clock, counters, rules numbered by index, ranking, displays, and whether the highest score wins. Read it before changing rules the game already has.",
  search_catalog:
    'Find Core models to place (trees, furniture, parts, houses) or reusable ocean resources. Models use place_item; oceans are world-scoped and use set_sea with resource_id, never place_item. Read get_resource_controls before changing resource settings.',
  place_item:
    'Place one item at x, z. It stands on the ground, a room floor, or building blocks there; use on to put it on top of another item.',
  scatter_items: 'Place many items at random inside a circle (forests, flower fields, rocks).',
  build_platforms:
    "Side-view (2D) places only: build a course of platforms on the players' line at x positions and heights, for jumping from one to the next. It keeps every jump possible by itself (moves platforms closer or lowers them), so call it once per course.",
  move_item: 'Move, turn or resize a placed item by its instance id.',
  list_library: 'Browse the Items tab library by kind (and 3D group), only items that fit this place\'s style: id, name, price. Use search_catalog for words.',
  set_item_look: 'Change the colour and/or material of placed items (the Appearance tab). Locked items are refused.',
  name_items: 'Name placed items as they show in the Explorer.',
  group_items: 'Group placed items so they move, lock and copy together.',
  ungroup_items: 'Take a group apart; its items stay where they are.',
  set_item_flags: 'Anchor items (they stay put) or let physics move them while playing; mark items as meant to float.',
  settle_items: 'Let items fall and come to rest, like in play (one undo step). Needs a live Studio.',
  edit_river: 'Change a river already drawn: its width, how much it widens, its current, or its course (the bed is carved again).',
  add_opening: 'Cut a door or a window into a wall (the same as the Door and Window tools). Doors start at the ground.',
  remove_parts: 'Remove roads, walls and rooms, ponds and lakes, rivers, paved areas, or one door or window (kind opening with its wallId), by their ids from get_world_summary.',
  lock_items: 'Lock placed items so nobody moves them by accident. Locked items cannot be moved or removed with these tools; only the owner unlocks them in the Studio.',
  world_history: 'Undo or redo your own last world change. It refuses when the person changed the place after it, so their work is never undone.',
  remove_items: 'Remove placed items by their instance ids (from get_world_summary).',
  fill_blocks:
    'Block places only: fill a box of blocks between two corners, on the ground (towers, blocks, platforms); hollow: true makes a hut with walls, floor, and roof.',
  block_line:
    'Block places only: a line of blocks through points that follows the ground, height blocks high (walls, fences, paths of stone).',
  block_floor:
    'Block places only: change the top block of the ground between two corners (a brick square, a sand beach, a paving yard).',
  dig_blocks:
    'Block places only: dig the ground away between two corners, depth blocks deep (holes, pits, moats; low holes fill with water).',
  draw_road: 'Draw a road through points; the ground is flattened and bridges are built over water.',
  pave_area: 'Pave an area on the ground with an exact edge (a square, market place or car park); roads lie on top.',
  draw_wall: 'Draw a wall through corner points; closed makes a room with a floor.',
  build_house:
    'Build a house seen from outside (like the real town houses): walls on an outline with windows by storey, a door, and a roof (gabled, hipped, ...) in real textures.',
  add_water: 'Make a pond or lake at x, z (the ground is dug when needed).',
  draw_river:
    'Draw a river through points. It carves its own bed, always runs downhill, turns steep drops into waterfalls, and stops by itself when it reaches a lake or the sea. From 11 m wide players can swim in it and the current carries them.',
  set_lights: 'The place\'s lights (World › Lighting, also used by Filming): list them, add (up to 4), update or remove one by id, or three_point for a key, fill and back light on the avatar.',
  set_spawn: 'Move the start point, where players appear.',
  set_water_look: 'How the water looks in Realistic places: clarity (see through, metres) and waves (calm, normal, rough).',
  set_story:
    'Tell the place as a scroll page (/showcase?place=<place id>): the camera flies from stop to stop as visitors scroll, with words at each stop. Replaces all stops at once (get_world_summary lists the current ones); stops: null removes the story. Creators can also add stops from the studio camera in the Story panel.',
  set_sea:
    'Fill everything below a height with sea water. Select a reusable ocean with resource_id and read get_resource_controls for its supported style and swell controls. Swell replaces the override; null resets automatic direction and source defaults. Omitted resource_id/swell preserve them. level null removes the sea. This is a normal undoable world setting.',
  sculpt_terrain: 'Raise (hills), lower (valleys), flatten, or smooth the ground in a circle.',
  paint_terrain:
    'Paint the ground in a circle with grass, dirt, sand, rock, or snow. In Realistic places, material names a real ground material: grass-001, grass-004, grass-005, grass-008, ground-103 (soil), ground-106 (mud), ground-110 (gravel), ground-080 (beach sand), ground-093-c (dune sand), rock-051, rock-063, snow-006, snow-012, road-007, asphalt-031, bricks-104.',
  make_world:
    'Give the place a whole starter world: hills, woods, and real trees and rocks around the spawn, with the spawn moved onto the new ground. Ground the builder already shaped keeps its shape. Look at "Ground:" in the summary first: do not use it when the place already is the kind of world asked for, and never for small changes.',
  cover_ground:
    'Places made with make_world only: scatter small plants or pebbles over the ground in a circle, or clear it so no trees or grass grow there, or undo that painting.',
  set_sky:
    'Change the time of day and the sky: day, sunset, night, storm, or tropical. For day and night that follow each other, give cycle_minutes (minutes per day, e.g. 20); 0 stops the cycle. time_of_day fixes the hour (0-24), sun_azimuth turns the sun path, wind_direction (where it comes from, degrees from north) and wind_speed (m/s) set the wind; each is optional.',
  set_ground_heights:
    'Write exact ground heights on a grid: cols x rows points (at most 129 x 129) from the south-west corner x0, z0 every step metres (the ground spacing, 2 m), row by row along +x then +z, as base64 of little-endian int16 centimetres relative to base metres. Soils and cover stay; undo restores the tile. For whole landscapes made by a build script; read them back with get_ground_heights.',
  place_items:
    'Place up to 200 items in one change at exact spots: each with itemId, x, z, and optionally y (exact height; left out it rests on what is under it), turn, size, lean (degrees toward its front) and params (its own settings, e.g. the parameters of a generated item within its limits). Nothing is placed when one item is refused.',
  paint_ground_rule:
    'Paint a soil (or a ground material by name) or a cover on every ground point inside a box of at most 512 x 512 m where a rule holds: height between two values, slope between two angles, and depth below the sea between two values. Give a soil or a cover, not both.',
  set_weather:
    'Change what falls from the sky: clear, rain, snow, storm, fog, or sandstorm. For sunset or night use set_sky.',
  set_style: 'Change the look of the whole place.',
  set_game:
    'Turn the place into a game, change its settings, or make it an ordinary world again (remove true). A new game has a match clock, a point per knock-out and the highest score wins. teams two splits players into red and blue. minutes is the match length, health how much each player can take, respawn_seconds the wait before a player is back, min_players how many players the match waits for. Give only what should change. tools lists the item ids every player holds (search the catalog; only tools). Spawn points come from the catalog (search "spawn point").',
  set_rules:
    "Set the game's own rules, made from generic parts (a place without a game gets a new one first). counters are named numbers (scope player, team or global). Each rule: when an event (zone_entered, zone_exited, zone_crossed with the zone's tag; player_joined, player_left, hit, died, respawned, phase_changed, time_up, counter_changed with the counter, timer_fired, or a custom name raised by emit), if conditions (counter compared with a number or another counter, phase, team, riding with an optional ride tag), do actions (add_counter, set_counter, add_score, end_match, start_timer, damage, heal, teleport_to_zone, show_message, emit, dismount, set_speed with factor and seconds). mounted and dismounted (with a rideable item's tag) are events too; hud can show speed. A match that ends when time is up must be ended by a rule for time_up itself. ranking names the counter that orders players; hud what players see. To change a game that has rules, read it with get_game first and use add_rules, remove_rules (by index), add_counters, remove_counters, add_hud and remove_hud, which keep everything else; counters, rules and hud replace the whole list; remove takes parts away; highest_score_wins false turns off the highest score winning. Zones come from set_zone.",
  set_zone:
    'Make a placed item a zone for the rules, change its tag, or make it an ordinary item again (shape off). area: players are inside it; gate: players cross it going forward. The Zone Area and Zone Gate items from the catalog are zones by themselves and only need a tag.',
  set_ride:
    'Make a placed item a rideable item: players walk up to it, get on and move with it (model ground, water or air), change its numbers, or make it not rideable (model null). A new model starts from its starting numbers; give only what should change. tag names it for rules.',
  get_script_api:
    "The Genvr Script API for place scripts: small JavaScript files that hear the same events as the rules and may only ask for the rules' actions, which the engine runs or refuses. part types gives the TypeScript declarations.",
  get_scripts:
    "List the place's scripts (id, name, on or off, size), or read one script's source with line numbers (script_id; a long source comes in pages, from_line).",
  set_script:
    "Add, change, switch on or off, or remove one place script. A new script needs name and source; an existing one takes script_id and only what changes (name, source, enabled); remove true removes it. A saved change restarts the match in open rooms. The answer lists the script's Checks. Read get_script_api before writing one.",
  test_script:
    "Dry-run one script without saving it: a saved script (script_id) or a draft (source), on the place's game with players p1, p2, ..., through the given events (as scripts hear them, with an optional at in ms) or the last match's recording. Answers with the actions it asked for (accepted or refused and why), events that could not be replayed, the counters after, its log and its state.",
  get_script_logs:
    "The place's script log from its open room: what the scripts wrote with genvr.log, errors with their line, refused requests, strikes and switch-offs. Empty when no room is open.",
  ask_user: 'Ask the builder one short question with 2 to 5 answer buttons when a choice is really needed.',
};

/** Tools that build with blocks: only places with block ground offer them (P2-26). */
export const BLOCK_TOOLS: readonly ToolName[] = ['fill_blocks', 'block_line', 'block_floor', 'dig_blocks'];
/** Tools that shape the smooth height-field ground: block places do not offer them. */
export const HEIGHT_FIELD_TOOLS: readonly ToolName[] = [
  'sculpt_terrain',
  'set_ground_heights',
  'paint_ground_rule',
  'paint_terrain',
  'add_water',
  'draw_river',
  'set_sea',
  'make_world',
  'cover_ground',
];

/**
 * Bulk tools for MCP build clients (Tidewater world, task 2): base64 heights and lists of 200 items are no work for
 * the in-app assistant's small models, so its tool list leaves them out (they still run through `runTool`).
 */
export const MCP_BULK_TOOLS: readonly ToolName[] = ['set_ground_heights', 'place_items', 'paint_ground_rule'];

/** Tool definitions in the Ollama / OpenAI function format, generated from the argument schemas. */
export const TOOL_DEFINITIONS = (Object.keys(TOOL_ARGS) as ToolName[]).map((name) => {
  const parameters = z.toJSONSchema(TOOL_ARGS[name], { io: 'input' }) as Record<string, unknown>;
  // Models do not need the JSON Schema dialect line.
  delete parameters.$schema;
  return {
    type: 'function' as const,
    function: { name, description: DESCRIPTIONS[name], parameters },
  };
});

/**
 * The tools a place offers: block places build with blocks instead of shaping the ground;
 * other places have no blocks to build with. Fewer tools also help small models choose.
 */
export function toolDefinitions(place: { blockGround: boolean }) {
  const hidden = new Set([...(place.blockGround ? HEIGHT_FIELD_TOOLS : BLOCK_TOOLS), ...MCP_BULK_TOOLS]);
  return TOOL_DEFINITIONS.filter((tool) => !hidden.has(tool.function.name));
}

export const isToolName = (name: string): name is ToolName => Object.hasOwn(TOOL_ARGS, name);
