import type { Style } from '@genvr/contracts';
import { CORE_SKIES, STYLE_PACKS, type SkyLook, type StyleLook } from '@genvr/core-library';

/**
 * Looks of skies and styles, read from the Core Library (environment/sky, styles/style-packs), so
 * the engine holds no style data of its own (decision 65).
 */
export type { SkyLook, StyleLook };
export type SkyPreset = (typeof CORE_SKIES)[number]['preset'];

export const SKY_PRESETS = Object.fromEntries(CORE_SKIES.map((sky) => [sky.preset, sky.look])) as Record<
  SkyPreset,
  SkyLook
>;

export const STYLE_LOOKS = Object.fromEntries(STYLE_PACKS.map((pack) => [pack.style, pack.look])) as Record<
  Style,
  StyleLook
>;

/** Soil colors per style, indexed like SOILS in @genvr/world: grass, dirt, sand, rock, snow, mud. */
export const SOIL_COLORS = Object.fromEntries(
  STYLE_PACKS.map((pack): [Style, readonly number[]] => [pack.style, pack.look.soils]),
) as Record<Style, readonly number[]>;
