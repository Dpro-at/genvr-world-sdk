import { GenvrManifest } from '../contracts/index.js';
/**
 * Core Library items built from simple shapes (docs/CORE-LIBRARY.md). They need no downloads,
 * render as one instanced draw call per item type, and look right in the blocky style. Items
 * from the store arrive as `.genvr` packages with glTF models instead.
 */
export type PartShape = 'box' | 'cylinder' | 'cone' | 'sphere' | 'pyramid';
export interface ItemPart {
    shape: PartShape;
    /** Width, height, depth in meters (cylinder/cone/sphere: x = z = diameter). */
    size: readonly [number, number, number];
    /** Center of the part; y = 0 is the ground under the item. */
    position: readonly [number, number, number];
    color: string;
    /** Rotation about the vertical axis in radians. */
    rotationY?: number;
}
export type ItemGroup = 'nature' | 'props' | 'buildings';
export interface CoreItem {
    manifest: GenvrManifest;
    group: ItemGroup;
    parts: readonly ItemPart[];
    /** Grid size in meters for block-style items that stack in cells (Minecraft-like). */
    grid?: number;
}
export interface ItemBounds {
    min: [number, number, number];
    max: [number, number, number];
}
/** Every free built-in item, in library order. */
export declare const CORE_ITEMS: readonly CoreItem[];
export declare const getCoreItem: (id: string) => CoreItem | undefined;
/** Axis-aligned bounds of an item in its own space (parts turned about Y use their diagonal). */
export declare function itemBounds(parts: readonly ItemPart[]): ItemBounds;
