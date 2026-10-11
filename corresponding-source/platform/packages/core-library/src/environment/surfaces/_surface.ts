import type { GenvrManifest } from '@genvr/contracts';
import { ALL_STYLES, coreManifest } from '../../manifest.js';

/** How a surface reflects light (physically based values). */
export interface SurfaceLook {
  roughness: number;
  metalness: number;
  /** Below 1 the surface is see-through (glass). */
  opacity: number;
  /** Glows by itself in its own color (neon). */
  glow: number;
}

export interface SurfaceItem {
  manifest: GenvrManifest;
  /** Short key stored in a placed item's params (`material`). */
  key: string;
  look: SurfaceLook;
}

/**
 * One surface (material) for placed items and parts (task P3-25); the file lives at
 * `environment/surfaces/<key>.ts` (id `genvr.core.surface.<key>`).
 */
export function defineSurface(surface: { key: string; name: string; look: SurfaceLook }): SurfaceItem {
  return {
    manifest: coreManifest({
      id: `genvr.core.surface.${surface.key}`,
      name: surface.name,
      type: 'material',
      category: 'environment',
      subcategory: 'surfaces',
      styles: ALL_STYLES,
    }),
    key: surface.key,
    look: surface.look,
  };
}
