import { SceneLights } from './lighting.js';
import { z } from 'zod';
import { Id, Params, Quat, SizeTier, Transform, Vec2, Vec3 } from './common.js';
import { Game } from './game.js';
import { PlaceScriptBody, ScriptId } from './script.js';
import { PlaceStory } from './story.js';
import {
  TerrainFieldDescriptor,
  TerrainFieldTile,
  TerrainFieldId,
  TerrainActiveSurface,
} from './terrain-fields.js';
import {
  GROUND_SLOTS,
  GroundMaterialRef,
  ObjectName,
  SeaSwell,
  OceanResourceId,
  SkyPreset,
  SoilName,
  StyleSelection,
  WallOpening,
  BuildingLook,
  WaterBody,
  WorldSeed,
  WeatherPreset,
} from './world.js';

/**
 * Every change to a world is a command. The same command types are used by the build tools,
 * the AI assistant, undo/redo, multiplayer sync, and training logs. See docs/BUILD-TOOLS.md.
 */

const Area = z.array(Vec2).min(3);

/** Grid points per side of one `set_heights` tile (129 x 129 int16 is 33 KB; Tidewater world task 2). */
export const HEIGHT_TILE_MAX = 129;
/** Largest side of a `paint_rule` box, in metres. */
export const PAINT_RULE_MAX_BOX = 512;
/** Terrain chunks encoded by @genvr/world encodeChunk (exact stored contents). */
const EncodedChunks = z.array(z.string().max(20_000)).min(1).max(256);

/**
 * The largest command sent to a co-building room, in bytes of JSON (2026-09-29): the same limit as
 * the API's public commands route. Undoing a long road carries its ground chunks (161 KB for
 * 860 m); the realtime transport's default 4 KB closed the connection and the client resent the
 * command forever. The browser refuses anything bigger itself rather than send it.
 */
export const MAX_COMMAND_BYTES = 8 * 1024 * 1024;

/** One block on block ground (P2-26): whole-meter position and block id (BLOCKS in @genvr/world). */
const BlockSet = z.tuple([
  z.number().int(),
  z.number().int(),
  z.number().int(),
  z.number().int().min(0).max(255),
]);

export const CommandPayload = z.discriminatedUnion('type', [
  /**
   * Grows the place to a bigger size tier (or back, when everything still fits), keeping all that is built where it
   * is (R3: a whole town needs a large place). Not for ground made for its size: starter worlds, block ground, raster
   * terrain.
   */
  z.object({ type: z.literal('set_size_tier'), params: z.object({ sizeTier: SizeTier }) }),
  /** Lays a paved area on the ground (R2l): squares, market places, car parks. */
  z.object({
    type: z.literal('add_paving'),
    params: z.object({
      pavingId: Id,
      area: z.array(Vec2).min(3).max(400),
      materialId: Id,
      name: ObjectName.optional(),
    }),
  }),
  z.object({ type: z.literal('remove_paving'), params: z.object({ pavingId: Id }) }),
  /** Changes only the world's arrival transform; terrain and game spawn markers are untouched. */
  z.object({
    type: z.literal('set_spawn'),
    params: z.object({ spawn: Transform }),
  }),
  z.object({
    type: z.literal('set_terrain_surface'),
    params: z.strictObject({ surface: TerrainActiveSurface.nullable() }),
  }),
  z.object({
    type: z.literal('create_field_set'),
    params: z.strictObject({ descriptor: TerrainFieldDescriptor }),
  }),
  z.object({ type: z.literal('set_field_tile'), params: z.strictObject({ tile: TerrainFieldTile }) }),
  z.object({
    type: z.literal('remove_field_tile'),
    params: z.strictObject({
      setId: TerrainFieldId,
      tx: z.number().int().min(0).max(31),
      tz: z.number().int().min(0).max(31),
    }),
  }),
  /** Bounded inverse: a set can only be removed while it has no tile references. */
  z.object({ type: z.literal('remove_field_set'), params: z.strictObject({ setId: TerrainFieldId }) }),
  /** Restore only when the current bytes still match after, so undo never overwrites later edits. */
  z.object({
    type: z.literal('restore_field_tile'),
    params: z.strictObject({
      setId: TerrainFieldId,
      tx: z.number().int().min(0).max(31),
      tz: z.number().int().min(0).max(31),
      before: TerrainFieldTile.nullable(),
      after: TerrainFieldTile.nullable(),
    }),
  }),

  z.object({
    /**
     * Digging and stacking on block ground (P2-26): sets blocks (0 = air). Its inverse sets the
     * blocks back as they were.
     */
    type: z.literal('set_blocks'),
    params: z.object({ blocks: z.array(BlockSet).min(1).max(4096) }),
  }),
  z.object({
    type: z.literal('place_item'),
    params: z.object({
      instanceId: Id,
      itemId: Id,
      position: Vec3,
      rotation: Quat.optional(),
      scale: Vec3.optional(),
      itemParams: Params.optional(),
      /** Explorer settings, so undoing a removal puts the item back exactly (P3-26). */
      name: ObjectName.optional(),
      groupId: Id.optional(),
      locked: z.boolean().optional(),
      anchored: z.boolean().optional(),
      floats: z.boolean().optional(),
      /** The host works out y (and a tilt) by the rest law (P2-43); the given y is only a hint. */
      rest: z.boolean().optional(),
    }),
  }),
  z.object({ type: z.literal('remove_item'), params: z.object({ instanceId: Id }) }),
  z.object({
    type: z.literal('transform_item'),
    params: z.object({
      instanceId: Id,
      position: Vec3.optional(),
      rotation: Quat.optional(),
      scale: Vec3.optional(),
      /** The host works out y (and a tilt) by the rest law (P2-43); the given y is only a hint. */
      rest: z.boolean().optional(),
    }),
  }),
  z.object({
    /** Look of one placed item (task P3-25): color, material; a null value removes the setting. */
    type: z.literal('set_item_params'),
    params: z.object({
      instanceId: Id,
      params: z.record(z.string().max(32), z.union([z.string().max(64), z.number(), z.boolean(), z.null()])),
    }),
  }),
  z.object({
    /** Names an object in the studio explorer (P3-26); null removes the name of an item, road, wall, water body, or river. */
    type: z.literal('rename'),
    params: z.object({
      kind: z.enum(['item', 'road', 'wall', 'water', 'river', 'group']),
      id: Id,
      name: ObjectName.nullable(),
    }),
  }),
  z.object({
    /**
     * Lock an item against edits in the 3D view, unanchor it for physics (P3-26), or mark it as
     * meant to float (P2-11); null for `floats` gives the choice back to the item type.
     */
    type: z.literal('set_item_flags'),
    params: z.object({
      instanceId: Id,
      locked: z.boolean().optional(),
      anchored: z.boolean().optional(),
      floats: z.boolean().nullable().optional(),
    }),
  }),
  z.object({
    /** Puts items into a new group; items already in a group cannot join another one. */
    type: z.literal('group_items'),
    params: z.object({ groupId: Id, name: ObjectName, instanceIds: z.array(Id).max(500) }),
  }),
  z.object({ type: z.literal('ungroup_items'), params: z.object({ groupId: Id }) }),
  z.object({ type: z.literal('set_lighting'), params: z.object({ lights: SceneLights.optional() }) }),
  z.object({ type: z.literal('set_style'), params: StyleSelection }),
  z.object({
    type: z.literal('set_sky'),
    params: z.object({ preset: SkyPreset, params: Params.optional() }),
  }),
  z.object({
    type: z.literal('set_weather'),
    params: z.object({ preset: WeatherPreset, params: Params.optional() }),
  }),
  z.object({
    type: z.literal('sculpt_terrain'),
    params: z.object({
      area: Area,
      operation: z.enum(['raise', 'lower', 'flatten', 'smooth']),
      strength: z.number().min(0).max(1),
      targetHeight: z.number().optional(),
      /** Soft brush: full effect in the middle, fading to nothing at the edge of the area. */
      soft: z.boolean().optional(),
    }),
  }),
  /**
   * Gives a place a starter world (P2-40): the ground is worked out from this seed wherever no
   * chunk is stored, so nothing the creator already shaped is overwritten. `world: null` takes it
   * away and the ground goes back to flat.
   *
   * It also moves the spawn onto the new ground, because the clearing is rarely at the height the
   * old spawn stood at and arriving inside the ground is worse than any of this. `spawn` says where
   * to put it; left out, the clearing's own level is used. The inverse carries the old spawn back.
   * The dozen items that stand around the spawn are separate `place_item` commands, so each keeps
   * its own exact inverse; `generateWorld` of `@genvr/world` builds the whole batch.
   */
  z.object({
    type: z.literal('generate_world'),
    params: z.object({
      world: WorldSeed.nullable(),
      spawn: Transform.optional(),
      /**
       * The old world's own starter ground (its river's bed, a dug lake) to put back once the world
       * is set; used by undo, since giving a new world takes that ground away with the old world.
       */
      terrain: EncodedChunks.optional(),
    }),
  }),
  /** Ground cover (P2-40): scattered plants and pebbles, cleared ground, or back to the rules. */
  z.object({
    type: z.literal('paint_cover'),
    params: z.object({ area: Area, cover: z.enum(['default', 'cleared', 'plants', 'pebbles']) }),
  }),
  z.object({
    /**
     * A rectangle of exact ground heights (MCP `set_ground_heights`, Tidewater world task 2): `cols` x `rows` grid
     * points from the south-west corner (`x0`, `z0`, snapped to the ground grid) every `step` metres (the ground
     * spacing), row by row (+x first, then +z). `heights` is base64 of little-endian int16 centimetres relative to
     * `base` metres (`encodeHeightTile` in @genvr/world). Soils and cover stay; the inverse reverts only the points
     * it changed.
     */
    type: z.literal('set_heights'),
    params: z.object({
      x0: z.number().min(-4000).max(4000),
      z0: z.number().min(-4000).max(4000),
      cols: z.number().int().min(1).max(HEIGHT_TILE_MAX),
      rows: z.number().int().min(1).max(HEIGHT_TILE_MAX),
      step: z.number().positive().max(64),
      base: z.number().min(-1000).max(1000),
      heights: z.string().max(Math.ceil((HEIGHT_TILE_MAX * HEIGHT_TILE_MAX * 2) / 3) * 4),
    }),
  }),
  z.object({
    /**
     * Paints a soil (or a library ground material) or a ground cover on every ground point inside `box`
     * ([minX, minZ, maxX, maxZ], at most `PAINT_RULE_MAX_BOX` metres a side) where the rule holds: height in metres,
     * slope in degrees, depth below the sea in metres (MCP `paint_ground_rule`, Tidewater world task 2).
     */
    type: z.literal('paint_rule'),
    params: z
      .object({
        box: z.tuple([z.number(), z.number(), z.number(), z.number()]),
        soilId: SoilName.optional(),
        material: GroundMaterialRef.optional(),
        cover: z.enum(['default', 'cleared', 'plants', 'pebbles']).optional(),
        height: z.tuple([z.number(), z.number()]).optional(),
        slope: z.tuple([z.number().min(0).max(90), z.number().min(0).max(90)]).optional(),
        depth: z.tuple([z.number(), z.number()]).optional(),
      })
      .refine((p) => (p.soilId === undefined) !== (p.cover === undefined), {
        message: 'Give either a soil or a cover to paint.',
      }),
  }),
  z.object({
    type: z.literal('paint_terrain'),
    /** `soilId` names the soil; `material` paints a library ground material that counts as it (P2-37). */
    params: z.object({ area: Area, soilId: Id, material: GroundMaterialRef.optional() }),
  }),
  z.object({
    /** Which ground material a palette slot shows in the whole place (P2-37); null clears it. */
    type: z.literal('set_ground_material'),
    params: z.object({
      slot: z
        .number()
        .int()
        .min(0)
        .max(GROUND_SLOTS - 1),
      material: GroundMaterialRef.nullable(),
    }),
  }),
  z.object({ type: z.literal('add_water'), params: WaterBody }),
  z.object({
    type: z.literal('draw_road'),
    params: z.object({
      roadId: Id,
      points: z.array(Vec2).min(2).max(200),
      width: z.number().min(2).max(16).optional(),
      materialId: Id.optional(),
      name: ObjectName.optional(),
      /** Traffic lanes, both directions together (R2g). */
      lanes: z.number().int().min(1).max(8).optional(),
      /** Traffic runs one way only, along the points. */
      oneway: z.boolean().optional(),
      /** Raised sidewalk on each side, metres (R2h). */
      sidewalk: z.number().min(0.5).max(6).optional(),
      /** Which sides have the sidewalk (along the points; default both). */
      sidewalkSide: z.enum(['both', 'left', 'right']).optional(),
      /** Flatten the terrain under the road (default true). */
      grade: z.boolean().optional(),
      /** Exact terrain to set instead of grading (used by redo of an undone road). */
      terrain: EncodedChunks.optional(),
    }),
  }),
  z.object({ type: z.literal('remove_water'), params: z.object({ waterId: Id }) }),
  /** Raises or lowers a lake (P2-39); the basin is dug deeper when the level rises. */
  z.object({
    type: z.literal('set_water_level'),
    params: z.object({
      waterId: Id,
      level: z.number(),
      /** Exact terrain to set instead of digging (used by undo and redo). */
      terrain: EncodedChunks.optional(),
    }),
  }),
  z.object({
    type: z.literal('draw_river'),
    params: z.object({
      riverId: Id,
      points: z.array(Vec2).min(2).max(200),
      width: z.number().min(2).max(40).optional(),
      widen: z.number().min(1).max(2).optional(),
      flow: z.number().min(0).max(6).optional(),
      name: ObjectName.optional(),
      /** Carve the bed into the terrain (default true). */
      carve: z.boolean().optional(),
      /** Exact terrain to set instead of carving (used by redo of an undone river). */
      terrain: EncodedChunks.optional(),
    }),
  }),
  z.object({
    type: z.literal('edit_river'),
    /** `terrain` restores the ground from before the edit (used by undo). */
    params: z.object({
      riverId: Id,
      points: z.array(Vec2).min(2).max(200).optional(),
      width: z.number().min(2).max(40).optional(),
      widen: z.number().min(1).max(2).optional(),
      flow: z.number().min(0).max(6).optional(),
      /** Re-carve the bed for the new shape (default true). */
      carve: z.boolean().optional(),
      terrain: EncodedChunks.optional(),
    }),
  }),
  z.object({
    type: z.literal('remove_river'),
    /** `terrain` restores the ground from before the bed was carved (used by undo). */
    params: z.object({ riverId: Id, terrain: EncodedChunks.optional() }),
  }),
  /** Sets the place's game rules, or removes them with `game: null` (P9-12). */
  z.object({ type: z.literal('set_game'), params: z.object({ game: Game.nullable() }) }),
  /** Sets the place's story (SCROLL-02), or takes it away with `story: null`. */
  z.object({ type: z.literal('set_story'), params: z.object({ story: PlaceStory.nullable() }) }),
  /**
   * Adds, replaces or removes (`script: null`) one place script (P2-10). Replacing keeps its place in the list;
   * `index` puts an added script at that place (undo of a removal), otherwise it goes last. The inverse is exact.
   */
  z.object({
    type: z.literal('set_script'),
    params: z.object({
      scriptId: ScriptId,
      script: PlaceScriptBody.nullable(),
      index: z.number().int().min(0).optional(),
    }),
  }),
  /**
   * Turns the sea on at a level, or off with `level: null` (P2-39). `swell` sets the shore waves' swell, `null`
   * clears it, and leaving it out keeps the swell the sea already has.
   */
  z.object({
    type: z.literal('set_sea'),
    params: z.object({
      level: z.number().nullable(),
      swell: SeaSwell.nullable().optional(),
      /** Omitted preserves selection; null returns to legacy automatic selection. */
      resourceId: OceanResourceId.nullable().optional(),
      params: Params.optional(),
    }),
  }),
  z.object({
    type: z.literal('remove_road'),
    /** `terrain` restores the ground from before the road was graded (used by undo). */
    params: z.object({ roadId: Id, terrain: EncodedChunks.optional() }),
  }),
  z.object({
    type: z.literal('remove_wall'),
    /** `terrain` restores the ground from before a room was graded (used by undo). */
    params: z.object({ wallId: Id, terrain: EncodedChunks.optional() }),
  }),
  z.object({
    type: z.literal('add_wall_opening'),
    params: z.object({ wallId: Id, opening: WallOpening }),
  }),
  z.object({
    type: z.literal('remove_wall_opening'),
    params: z.object({ wallId: Id, openingId: Id }),
  }),
  /**
   * Restores terrain chunks to exact stored contents (used as the inverse of sculpt and paint for
   * undo). Each entry is a chunk encoded by @genvr/world encodeChunk.
   */
  z.object({
    /**
     * Undo of a terrain edit (P3-08 follow-up): the changed points with their values before and
     * after, encoded by @genvr/world; reverts only those points and keeps later edits by others.
     */
    type: z.literal('revert_terrain'),
    params: z.object({ edits: z.array(z.string().max(60_000)).max(256) }),
  }),
  z.object({
    type: z.literal('restore_terrain'),
    params: z.object({ chunks: EncodedChunks }),
  }),
  z.object({
    type: z.literal('draw_wall'),
    params: z.object({
      wallId: Id,
      points: z.array(Vec2).min(2).max(100),
      height: z.number().min(0.5).max(300).optional(),
      closed: z.boolean().optional(),
      materialId: Id.optional(),
      openings: z.array(WallOpening).max(100).optional(),
      name: ObjectName.optional(),
      /** A real building's facade, storeys and roof (R4b); only with the building wall material. */
      building: BuildingLook.optional(),
      /** Flatten the ground under a closed wall (room); default true. Open walls never grade. */
      grade: z.boolean().optional(),
      /** Exact terrain to set instead of grading (used by redo of an undone room). */
      terrain: EncodedChunks.optional(),
    }),
  }),
]);
export type CommandPayload = z.infer<typeof CommandPayload>;
export type CommandType = CommandPayload['type'];

export const CommandAuthor = z.object({
  kind: z.enum(['user', 'ai', 'mcp']),
  id: Id,
});

export const Command = z.intersection(
  z.object({
    id: z.uuid(),
    author: CommandAuthor,
    experienceId: Id,
    /** World document version the command applies to (optimistic concurrency). */
    baseVersion: z.number().int().min(0),
    timestamp: z.number().int().positive(),
  }),
  CommandPayload,
);
export type Command = z.infer<typeof Command>;

export const COMMAND_TYPES = CommandPayload.options.map((option) => option.shape.type.value);
