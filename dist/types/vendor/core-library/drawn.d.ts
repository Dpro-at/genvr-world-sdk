import type { Category, GenvrManifest, ItemType } from '../contracts/index.js';
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
export declare function defineDrawn(item: {
    id: string;
    name: string;
    tool: DrawTool;
    type: ItemType;
    category: Category;
    subcategory: string;
}): DrawnItem;
