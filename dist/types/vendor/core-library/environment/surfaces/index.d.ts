import type { SurfaceItem } from './_surface.js';
export * from './_surface.js';
/** Every Core surface, in picker order (one file per surface). */
export declare const CORE_SURFACES: readonly SurfaceItem[];
/** The surface of a placed item's `material` key (unknown keys fall back to plastic). */
export declare const getSurface: (key: string | undefined) => SurfaceItem;
