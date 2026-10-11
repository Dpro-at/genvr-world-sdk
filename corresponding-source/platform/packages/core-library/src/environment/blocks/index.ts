import grass from './grass.js';
import dirt from './dirt.js';
import sand from './sand.js';
import stone from './stone.js';
import snow from './snow.js';
import gravel from './gravel.js';
import water from './water.js';
import path from './path.js';
import paving from './paving.js';
import brick from './brick.js';
import planks from './planks.js';
import cobble from './cobble.js';
import type { BlockItem } from './_block.js';

export * from './_block.js';

/** Every Core ground block of the Voxel style (one file per block). */
export const CORE_BLOCKS: readonly BlockItem[] = [
  grass,
  dirt,
  sand,
  stone,
  snow,
  gravel,
  water,
  path,
  paving,
  brick,
  planks,
  cobble,
];

/** The block with this name (BLOCKS in @genvr/world), if it has a look. */
export const getBlock = (key: string): BlockItem | undefined =>
  CORE_BLOCKS.find((block) => block.key === key);
