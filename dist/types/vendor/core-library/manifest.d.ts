import { GenvrManifest, type Category, type ItemType, type PlacementRules, type Style } from '../contracts/index.js';
/** Every art style: items that look right in any world (animations, sounds, scripts). */
export declare const ALL_STYLES: readonly Style[];
export interface CoreManifestInput {
    id: string;
    name: string;
    type: ItemType;
    category: Category;
    subcategory: string;
    styles?: readonly Style[];
    collider?: 'none' | 'box';
    triangles?: number;
    placement?: PlacementRules;
    /** Players climb it (manifest `physics.climbable`). */
    climbable?: boolean;
    /** A tool a player holds (manifest `tool`). */
    tool?: GenvrManifest['tool'];
    /** A map marker of the rules (manifest `marker`). */
    marker?: GenvrManifest['marker'];
}
/**
 * Manifest of a free Core Library item, in the same `.genvr` format as store items, so core,
 * store, and user items go through one pipeline (docs/CORE-LIBRARY.md "Organization").
 */
export declare function coreManifest(input: CoreManifestInput): GenvrManifest;
