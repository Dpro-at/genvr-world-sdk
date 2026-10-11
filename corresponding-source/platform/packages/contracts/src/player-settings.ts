import { z } from 'zod';

const Percent = z.number().int().min(0).max(100);

/**
 * A player's settings (task P3-21, docs/PLAYER-UI.md section 4): saved on the account and in the
 * browser until signed in. Every field has a default, so older saved settings stay valid.
 */
export const PlayerSettings = z.object({
  audio: z
    .object({ master: Percent.default(80), effects: Percent.default(100), music: Percent.default(70) })
    .default({ master: 80, effects: 100, music: 70 }),
  chat: z.object({ on: z.boolean().default(true) }).default({ on: true }),
  /** Interface language (English first; more languages come with translations). */
  language: z.enum(['en']).default('en'),
  display: z
    .object({
      /** 0 = automatic; 1 (fastest) to 10 (sharpest). */
      quality: z.number().int().min(0).max(10).default(0),
      textSize: z.enum(['normal', 'large']).default('normal'),
      reduceMotion: z.boolean().default(false),
      /** Frames per second at most; 0 = no limit. */
      fpsCap: z.union([z.literal(0), z.literal(30), z.literal(60)]).default(0),
      showFps: z.boolean().default(false),
    })
    .default({ quality: 0, textSize: 'normal', reduceMotion: false, fpsCap: 0, showFps: false }),
  view: z
    .object({
      /** Camera turn speed, 1 = normal. */
      cameraSensitivity: z.number().min(0.25).max(3).default(1),
      invertCamera: z.boolean().default(false),
      showNames: z.boolean().default(true),
    })
    .default({ cameraSensitivity: 1, invertCamera: false, showNames: true }),
  /** Developer console in play (owners and builders only). */
  devConsole: z.boolean().default(false),
});
export type PlayerSettings = z.infer<typeof PlayerSettings>;

export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = PlayerSettings.parse({});

/** Reads saved settings leniently: unknown or broken values fall back to their defaults. */
export function readPlayerSettings(saved: unknown): PlayerSettings {
  const parsed = PlayerSettings.safeParse(saved ?? {});
  if (parsed.success) return parsed.data;
  // Keep the valid groups, reset the broken ones.
  const source = (typeof saved === 'object' && saved !== null ? saved : {}) as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(PlayerSettings.shape) as Array<keyof PlayerSettings>) {
    const field = PlayerSettings.shape[key].safeParse(source[key]);
    result[key] = field.success ? field.data : DEFAULT_PLAYER_SETTINGS[key];
  }
  return result as PlayerSettings;
}
