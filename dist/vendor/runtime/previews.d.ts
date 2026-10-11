import { type Object3D, type WebGPURenderer } from 'three/webgpu';
import type { ItemPackages } from './item-packages.js';
import type { ItemsView } from './items.js';
import { type RoadMaterials } from './road-view.js';
/**
 * Renders small 3D pictures of library entries (items, road types) with the real engine, for
 * the side-panel catalogs. Results are cached; renders run one at a time. Creator items are drawn
 * from their glTF package with its own materials, once it has loaded (P1-08).
 */
export declare class PreviewRenderer {
    #private;
    private readonly renderer;
    private readonly items;
    private readonly roadMaterials;
    private readonly packages?;
    constructor(renderer: WebGPURenderer, items: ItemsView, roadMaterials: RoadMaterials, packages?: ItemPackages | undefined);
    /** Data URL of a picture of a library item. */
    item(itemId: string): Promise<string>;
    /** Data URL of a picture of a short curved piece of a road type. */
    selection(root: Object3D): Promise<string>;
    road(typeId: string): Promise<string>;
    dispose(): void;
}
/** RGBA pixels (linear) of a square picture to a PNG data URL; WebGL rows come bottom-up. */
export declare function pixelsToDataUrl(pixels: Uint8Array, size: number, bottomUp: boolean): string;
