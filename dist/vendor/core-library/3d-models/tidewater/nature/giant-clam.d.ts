/**
 * Giant clam (SEALIFE-01): two fluted valves gaping upwards with a coloured, spotted mantle, slowly closing a little
 * and opening again. Drawn by the runtime generator `sealife.giant-clam` (`runtime/src/sealife/clam.ts`, own
 * procedural code). In the library for every Realistic place (ITEMS-close-01, owner 2026-10-05); the id keeps
 * `tidewater` until the internal rename.
 */
export declare const GIANT_CLAM_DEFAULTS: {
    readonly seed: 3;
    readonly size: 0.55;
    readonly mantle: "blue";
    readonly open: 0.7;
    readonly speed: 1;
};
export declare const GIANT_CLAM_LIMITS: {
    seed: {
        min: number;
        max: number;
    };
    size: {
        min: number;
        max: number;
    };
    mantle: {
        values: string[];
    };
    open: {
        min: number;
        max: number;
    };
    speed: {
        min: number;
        max: number;
    };
};
export declare const GIANT_CLAM_CONTROLS: {
    seed: {
        group: "general";
        label: string;
        help: string;
    };
    size: {
        group: "appearance";
        label: string;
        help: string;
        unit: string;
    };
    mantle: {
        group: "appearance";
        label: string;
        help: string;
    };
    open: {
        group: "motion";
        label: string;
        help: string;
    };
    speed: {
        group: "motion";
        label: string;
        help: string;
    };
};
declare const item: import("../../_parts.js").CoreItem;
export default item;
