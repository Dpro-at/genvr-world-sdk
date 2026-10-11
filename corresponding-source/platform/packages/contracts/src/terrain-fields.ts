import { z } from 'zod';
import { Id } from './common.js';

/** Generic raster surface binding. Heights use only the referenced descriptor's heightBinding. */
export const TerrainActiveSurface = z.strictObject({
  setId: z.string().regex(/^[a-z][a-z0-9_-]{0,47}$/),
  outsideHeight: z.number().finite().min(-150).max(450),
  edge: z.enum(['clamp', 'constant']),
  farEdge: z.enum(['inclusive', 'exclusive']),
  materialBindings: z
    .array(
      z.strictObject({
        itemId: Id,
        inputs: z
          .record(
            z.string().regex(/^[a-z][a-z0-9_-]{0,47}$/),
            z.strictObject({
              channel: z.string().regex(/^[a-z][a-z0-9_-]{0,47}$/),
              scale: z.number().finite().min(-1e5).max(1e5),
            }),
          )
          .refine((inputs) => Object.keys(inputs).length <= 32, 'At most 32 material inputs'),
      }),
    )
    .max(32)
    .optional(),
});
export type TerrainActiveSurface = z.infer<typeof TerrainActiveSurface>;

/** Generic lossless terrain rasters; coordinates are world metres, never place-size scaled. */
export const TERRAIN_FIELD_TILE_SIZE = 128;
export const TERRAIN_FIELD_MAX_BYTES = 128 * 1024 * 1024;
export const TERRAIN_FIELD_TILE_MAX_BYTES = 512 * 1024;
// Each of at most32channels can add its own base64 padding.
export const TERRAIN_FIELD_TILE_MAX_BASE64 = Math.ceil(TERRAIN_FIELD_TILE_MAX_BYTES / 3) * 4 + 32 * 4;
export const TerrainFieldId = z.string().regex(/^[a-z][a-z0-9_-]{0,47}$/);
export const TerrainFieldEncoding = z.enum(['u8', 'f32le']);
export type TerrainFieldEncoding = z.infer<typeof TerrainFieldEncoding>;
export const TerrainFieldChannel = z
  .strictObject({
    id: TerrainFieldId,
    encoding: TerrainFieldEncoding,
    /** Inclusive values in raw channel units; bytes are not implicitly normalized. */
    range: z.tuple([z.number().finite(), z.number().finite()]).optional(),
  })
  .superRefine((channel, ctx) => {
    if (
      channel.range &&
      (channel.range[0] > channel.range[1] ||
        (channel.encoding === 'u8' && (channel.range[0] < 0 || channel.range[1] > 255)))
    )
      ctx.addIssue({ code: 'custom', message: 'Invalid channel range' });
  });
export type TerrainFieldChannel = z.infer<typeof TerrainFieldChannel>;
export const TerrainFieldDescriptor = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: TerrainFieldId,
    /** Minimum domain corner for cell-centred data; first sample position for vertex data. */
    origin: z.tuple([z.number().finite().min(-1e6).max(1e6), z.number().finite().min(-1e6).max(1e6)]),
    spacing: z.number().finite().min(0.125).max(128),
    width: z.number().int().min(1).max(4096),
    height: z.number().int().min(1).max(4096),
    sampling: z.enum(['cell-center', 'vertex']),
    channels: z.array(TerrainFieldChannel).min(1).max(32),
    /** Optional geometry input: keep raw bytes while applying a separate world-height offset. */
    heightBinding: z
      .strictObject({ channel: TerrainFieldId, offset: z.number().finite().min(-1e4).max(1e4) })
      .optional(),
  })
  .superRefine((descriptor, ctx) => {
    if (new Set(descriptor.channels.map((c) => c.id)).size !== descriptor.channels.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate channel ids' });
    const stride = descriptor.channels.reduce((n, c) => n + (c.encoding === 'u8' ? 1 : 4), 0);
    if (descriptor.width * descriptor.height * stride > TERRAIN_FIELD_MAX_BYTES)
      ctx.addIssue({ code: 'custom', message: 'Field set exceeds the raw byte budget' });
    if (
      Math.min(descriptor.width, TERRAIN_FIELD_TILE_SIZE) *
        Math.min(descriptor.height, TERRAIN_FIELD_TILE_SIZE) *
        stride >
      TERRAIN_FIELD_TILE_MAX_BYTES
    )
      ctx.addIssue({ code: 'custom', message: 'Channel bundle exceeds the tile byte budget' });
    if (
      descriptor.heightBinding &&
      !descriptor.channels.some((c) => c.id === descriptor.heightBinding?.channel && c.encoding === 'f32le')
    )
      ctx.addIssue({ code: 'custom', message: 'Height binding must name a Float32 channel' });
  });
export type TerrainFieldDescriptor = z.infer<typeof TerrainFieldDescriptor>;
/** Wire/storage envelope; geometry-dependent lengths/coverage are checked by the lossless codec. */
export const TerrainFieldTile = z
  .strictObject({
    kind: z.literal('terrain-fields-v1'),
    setId: TerrainFieldId,
    tx: z.number().int().min(0).max(31),
    tz: z.number().int().min(0).max(31),
    cols: z.number().int().min(1).max(TERRAIN_FIELD_TILE_SIZE),
    rows: z.number().int().min(1).max(TERRAIN_FIELD_TILE_SIZE),
    channels: z.record(TerrainFieldId, z.string().max(Math.ceil(TERRAIN_FIELD_TILE_MAX_BYTES / 3) * 4)),
  })
  .superRefine((tile, ctx) => {
    const values = Object.values(tile.channels);
    if (values.length > 32) ctx.addIssue({ code: 'custom', message: 'Too many tile channels' });
    if (values.reduce((n, text) => n + text.length, 0) > TERRAIN_FIELD_TILE_MAX_BASE64)
      ctx.addIssue({ code: 'custom', message: 'Tile channel payload exceeds encoded byte budget' });
  });
export type TerrainFieldTile = z.infer<typeof TerrainFieldTile>;

/** Staged references only: descriptors do not activate height or material consumers. */
export const TerrainFieldTileCoordinate = z
  .string()
  .regex(/^(?:[0-9]|[12][0-9]|3[01]),(?:[0-9]|[12][0-9]|3[01])$/);
export const TerrainFieldSetMetadata = z
  .strictObject({
    descriptor: TerrainFieldDescriptor,
    tiles: z.array(TerrainFieldTileCoordinate).max(1024),
  })
  .superRefine((set, ctx) => {
    if (new Set(set.tiles).size !== set.tiles.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate field tile references' });
    for (const key of set.tiles) {
      const [tx, tz] = key.split(',').map(Number) as [number, number];
      if (
        tx * TERRAIN_FIELD_TILE_SIZE >= set.descriptor.width ||
        tz * TERRAIN_FIELD_TILE_SIZE >= set.descriptor.height
      )
        ctx.addIssue({ code: 'custom', message: 'Field tile reference outside descriptor' });
    }
  });
export type TerrainFieldSetMetadata = z.infer<typeof TerrainFieldSetMetadata>;
export const TerrainFieldSets = z.record(TerrainFieldId, TerrainFieldSetMetadata).superRefine((sets, ctx) => {
  const entries = Object.entries(sets);
  if (entries.length > 4) ctx.addIssue({ code: 'custom', message: 'At most four field sets per world' });
  let bytes = 0;
  for (const [id, set] of entries) {
    if (id !== set.descriptor.id) ctx.addIssue({ code: 'custom', message: 'Field set key/id mismatch' });
    bytes +=
      set.descriptor.width *
      set.descriptor.height *
      set.descriptor.channels.reduce((n, c) => n + (c.encoding === 'u8' ? 1 : 4), 0);
  }
  if (bytes > TERRAIN_FIELD_MAX_BYTES)
    ctx.addIssue({ code: 'custom', message: 'World field sets exceed aggregate raw byte budget' });
});
export type TerrainFieldSets = z.infer<typeof TerrainFieldSets>;
