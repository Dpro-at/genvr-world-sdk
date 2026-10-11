import type { Category, GenvrManifest, ItemSource, ItemType, Style } from '../contracts/index.js';
/** Anything in the library: every entry carries its `.genvr` manifest. */
export interface LibraryEntry {
    manifest: GenvrManifest;
}
/**
 * The whole Core Library, grouped by the store taxonomy (docs/GENVR-FORMAT.md): 3D models,
 * environment (roads, sky, weather), styles, avatar and appearance; 2D, audio, gameplay scripts, and visual effects join the
 * same way in their own folders.
 */
export declare const LIBRARY: readonly LibraryEntry[];
/** Filters shared by the build catalogs, the avatar panel, and later the store. */
export interface LibraryFilter {
    type?: ItemType | readonly ItemType[];
    category?: Category;
    /** One subcategory, or any of several. */
    subcategory?: string | readonly string[];
    /** Art style of the world: only items made for it. */
    style?: Style;
    /** Words in the name or id. */
    text?: string;
    /** Free items, or items sold for coins (subscription items count as paid). */
    price?: 'free' | 'paid';
    /** Genvr Core, creators, or AI-made items. */
    source?: ItemSource;
}
export declare function queryLibrary<T extends LibraryEntry = LibraryEntry>(filter?: LibraryFilter, entries?: readonly T[]): T[];
/** Price label of an item for the catalogs: "Free", "Plus", or its price in coins. */
export declare function priceLabel(manifest: GenvrManifest): string;
export declare const getLibraryItem: (id: string) => LibraryEntry | undefined;
