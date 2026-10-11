/**
 * Starfish (SEALIFE-01): a 5- or 6-armed sea star for the Tidewater seabed and shore, drawn by the runtime generator
 * `sealife.starfish` (`runtime/src/sealife/starfish.ts`, own procedural code). In the library for every Realistic
 * place (ITEMS-close-01, owner 2026-10-05); the id keeps `tidewater` until the internal rename.
 */
export declare const STARFISH_DEFAULTS: {
    readonly seed: 7;
    readonly size: 0.25;
    readonly arms: 5;
    readonly palette: "orange";
    readonly curl: 0.5;
};
export declare const STARFISH_LIMITS: {
    seed: {
        min: number;
        max: number;
    };
    size: {
        min: number;
        max: number;
    };
    arms: {
        min: number;
        max: number;
    };
    palette: {
        values: string[];
    };
    curl: {
        min: number;
        max: number;
    };
};
export declare const STARFISH_CONTROLS: {
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
    arms: {
        group: "appearance";
        label: string;
        help: string;
    };
    palette: {
        group: "appearance";
        label: string;
        help: string;
    };
    curl: {
        group: "motion";
        label: string;
        help: string;
    };
};
declare const item: import("../../_parts.js").CoreItem;
export default item;
