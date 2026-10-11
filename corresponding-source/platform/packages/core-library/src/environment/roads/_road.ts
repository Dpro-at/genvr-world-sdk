import type { GenvrManifest } from '@genvr/contracts';
import { ALL_STYLES, coreManifest } from '../../manifest.js';

/**
 * Road types of the Core Library (task P3-16). A road stores its type as `materialId`; the
 * engine grades the ground, builds bridges over water, and draws each type its own way.
 */
export type RoadLook = 'street' | 'lane' | 'dirt' | 'tram' | 'rail' | 'fantasy' | 'path';

export interface RoadType {
  manifest: GenvrManifest;
  id: string;
  name: string;
  /** Default width in meters (the road bed that gets graded). */
  width: number;
  look: RoadLook;
}

/** One road type; the file lives at `environment/roads/<slug>.ts` (id `genvr.core.road.<slug>`). */
export function defineRoad(road: { id: string; name: string; width: number; look: RoadLook }): RoadType {
  return {
    ...road,
    manifest: coreManifest({
      id: road.id,
      name: road.name,
      type: 'material',
      category: 'environment',
      subcategory: 'roads',
      styles: ALL_STYLES,
    }),
  };
}
