import blocky from './blocky.js';
import realistic from './realistic.js';
import anime from './anime.js';
import voxel from './voxel.js';
import type { StylePack } from './_style-pack.js';

export * from './_style-pack.js';

/** Every Core style pack (one file per style). */
export const STYLE_PACKS: readonly StylePack[] = [blocky, realistic, anime, voxel];

/** The style pack of a world's base style. */
export const getStylePack = (style: StylePack['style']): StylePack =>
  STYLE_PACKS.find((pack) => pack.style === style)!;
