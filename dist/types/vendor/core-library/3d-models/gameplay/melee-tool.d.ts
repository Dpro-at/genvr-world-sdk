/**
 * The Melee tool's id. Stored worlds and loadouts may still hold its old id (the item was named
 * Sword before decision 119); the contracts read that as this one (`LEGACY_MELEE_TOOL_ID`).
 */
export declare const MELEE_TOOL_ID = "genvr.core.gameplay.melee-tool";
/**
 * A generic held melee tool: a long flat head points up along +y from the grip. Its base rests on
 * y = 0 like every Core item, so the grip is 0.1 m above the origin (the hand holds it there).
 * What it is in a game (and what it is called there) is the designer's decision.
 */
declare const _default: import("../_parts.js").CoreItem;
export default _default;
