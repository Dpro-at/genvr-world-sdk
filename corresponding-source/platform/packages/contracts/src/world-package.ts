import { z } from 'zod';
import { Id, SizeTier } from './common.js';
import { CommandPayload } from './commands.js';
import { GenvrManifest, PackagePath } from './manifest.js';
import { StyleSelection, WorldSeed } from './world.js';

export const WORLD_PACKAGE_BYTES = 8 * 1024 * 1024;
export const WORLD_PACKAGE_COMMANDS = 500;

/** Portable source, replayed through the shared command engine; never an unchecked DB snapshot. */
export const WorldPackage = z.object({
  format: z.literal('genvr-world'),
  formatVersion: z.literal(1),
  sdkVersion: z.string().max(32),
  id: Id,
  title: z.string().trim().min(1).max(60),
  base: z.object({
    style: StyleSelection,
    sizeTier: SizeTier.default('small'),
    world: WorldSeed.optional(),
    voxelSeed: z.number().int().min(0).max(0x7fffffff).optional(),
  }).strict(),
  commands: z.array(CommandPayload).max(WORLD_PACKAGE_COMMANDS),
  /** Creator-owned files, embedded so local models do not depend on signed platform URLs. */
  assets: z.array(z.object({
    id: Id,
    manifest: GenvrManifest,
    files: z.array(z.object({
      path: PackagePath,
      contentType: z.string().max(100),
      data: z.string().max(WORLD_PACKAGE_BYTES).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
    }).strict()).min(1).max(32),
  }).strict()).max(32).default([]),
}).strict();
export type WorldPackage = z.infer<typeof WorldPackage>;

export const ImportWorldPackage = z.object({
  baseVersion: z.number().int().min(0),
  package: WorldPackage,
  /** Explicit map from local item IDs to already uploaded/entitled platform item IDs. */
  itemMap: z.record(Id, Id).default({}),
}).strict();
