import { z } from 'zod';
/**
 * A player's settings (task P3-21, docs/PLAYER-UI.md section 4): saved on the account and in the
 * browser until signed in. Every field has a default, so older saved settings stay valid.
 */
export declare const PlayerSettings: z.ZodObject<{
    audio: z.ZodDefault<z.ZodObject<{
        master: z.ZodDefault<z.ZodNumber>;
        effects: z.ZodDefault<z.ZodNumber>;
        music: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>;
    chat: z.ZodDefault<z.ZodObject<{
        on: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
    language: z.ZodDefault<z.ZodEnum<{
        en: "en";
    }>>;
    display: z.ZodDefault<z.ZodObject<{
        quality: z.ZodDefault<z.ZodNumber>;
        textSize: z.ZodDefault<z.ZodEnum<{
            large: "large";
            normal: "normal";
        }>>;
        reduceMotion: z.ZodDefault<z.ZodBoolean>;
        fpsCap: z.ZodDefault<z.ZodUnion<readonly [z.ZodLiteral<0>, z.ZodLiteral<30>, z.ZodLiteral<60>]>>;
        showFps: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
    view: z.ZodDefault<z.ZodObject<{
        cameraSensitivity: z.ZodDefault<z.ZodNumber>;
        invertCamera: z.ZodDefault<z.ZodBoolean>;
        showNames: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
    devConsole: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type PlayerSettings = z.infer<typeof PlayerSettings>;
export declare const DEFAULT_PLAYER_SETTINGS: PlayerSettings;
/** Reads saved settings leniently: unknown or broken values fall back to their defaults. */
export declare function readPlayerSettings(saved: unknown): PlayerSettings;
