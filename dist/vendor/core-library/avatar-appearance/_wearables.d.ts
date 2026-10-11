import type { WearableItem } from './_wearable.js';
/** Clothes (store type `clothing`) on the Look tab, in library order. */
export declare const CORE_CLOTHING: readonly WearableItem[];
/** Accessories (store type `avatar`) on the Extras tab, in library order. */
export declare const CORE_ACCESSORIES: readonly WearableItem[];
export declare const CORE_WEARABLES: readonly WearableItem[];
export declare const findWearable: (id: string) => WearableItem | undefined;
/**
 * The items a look really wears: known ids only, one per slot and layer (the last one wins, so a
 * new hat replaces the old one), inner layers before outer ones (outer colors win).
 */
export declare function wornItems(ids: readonly string[]): WearableItem[];
/**
 * Puts an item on (replacing the one in its slot and layer, so a jacket goes over a hoodie but
 * replaces a vest), or takes it off when it is already worn.
 */
export declare function toggleWearable(ids: readonly string[], id: string): string[];
