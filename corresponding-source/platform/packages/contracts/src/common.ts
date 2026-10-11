import { z } from 'zod';

/** Opaque identifiers: lowercase letters, digits, dots, dashes, underscores. */
export const Id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9._-]*$/, 'lowercase letters, digits, dot, dash, underscore');
export type Id = z.infer<typeof Id>;

export const Vec2 = z.tuple([z.number(), z.number()]);
export type Vec2 = z.infer<typeof Vec2>;

export const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
export type Vec3 = z.infer<typeof Vec3>;

/** Quaternion as [x, y, z, w]. */
export const Quat = z.tuple([z.number(), z.number(), z.number(), z.number()]);
export type Quat = z.infer<typeof Quat>;

export const Transform = z.object({
  position: Vec3,
  rotation: Quat.default([0, 0, 0, 1]),
  scale: Vec3.default([1, 1, 1]),
});
export type Transform = z.infer<typeof Transform>;

/** Hex color such as "#1e6fa8". */
export const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const Style = z.enum(['realistic', 'blocky', 'anime', 'voxel']);
export type Style = z.infer<typeof Style>;

/** World size tiers, see docs/CAPACITY.md. */
export const SizeTier = z.enum(['small', 'medium', 'large', 'huge', 'max']);
export type SizeTier = z.infer<typeof SizeTier>;

export const SIZE_TIERS: Record<SizeTier, { sideMeters: number; maxPlayers: number }> = {
  small: { sideMeters: 500, maxPlayers: 30 },
  medium: { sideMeters: 1000, maxPlayers: 50 },
  large: { sideMeters: 2000, maxPlayers: 100 },
  huge: { sideMeters: 4000, maxPlayers: 100 },
  max: { sideMeters: 8000, maxPlayers: 100 },
};

export const ExperienceType = z.enum(['game', 'event', 'social']);
export type ExperienceType = z.infer<typeof ExperienceType>;

/** Free-form, validated per item or command by its own schema. */
export const Params = z.record(z.string(), z.unknown());
export type Params = z.infer<typeof Params>;
