import type { Style } from '../contracts/index.js';
import { CORE_SKIES, type SkyLook, type StyleLook } from '../core-library/index.js';
/**
 * Looks of skies and styles, read from the Core Library (environment/sky, styles/style-packs), so
 * the engine holds no style data of its own (decision 65).
 */
export type { SkyLook, StyleLook };
export type SkyPreset = (typeof CORE_SKIES)[number]['preset'];
export declare const SKY_PRESETS: Record<SkyPreset, SkyLook>;
export declare const STYLE_LOOKS: Record<Style, StyleLook>;
/** Soil colors per style, indexed like SOILS in @genvr/world: grass, dirt, sand, rock, snow, mud. */
export declare const SOIL_COLORS: Record<Style, readonly number[]>;
