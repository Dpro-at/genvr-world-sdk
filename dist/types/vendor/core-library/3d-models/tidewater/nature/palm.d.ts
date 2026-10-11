import { type ItemBounds } from '../../_parts.js';
/** Reusable source resource, registered in the existing Nature catalog. */
export declare const TIDEWATER_PALM_ID = "genvr.core.tidewater.palm";
export declare const TIDEWATER_PALM_DEFAULTS: {
    readonly seed: 11;
    readonly height: 10;
    readonly lean: 0.12;
    readonly leanAngle: 0.3;
};
export declare const TIDEWATER_PALM_LIMITS: {
    seed: {
        min: number;
        max: number;
    };
    height: {
        min: number;
        max: number;
    };
    lean: {
        min: number;
        max: number;
    };
    leanAngle: {
        min: number;
        max: number;
    };
};
export declare const TIDEWATER_PALM_CONTROLS: {
    seed: {
        group: "general";
        label: string;
        help: string;
    };
    height: {
        group: "appearance";
        label: string;
        help: string;
        unit: string;
    };
    lean: {
        group: "appearance";
        label: string;
        help: string;
    };
    leanAngle: {
        group: "appearance";
        label: string;
        help: string;
        unit: string;
    };
};
export declare const TIDEWATER_PALM_SOURCE: {
    readonly name: "Tidewater / DRG Software Solutions LLC";
    readonly page: "https://github.com/dgreenheck/tidewater/tree/4811ba48d795197de5621985f404e765c0b7c0ef/src/world/vegetation";
    readonly license: "MIT";
};
/** Outward-rounded source calm-pose measurements at the declared default parameters.
 * These are static AABBs, not a conservative animated wind envelope. */
export declare const TIDEWATER_PALM_BOUNDS: ItemBounds;
export declare const TIDEWATER_PALM_BLOCKS: ItemBounds;
/** Static authoring bounds and trunk collider; wind is inherited from world settings. */
export declare function createTidewaterPalmResource(bounds?: ItemBounds, blocks?: ItemBounds): import("../../_parts.js").CoreItem;
export declare const TIDEWATER_PALM: import("../../_parts.js").CoreItem;
export default TIDEWATER_PALM;
