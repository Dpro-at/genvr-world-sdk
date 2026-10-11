import type { GenvrManifest, Style } from '@genvr/contracts';
import { coreManifest } from '../../manifest.js';
import type { BlockStyle } from '../../environment/blocks/_block.js';

/** How a style draws the world: ground, soils, water, shading, and light (task P2-06). */
export interface StyleLook {
  ground: number;
  groundAccent: number;
  /** Tile size in meters of the ground pattern (blocky studs, realistic grass variation). */
  tile: number;
  flatShading: boolean;
  /** Soil colors in the order grass, dirt, sand, rock, snow, mud (SOILS in @genvr/world). */
  soils: readonly [number, number, number, number, number, number];
  water: { color: number; opacity: number };
  /** Multiplies sky light: toon styles are a little brighter. */
  light: number;
  /** How the sky draws its sun, moon, clouds, and falling drops; absent means SKY_SHAPES. */
  sky?: SkyShapes;
  /** How block ground is drawn (environment/blocks); absent means 'pixel'. */
  blocks?: BlockStyle;
  /**
   * How the world is lit: a hemisphere light with the gradient sky dome (absent), or light from a
   * physical sky with tone mapping and cascaded shadows (Realistic, P2-36).
   */
  lighting?: 'hemisphere' | 'sky';
  /** Avatars drawn with smooth blocks (absent) or as small cubes (Voxel, P2-26). */
  avatar?: 'smooth' | 'cubes';
}

/** Sky drawing per style (P2-26): Voxel has a square sun and moon, cube clouds, and pixel drops. */
export interface SkyShapes {
  /** A drawn sun in the sky (the light comes from it either way). */
  sun: 'none' | 'square';
  moon: 'round' | 'square';
  clouds: 'none' | 'cubes';
  /** Rain and snow: thin streaks, or chunky pixel drops and flakes. */
  drops: 'thin' | 'pixel';
}

export const SKY_SHAPES: SkyShapes = { sun: 'none', moon: 'round', clouds: 'none', drops: 'thin' };

export interface StylePack {
  manifest: GenvrManifest;
  style: Style;
  look: StyleLook;
}

/** One style pack; the file lives at `styles/style-packs/<style>.ts` (id `genvr.core.style.<style>`). */
export function defineStylePack(pack: { style: Style; name: string; look: StyleLook }): StylePack {
  return {
    manifest: coreManifest({
      id: `genvr.core.style.${pack.style}`,
      name: pack.name,
      type: 'style-pack',
      category: 'styles',
      subcategory: 'style-packs',
      styles: [pack.style],
    }),
    style: pack.style,
    look: pack.look,
  };
}
