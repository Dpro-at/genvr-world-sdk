import type { GenvrManifest, RestRule } from '../contracts/index.js';
import type { CoreItem } from './3d-models/_parts.js';
/**
 * How a Core item rests (P2-43, decision 116): its manifest's rule if it has one, otherwise the
 * default for its group. Written once per item; looks per style change the bounds, never the mode.
 */
export declare function restRule(item: CoreItem, bounds: {
    min: readonly number[];
    max: readonly number[];
}): RestRule;
/** An uploaded package's rule: its manifest's rule, `float` when made to float, else upright. */
export declare function packageRestRule(manifest: GenvrManifest): RestRule;
