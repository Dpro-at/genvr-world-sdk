import type { Style } from '../contracts/index.js';
/**
 * One short paragraph per world style for builders and their AI tools (MCP `get_style_guide`),
 * written from docs/CORE-LIBRARY.md (Styles, Style coverage, decisions 65, 101, 111). No look rules
 * beyond what that document says.
 */
export declare const STYLE_NOTES: Readonly<Record<Style, string>>;
/** Mixing (docs/CORE-LIBRARY.md): one base style plus an optional accent style, never free mixing. */
export declare const STYLE_MIXING = "A place has one base style and at most one accent style for specific zones or items; free mixing of everything is not supported.";
