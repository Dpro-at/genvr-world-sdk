import type { GenvrManifest } from '@genvr/contracts';
import { coreManifest } from '../../manifest.js';

/** Pixels per block face edge (decision 98: 16 x 16, sharp pixels). */
export const BLOCK_PIXELS = 16;

/**
 * How a block looks: one 16 x 16 picture per face kind, each 256 colors (0xRRGGBB) in rows from
 * the top edge down (side faces: the first row is the upper edge of the block).
 */
export interface BlockLook extends BlockFaces {
  /**
   * The same block in clean colors without pixel detail (the stylized look): the engine shades
   * each cube a little differently, so light, shadow, and shape carry the detail.
   */
  plain: BlockFaces;
  /** Below 1 the block is see-through (water). */
  opacity: number;
}

export interface BlockFaces {
  top: readonly number[];
  side: readonly number[];
  bottom: readonly number[];
}

/** How blocks are drawn: 16 x 16 pixel pictures, or clean colors with a shade per cube. */
export type BlockStyle = 'pixel' | 'plain';

export interface BlockItem {
  manifest: GenvrManifest;
  /** Block name as stored in the ground (BLOCKS in @genvr/world). */
  key: string;
  look: BlockLook;
}

/**
 * One ground block of the Voxel style (P2-26); the file lives at `environment/blocks/<key>.ts`
 * (id `genvr.core.block.<key>`). Pictures are drawn in code for Genvr, never copied from games.
 */
export function defineBlock(block: { key: string; name: string; look: BlockLook }): BlockItem {
  return {
    manifest: coreManifest({
      id: `genvr.core.block.${block.key}`,
      name: block.name,
      type: 'material',
      category: 'environment',
      subcategory: 'blocks',
      styles: ['voxel'],
    }),
    key: block.key,
    look: block.look,
  };
}
