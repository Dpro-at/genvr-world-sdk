import { type PackageFetcher } from './item-packages.js';
/** The six pictures of item analysis (P4-06, docs/ITEM-ANALYSIS.md). */
export declare const ITEM_VIEWS: readonly ["front", "back", "left", "right", "top", "three-quarter"];
export type ItemView = (typeof ITEM_VIEWS)[number];
export interface ItemPictures {
    /** PNG data URLs, one per view. */
    views: Record<ItemView, string>;
    stats: {
        triangles: number;
        /** Width, height, depth in meters. */
        size: [number, number, number];
        parts: number;
        /** What drew the pictures (headless browsers often fall back to WebGL). */
        backend: 'WebGPU' | 'WebGL';
    };
}
/**
 * Draws a library item from six angles with the real engine (same geometry and material as in
 * worlds), on a neutral background with a fixed camera, so reviewers and the vision model
 * compare like with like. Runs without a world; used by the render page the worker opens.
 * Items that are not in the Core Library are drawn from their glTF package (P2-16), at rest.
 */
export declare function renderItemPictures(itemId: string, { size, background, fetchPackage, }?: {
    size?: number;
    background?: number;
    fetchPackage?: PackageFetcher;
}): Promise<ItemPictures>;
