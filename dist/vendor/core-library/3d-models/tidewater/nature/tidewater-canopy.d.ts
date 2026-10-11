import { type ItemBounds } from '../../_parts.js';
/** Unregistered reusable source canopy definitions. Tidewater4811ba48, MIT. */
export declare const TIDEWATER_TREE_ID = "genvr.core.tidewater.tree";
export declare const TIDEWATER_SHRUB_ID = "genvr.core.tidewater.shrub";
export declare const TIDEWATER_CANOPY_DEFAULTS: {
    readonly appearanceSeed: 0.37;
    readonly size: 1;
    readonly stretch: 1;
};
export declare const TIDEWATER_CANOPY_LIMITS: {
    appearanceSeed: {
        min: number;
        max: number;
    };
    size: {
        min: number;
        max: number;
    };
    stretch: {
        min: number;
        max: number;
    };
};
export declare const TIDEWATER_CANOPY_CONTROLS: {
    appearanceSeed: {
        group: "appearance";
        label: string;
        help: string;
    };
    size: {
        group: "appearance";
        label: string;
        help: string;
    };
    stretch: {
        group: "appearance";
        label: string;
        help: string;
    };
};
export declare const TIDEWATER_CANOPY_SOURCE: {
    readonly name: "Tidewater / DRG Software Solutions LLC";
    readonly page: "https://github.com/dgreenheck/tidewater/tree/4811ba48d795197de5621985f404e765c0b7c0ef/src/world/vegetation";
    readonly license: "MIT";
};
/** Outward-rounded default static variant AABBs. Tree blocks enclose source bark vertices in
 * only the lower 2 nominal metres for the authored tree collider. Shrubs have no collider. Neither bounds are an animated wind envelope. */
export declare const TIDEWATER_TREE_BOUNDS: ItemBounds;
export declare const TIDEWATER_TREE_BLOCKS: ItemBounds;
export declare const TIDEWATER_SHRUB_BOUNDS: ItemBounds;
export declare const TIDEWATER_SHRUB_BLOCKS: ItemBounds;
export declare function createTidewaterCanopyResource(kind: 'tree' | 'shrub', bounds?: ItemBounds, blocks?: ItemBounds): import("../../_parts.js").CoreItem;
export declare const TIDEWATER_TREE: import("../../_parts.js").CoreItem;
export declare const TIDEWATER_SHRUB: import("../../_parts.js").CoreItem;
