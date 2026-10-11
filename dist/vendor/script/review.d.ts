import { WorldDocument, type ScriptTestEvent } from '../contracts/index.js';
/**
 * The fixture a store script item is dry-run against when it is installed (spec 9.3), named as an example place: an
 * empty game (the generic match only: no counters, rules or ranking), a gate tagged "line", two spawn points, and two
 * players who each cross the gate once, with time passing afterwards so a timer a script starts can fire. The review
 * card shows what the script asked for here. A new object each call.
 */
export declare function reviewFixture(): {
    doc: WorldDocument;
    events: ScriptTestEvent[];
};
