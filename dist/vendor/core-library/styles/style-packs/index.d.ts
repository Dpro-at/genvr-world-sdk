import type { StylePack } from './_style-pack.js';
export * from './_style-pack.js';
/** Every Core style pack (one file per style). */
export declare const STYLE_PACKS: readonly StylePack[];
/** The style pack of a world's base style. */
export declare const getStylePack: (style: StylePack["style"]) => StylePack;
