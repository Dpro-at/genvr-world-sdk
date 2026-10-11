/**
 * Sea shell (SEALIFE-01): a cowrie, conch, scallop or small spiral snail lying on sand, drawn by the runtime
 * generator `sealife.shell` (`runtime/src/sealife/shells.ts`, own procedural code; the conch and snail follow a
 * logarithmic spiral). Static. In the library for every Realistic place (ITEMS-close-01, owner 2026-10-05); the id
 * keeps `tidewater` until the internal rename.
 */
export declare const SEA_SHELL_DEFAULTS: {
    readonly seed: 5;
    readonly kind: "cowrie";
    readonly size: 0.1;
    readonly tone: "natural";
};
export declare const SEA_SHELL_LIMITS: {
    seed: {
        min: number;
        max: number;
    };
    kind: {
        values: string[];
    };
    size: {
        min: number;
        max: number;
    };
    tone: {
        values: string[];
    };
};
export declare const SEA_SHELL_CONTROLS: {
    seed: {
        group: "general";
        label: string;
        help: string;
    };
    kind: {
        group: "appearance";
        label: string;
        help: string;
    };
    size: {
        group: "appearance";
        label: string;
        help: string;
        unit: string;
    };
    tone: {
        group: "appearance";
        label: string;
        help: string;
    };
};
declare const item: import("../../_parts.js").CoreItem;
export default item;
