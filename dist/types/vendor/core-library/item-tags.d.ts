/** Every allowed tag word. */
export declare const ITEM_TAG_VOCABULARY: ReadonlySet<string>;
/** Keeps known tag words: lowercase, single words, no repeats, at most `max`. */
export declare function cleanItemTags(tags: readonly string[], max?: number): string[];
