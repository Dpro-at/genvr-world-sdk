import type { CoreItem } from '../_parts.js';
import testBox from './props-and-decor/test-box.js';
import giantClam from './nature/giant-clam.js';
import seaShell from './nature/sea-shell.js';
import starfish from './nature/starfish.js';

/**
 * Items of the Tidewater world experiment (decision 130), each drawn by a runtime generator ported from Tidewater
 * (github.com/dgreenheck/tidewater, MIT). They are experimental: `getCoreItem` finds them so the test place can hold
 * them, but `CORE_ITEMS`, the catalogs and the library leave them out. Opening one to every place is moving it into
 * `CORE_ITEMS`.
 */
export const TIDEWATER_ITEMS: readonly CoreItem[] = [testBox];

/**
 * Sea life of the seabed and shore (SEALIFE-01), drawn by Genvr's own procedural generators in `runtime/src/sealife/`.
 * Opened to every place (ITEMS-close-01, owner 2026-10-05): normal Realistic library items in `CORE_ITEMS`.
 */
export const SEALIFE_ITEMS: readonly CoreItem[] = [starfish, giantClam, seaShell];
