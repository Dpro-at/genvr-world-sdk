import type { Style } from '../contracts/index.js';
import { type LibraryEntry } from './library.js';
/**
 * Style coverage of the Core Library (task P2-30, decision 111): every entry is drawn in every
 * world style, with its own look for that style, one look shared by several styles, or not at all
 * where the style does not use it. A library test fails when an entry has no look for a ready
 * style, and keeps the table in docs/CORE-LIBRARY.md current.
 */
/** Every world style, in the order of the coverage table. */
export declare const ALL_STYLES_ORDER: readonly Style[];
/** Styles players build in today: every entry must be drawn in them. Anime and realistic follow (P2-33, P2-18). */
export declare const READY_STYLES: readonly Style[];
/** How an entry is drawn in a style. */
export type StyleCoverage = 'own' | 'shared' | 'not-needed' | 'missing';
/** The kind of an entry: its category and subcategory. */
export declare const entryKind: (entry: LibraryEntry) => string;
/** Why a kind covers the styles the way it does, or null for a kind without a rule. */
export declare const kindReason: (kind: string) => string | null;
/** How an entry is drawn in a style; `missing` when it has no look there (or its kind has no rule). */
export declare function styleCoverage(entry: LibraryEntry, style: Style): StyleCoverage;
/** Entries with no look for a ready style: "id (style)" each. */
export declare function missingLooks(entries?: readonly LibraryEntry[]): string[];
/** The coverage table of docs/CORE-LIBRARY.md: one row per kind, counts per style. */
export declare function coverageTable(entries?: readonly LibraryEntry[]): string;
