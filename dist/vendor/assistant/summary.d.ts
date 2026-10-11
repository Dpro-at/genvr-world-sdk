import { type Game, type WorldDocument } from '../contracts/index.js';
/** Items one `get_world_summary` page lists (`from_item` gives the next page). */
export declare const WORLD_SUMMARY_PAGE = 100;
/**
 * The most characters one summary page has: a page ends before 100 items when the next item line
 * would pass it (long zone lines), so an MCP answer with its data line, place version and place
 * notes stays under the 8000-character result cap.
 */
export declare const WORLD_SUMMARY_CHARS = 6500;
/** How the summary's compass words map to the place's axes (shown when the place has zones). */
export declare const DIRECTIONS_LINE = "Directions: north is -z, east is +x; turn 0\u00B0 faces south (+z).";
/**
 * Compact description of a world for the model's prompt (task P4-03 grows this): size, look,
 * and the objects with ids and ground positions. `maxItems` limits the item list; `fromItem`
 * starts it later (a page), and a cut list ends with `more_items_from: N`, the next page's start.
 * A page also ends early when it would pass `WORLD_SUMMARY_CHARS` (its first item is always shown).
 */
export declare function worldSummary(world: WorldDocument, maxItems: number, fromItem?: number): string;
/**
 * The game in a few words (P9-12), from the generic parts it has: "5 min, two teams, highest
 * score wins" or "10 min, 2 counters, 5 rules, ranked by points".
 */
export declare function describeGame(game: Game): string;
/**
 * The game's rules in counts (`set_rules` answers with it): "3 counters, 5 rules, ranked by
 * points, 2 displays"; counters and rules are always counted, even when there are none.
 */
export declare function describeRules(game: Game): string;
/**
 * The rideable items of a place by model ("3 rideable items: 2 ground, 1 air"), or null when it
 * has none.
 */
export declare function describeRideables(world: WorldDocument): string | null;
/** The most characters `get_game` answers with; a longer rule list comes in pages. */
export declare const GAME_JSON_LIMIT = 6000;
/**
 * The game's own data for the model (`get_game`): the clock and teams, counters, rules with
 * their index (what `remove_rules` takes), ranking, displays with their index and whether the
 * highest score wins. Rules from `fromRule` on are shown until the answer would pass
 * `GAME_JSON_LIMIT`; `more_rules_from` then names the next page.
 */
export declare function gameJson(game: Game, fromRule?: number, rideables?: string | null): string;
