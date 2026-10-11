import type { SkyItem } from './_sky.js';
export * from './_sky.js';
/** Every Core sky, in picker order (one file per sky). */
export declare const CORE_SKIES: readonly SkyItem[];
/** The sky item of a world's sky preset. */
export declare const getSky: (preset: SkyItem["preset"]) => SkyItem;
