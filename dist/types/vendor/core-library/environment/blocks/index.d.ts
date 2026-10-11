import type { BlockItem } from './_block.js';
export * from './_block.js';
/** Every Core ground block of the Voxel style (one file per block). */
export declare const CORE_BLOCKS: readonly BlockItem[];
/** The block with this name (BLOCKS in @genvr/world), if it has a look. */
export declare const getBlock: (key: string) => BlockItem | undefined;
