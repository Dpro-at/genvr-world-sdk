import type { CoreItem } from '../_parts.js';
/**
 * Items of the Tidewater world experiment (decision 130), each drawn by a runtime generator ported from Tidewater
 * (github.com/dgreenheck/tidewater, MIT). They are experimental: `getCoreItem` finds them so the test place can hold
 * them, but `CORE_ITEMS`, the catalogs and the library leave them out. Opening one to every place is moving it into
 * `CORE_ITEMS`.
 */
export declare const TIDEWATER_ITEMS: readonly CoreItem[];
/**
 * Sea life of the seabed and shore (SEALIFE-01), drawn by Genvr's own procedural generators in `runtime/src/sealife/`.
 * Opened to every place (ITEMS-close-01, owner 2026-10-05): normal Realistic library items in `CORE_ITEMS`.
 */
export declare const SEALIFE_ITEMS: readonly CoreItem[];
