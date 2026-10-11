import type { Category, GenvrManifest, ItemType } from '@genvr/contracts';
import { ALL_STYLES, coreManifest } from './manifest.js';

/** The build tool that draws or places an item of this kind (runtime BuildTool names). */
export type DrawTool = 'wall' | 'door' | 'window' | 'water';

/**
 * Things creators draw into the world instead of placing as a model: walls and rooms, doors and
 * windows cut into walls, water. Picking one in the library starts its tool; more types (brick,
 * glass, wood, sea) join as new files.
 */
export interface DrawnItem {
  manifest: GenvrManifest;
  tool: DrawTool;
}

export function defineDrawn(item: {
  id: string;
  name: string;
  tool: DrawTool;
  type: ItemType;
  category: Category;
  subcategory: string;
}): DrawnItem {
  return {
    manifest: coreManifest({
      id: item.id,
      name: item.name,
      type: item.type,
      category: item.category,
      subcategory: item.subcategory,
      styles: ALL_STYLES,
    }),
    tool: item.tool,
  };
}
