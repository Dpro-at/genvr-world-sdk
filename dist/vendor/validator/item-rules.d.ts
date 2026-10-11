import type { CommandPayload, ItemInstance, PlacementRules, WorldDocument } from '../contracts/index.js';
import { type Placed } from './geometry.js';
import type { WorldEnvironment } from './world-checks.js';
export type PlacementRuleName = 'stands' | 'soil' | 'tilt' | 'slope' | 'front';
/** One placement rule of an item and whether the item keeps it (the studio's debug view). */
export interface RuleResult {
    rule: PlacementRuleName;
    /** The rule in words, e.g. "Upright (leans at most 10°)". */
    label: string;
    ok: boolean;
    /** Why it is broken, or null when kept. */
    message: string | null;
    /** Commands that repair it (one undo step), or null when a person has to decide. */
    fix: CommandPayload[] | null;
}
/** The rules of one placed item, checked against the world around it. */
export declare function checkItemRules(item: Placed, rules: PlacementRules, env: WorldEnvironment, others: readonly Placed[], nameOf: (instance: ItemInstance) => string): RuleResult[];
/**
 * The placement rules of one item, placed or only planned (the assistant asks before placing):
 * every rule with kept or broken, or null when the item has no rules or no known size.
 */
export declare function ruleReport(doc: WorldDocument, env: WorldEnvironment, instance: ItemInstance, nameOf?: (instance: ItemInstance) => string): RuleResult[] | null;
