import { z } from 'zod';
import { AccessPolicy } from './access.js';
import { readLegacyItems, StoredGame } from './game.js';
import { ExperienceType, Id, Params, SizeTier, Style, Transform, Vec2 } from './common.js';
import { PlaceScripts } from './script.js';
import { PlaceStory } from './story.js';
import { TerrainFieldSets, TerrainActiveSurface } from './terrain-fields.js';

/**
 * Steepest ground each style allows, in degrees (P2-11, docs/ENGINE-RULES.md "unnatural
 * cliffs"). Sculpting never goes past it and the world checks report steeper ground.
 */
export const MAX_TERRAIN_SLOPE: Record<Style, number> = {
  realistic: 40,
  anime: 50,
  blocky: 55,
  voxel: 65,
};

export const StyleSelection = z.object({
  base: Style,
  /** Optional accent style for specific zones or items. */
  accent: Style.optional(),
  /**
   * Realistic ground (P2-37): snow covers ground above this height in meters; null turns it off;
   * absent uses the style's default.
   */
  snowLine: z.number().min(-50).max(500).nullable().optional(),
  /** Realistic ground: rock shows by itself on steep slopes (absent means on). */
  autoRock: z.boolean().optional(),
  /**
   * Realistic ground (P2-38): grass grows by itself on grass materials; density 0.25 (sparse) to 2
   * (thick), 1 by default. Absent means on at density 1.
   */
  grass: z.object({ on: z.boolean(), density: z.number().min(0.25).max(2) }).optional(),
  /**
   * The starter world's woods (P2-40): the same kind of setting as grass, because they are the same
   * kind of thing, a rule the ground follows rather than anything stored. Density multiplies what
   * the world's kind scatters. Absent means on at 1, and it does nothing in a place with no world.
   */
  woods: z.object({ on: z.boolean(), density: z.number().min(0.25).max(2) }).optional(),
  /**
   * Water (P2-39): how many meters one can see down into it, and how the surface moves. Kept here
   * beside grass so the World tab's settings undo and save with the rest of the world.
   */
  water: z
    .object({
      clarity: z.number().min(1).max(20),
      waves: z.enum(['calm', 'normal', 'rough']),
    })
    .optional(),
});

/** The six soils a ground point can count as (footsteps, item rules, and colors in other styles). */
export const SoilName = z.enum(['grass', 'dirt', 'sand', 'rock', 'snow', 'mud']);
export type SoilName = z.infer<typeof SoilName>;

/** A ground material from the library (P2-37), with the soil it counts as. */
export const GroundMaterialRef = z.object({ id: Id, soil: SoilName });
export type GroundMaterialRef = z.infer<typeof GroundMaterialRef>;

/** Palette slots of a place's ground: 0-5 are the six soils, 6-15 extra materials. */
export const GROUND_SLOTS = 16;
export const GroundSlot = z.string().regex(/^(1[0-5]|[0-9])$/);
export type StyleSelection = z.infer<typeof StyleSelection>;

export const SkyPreset = z.enum(['day', 'sunset', 'night', 'storm', 'tropical']);
export type SkyPreset = z.infer<typeof SkyPreset>;
/**
 * Sky settings kept in `environment.sky.params` (Tidewater world, task 2; `set_sky` over MCP): the hour of the day
 * (0-24; Tidewater 16.2), a turn of the sun's daily path about the vertical in degrees (Tidewater 0), and the wind:
 * where it comes from in degrees clockwise from north (-z), and its speed in m/s (Tidewater (0.35, 0.94) at 7 m/s).
 * `cycle` is the day-night cycle in minutes per day (P2-02). Every one is optional; absent keeps the sky's own.
 */
export const SkySettings = z.object({
  cycle: z.number().min(0).max(120).optional(),
  timeOfDay: z.number().min(0).max(24).optional(),
  sunAzimuth: z.number().min(-180).max(180).optional(),
  windDirection: z.number().min(0).lt(360).optional(),
  windSpeed: z.number().min(0).max(30).optional(),
});
export type SkySettings = z.infer<typeof SkySettings>;

/** The sky settings of a place's sky params, dropping any value that is not valid (old or hand-made data). */
export function readSkySettings(params: Readonly<Record<string, unknown>> | undefined): SkySettings {
  const out: Record<string, number> = {};
  for (const key of Object.keys(SkySettings.shape) as (keyof SkySettings)[]) {
    const parsed = SkySettings.shape[key].safeParse(params?.[key]);
    if (parsed.success && parsed.data !== undefined) out[key] = parsed.data;
  }
  return out as SkySettings;
}

export const WeatherPreset = z.enum(['clear', 'rain', 'snow', 'storm', 'fog', 'sandstorm']);
export type WeatherPreset = z.infer<typeof WeatherPreset>;

/** Name a builder gives an object in the studio explorer (task P3-26). */
export const ObjectName = z.string().min(1).max(64);

export const WaterBody = z.object({
  id: Id,
  name: ObjectName.optional(),
  kind: z.enum(['sea', 'lake', 'river']),
  /** Polygon outline on the ground plane (x, z). */
  area: z.array(Vec2).min(3),
  level: z.number(),
  params: Params.default({}),
});
export type WaterBody = z.infer<typeof WaterBody>;

/**
 * A river (P2-39): a line that carves a bed into the ground and follows its slope downhill. Only
 * the shape is stored; the water level along it is derived from the terrain by `riverProfile`, so
 * sculpting a hill moves the river with it. A `WaterBody` of kind river in an older place keeps
 * drawing as a flat polygon.
 */
export const River = z.object({
  id: Id,
  name: ObjectName.optional(),
  /** Centerline on the ground plane (x, z), drawn like a road. */
  points: z.array(Vec2).min(2).max(200),
  width: z.number().min(2).max(40).default(6),
  /** How much wider the river is at its mouth (1 = the same all along). */
  widen: z.number().min(1).max(2).default(1.3),
  /** Current at a normal slope, in meters per second; steeper stretches run faster. */
  flow: z.number().min(0).max(6).default(1.5),
  params: Params.default({}),
});
export type River = z.infer<typeof River>;

/**
 * The sea (P2-39): one per place, made by a level rather than a drawn shape. Everything below it
 * is water, out to the edge of the place and across the outer ground, so the coast comes from the
 * shape of the ground itself.
 */
/**
 * The swell that makes the shore waves (Tidewater sea, plan task 3). `direction`: where the waves come from, in
 * degrees clockwise from north (-z), absent = computed from the open side of the island; `period` in seconds
 * (Tidewater 9); `height`: offshore amplitude in metres (Tidewater 0.34). Absent parts keep Tidewater's values.
 */
export const SeaSwell = z.object({
  direction: z.number().min(0).lt(360).optional(),
  period: z.number().min(6).max(14).optional(),
  height: z.number().min(0).max(1.5).optional(),
});
export type SeaSwell = z.infer<typeof SeaSwell>;

/** Stable reusable ocean resource; absent retains legacy style/quality selection. */
export const OceanResourceId = z.enum(['genvr.core.water.tidewater-ocean']);
export type OceanResourceId = z.infer<typeof OceanResourceId>;
export const Sea = z.object({
  level: z.number(),
  resourceId: OceanResourceId.optional(),
  swell: SeaSwell.optional(),
  params: Params.default({}),
});
export type Sea = z.infer<typeof Sea>;

/** Limits on a place's water (P2-39), kept with the shapes so the studio and the API agree. */
export const RIVER_LIMITS = {
  /** Rivers per place. */
  maxPerPlace: 8,
  /** Total length of the centerline in meters (`ROAD_LIMITS.maxLength`). */
  maxLength: 1000,
  /** Shortest distance between two control points, in meters. */
  minSegment: 1,
} as const;

export const ItemInstance = z.object({
  instanceId: Id,
  itemId: Id,
  itemVersion: z.string().optional(),
  transform: Transform,
  /**
   * The item's settings on this copy: color, surface, zone and ride settings, and for an item drawn by a runtime
   * generator its generator parameters (decision 130; at most 16 keys, checked against the item's limits by
   * `@genvr/validator` `generatedParamsError` when a change is saved). Older places parse unchanged.
   */
  params: Params.default({}),
  name: ObjectName.optional(),
  /** Group the item belongs to (moves, locks, and anchors with it). */
  groupId: Id.optional(),
  /** Locked items cannot be picked in the 3D view (select them in the explorer). */
  locked: z.boolean().optional(),
  /** Absent means anchored (stays put); false lets physics move the item while playing. */
  anchored: z.boolean().optional(),
  /**
   * Meant to hang in the air (P2-11): the world checks and settling leave it where it is. Absent
   * means the item type decides (manifest `physics.floats`).
   */
  floats: z.boolean().optional(),
});
export type ItemInstance = z.infer<typeof ItemInstance>;

export const Road = z.object({
  id: Id,
  name: ObjectName.optional(),
  /** Spline control points on the ground plane (x, z); the engine grades terrain and builds bridges. */
  points: z.array(Vec2).min(2).max(200),
  width: z.number().min(2).max(16).default(6),
  materialId: Id.optional(),
  /** Traffic lanes, both directions together; the lines between them are painted (R2g). */
  lanes: z.number().int().min(1).max(8).optional(),
  /** Traffic runs one way only (along the points): no centre line. */
  oneway: z.boolean().optional(),
  /** Raised sidewalk on each side, metres (R2h); none when missing. */
  sidewalk: z.number().min(0.5).max(6).optional(),
  /** Which sides have the sidewalk (along the points; default both). */
  sidewalkSide: z.enum(['both', 'left', 'right']).optional(),
});
export type Road = z.infer<typeof Road>;

/** A door or window cut into one straight segment of a wall. */
export const WallOpening = z.object({
  id: Id,
  kind: z.enum(['door', 'window']),
  /** Index of the wall segment (points[i] -> points[i + 1]; the closing segment is last). */
  segment: z.number().int().min(0),
  /** Distance in meters from the segment start to the opening center. */
  offset: z.number().min(0),
  width: z.number().min(0.4).max(6),
  height: z.number().min(0.4).max(10),
  /** Height of the opening's lower edge above the wall base (0 for doors). */
  bottom: z.number().min(0).max(10),
});
export type WallOpening = z.infer<typeof WallOpening>;

/**
 * How a real building looks (Real place R4b), read from the map: what its facade is made of, its storeys and its
 * roof. Missing fields fall back to plaster, the wall height / 3 m, and a flat roof.
 */
export const BuildingLook = z.object({
  facade: z.enum(['plaster', 'brick', 'stone', 'concrete', 'wood']).optional(),
  /** Paint over the facade texture (`building:colour`). */
  facadeColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  /** Storeys above the ground: rows of windows (`building:levels`). */
  levels: z.number().int().min(1).max(60).optional(),
  roofShape: z.enum(['flat', 'gabled', 'hipped', 'pyramidal', 'skillion']).optional(),
  /** Metres from the eaves (the wall top) to the ridge; the studio picks a pitch when missing. */
  roofHeight: z.number().min(0).max(80).optional(),
  roofMaterial: z.enum(['tiles', 'slate', 'metal', 'concrete', 'thatch']).optional(),
  roofColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
});
export type BuildingLook = z.infer<typeof BuildingLook>;

export const Wall = z.object({
  id: Id,
  name: ObjectName.optional(),
  points: z.array(Vec2).min(2).max(100),
  /** Metres; up to 300 so real towers and tall blocks stand at full height (R4c). */
  height: z.number().min(0.5).max(300).default(3),
  closed: z.boolean().default(false),
  materialId: Id.optional(),
  /** Kept sorted by segment, then offset. */
  openings: z.array(WallOpening).max(100).default([]),
  /** A real building's look (closed building walls only, R4b). */
  building: BuildingLook.optional(),
});
export type Wall = z.infer<typeof Wall>;

/**
 * A paved area laid on the ground (R2l): a square, a market place, a car park. Its edge is exact (painting the ground
 * made blobs: the paint follows the 2 m ground grid); it follows the ground's shape and lies under streets.
 */
export const Paving = z.object({
  id: Id,
  name: ObjectName.optional(),
  /** Outline on the ground plane (x, z), at least 3 points. */
  area: z.array(Vec2).min(3).max(400),
  /** A Core ground material, e.g. `genvr.core.ground.large-grey-tiles`. */
  materialId: Id,
});
export type Paving = z.infer<typeof Paving>;

/**
 * The realistic starter world (P2-40, decision 113): the ground is worked out from a seed instead
 * of starting flat, the way block places already are. A chunk the creator has sculpted is stored
 * and always wins; a place with no seed is flat at 0, exactly as before, so nothing is migrated.
 * A newer generator never changes a place made with an older one.
 */
export const WorldSeed = z.object({
  seed: z.number().int().min(0).max(0x7fffffff),
  kind: z.enum(['valley', 'island', 'plain', 'mountains']),
  /**
   * 2 (2026-09-29): never steeper than the Realistic style allows, where 1 made cliffs at the edge
   * of the place and in the mountain pass. A place keeps the version it was made with, because its
   * items were rested on that ground.
   */
  generator: z.union([z.literal(1), z.literal(2)]),
});
/** The generator new starter worlds are made with. */
export const WORLD_GENERATOR = 2 as const;
export type WorldSeed = z.infer<typeof WorldSeed>;

/**
 * Block ground (P2-26, decision 98): the place's ground is a grid of 1 m blocks made by a seeded
 * generator instead of the height field. The same seed and generator version always give the same
 * blocks, so only the settings are stored (edited chunks join when digging and stacking arrive).
 */
export const VoxelGround = z.object({
  seed: z.number().int().min(0).max(0x7fffffff),
  /** Generator version; a new version never changes places made with an older one. */
  generator: z.literal(1),
});
export type VoxelGround = z.infer<typeof VoxelGround>;

/** Items grouped in the studio explorer (task P3-26); members point to it with `groupId`. */
export const ItemGroup = z.object({
  id: Id,
  name: ObjectName,
});
export type ItemGroup = z.infer<typeof ItemGroup>;

/** Saved state of an experience. Every change arrives as a Command; see docs/BUILD-TOOLS.md. */
export const WorldDocument = z.object({
  schemaVersion: z.literal(1),
  experienceId: Id,
  version: z.number().int().min(0),
  type: ExperienceType.optional(),
  style: StyleSelection,
  sizeTier: SizeTier,
  access: AccessPolicy,
  environment: z.object({
    sky: z.object({ preset: SkyPreset, params: Params.default({}) }),
    weather: z.object({ preset: WeatherPreset, params: Params.default({}) }),
    water: z.array(WaterBody).default([]),
    /** Rivers (P2-39); absent in places made before them. */
    rivers: z.array(River).max(RIVER_LIMITS.maxPerPlace).default([]),
    /** The place's sea (P2-39); absent means no sea. */
    sea: Sea.optional(),
  }),
  terrain: z.object({
    /** Lossless raster metadata/references only; raw tiles are stored separately. */
    fieldSets: TerrainFieldSets.optional(),
    activeSurface: TerrainActiveSurface.optional(),
    chunkSizeMeters: z.number().int().positive().default(64),
    /**
     * Ground palette (P2-37): which library material each slot shows. Missing slots 0-5 use the
     * style's default for that soil; slots 6-15 are extra materials painted in this place.
     */
    materials: z.record(GroundSlot, GroundMaterialRef).optional(),
    /** Storage keys of terrain chunk data, keyed by "x,z" chunk coordinates. */
    chunks: z.record(z.string().regex(/^-?\d+,-?\d+$/), z.string()).default({}),
    /** The starter world this place was made from (P2-40); absent means flat ground. */
    world: WorldSeed.optional(),
  }),
  /** Present in Voxel places made with block ground; the height field then stays unused. */
  voxels: VoxelGround.optional(),
  /** The place's game rules (P9-12, decision 117); absent means an ordinary world. */
  game: StoredGame.optional(),
  /** Creator scripts (P2-10), changed by `set_script`; absent in places without any. They run only with a game. */
  scripts: PlaceScripts.optional(),
  /** The place told as a scroll page (SCROLL-02), changed by `set_story`; absent in places without one. */
  story: PlaceStory.optional(),
  /** Old items of stored places take their new form: race gates as Zone Gates, renamed items by id (`readLegacyItems`). */
  instances: z
    .codec(z.array(ItemInstance), z.array(ItemInstance), {
      decode: readLegacyItems,
      encode: (instances) => instances as ItemInstance[],
    })
    .default([]),
  roads: z.array(Road).default([]),
  walls: z.array(Wall).default([]),
  /** Paved areas (R2l); absent in places made before them. */
  pavings: z.array(Paving).default([]),
  groups: z.array(ItemGroup).default([]),
  spawn: Transform,
});
export type WorldDocument = z.infer<typeof WorldDocument>;
export type WorldDocumentInput = z.input<typeof WorldDocument>;
