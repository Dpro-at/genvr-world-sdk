import { z } from 'zod';
/** Opaque identifiers: lowercase letters, digits, dots, dashes, underscores. */
export declare const Id: z.ZodString;
export type Id = z.infer<typeof Id>;
export declare const Vec2: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
export type Vec2 = z.infer<typeof Vec2>;
export declare const Vec3: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
export type Vec3 = z.infer<typeof Vec3>;
/** Quaternion as [x, y, z, w]. */
export declare const Quat: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
export type Quat = z.infer<typeof Quat>;
export declare const Transform: z.ZodObject<{
    position: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
    rotation: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
    scale: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
}, z.core.$strip>;
export type Transform = z.infer<typeof Transform>;
/** Hex color such as "#1e6fa8". */
export declare const Color: z.ZodString;
export declare const Style: z.ZodEnum<{
    realistic: "realistic";
    blocky: "blocky";
    anime: "anime";
    voxel: "voxel";
}>;
export type Style = z.infer<typeof Style>;
/** World size tiers, see docs/CAPACITY.md. */
export declare const SizeTier: z.ZodEnum<{
    small: "small";
    medium: "medium";
    large: "large";
    huge: "huge";
    max: "max";
}>;
export type SizeTier = z.infer<typeof SizeTier>;
export declare const SIZE_TIERS: Record<SizeTier, {
    sideMeters: number;
    maxPlayers: number;
}>;
export declare const ExperienceType: z.ZodEnum<{
    game: "game";
    event: "event";
    social: "social";
}>;
export type ExperienceType = z.infer<typeof ExperienceType>;
/** Free-form, validated per item or command by its own schema. */
export declare const Params: z.ZodRecord<z.ZodString, z.ZodUnknown>;
export type Params = z.infer<typeof Params>;
