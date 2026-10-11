import type { ItemModel } from '../items.js';
import type { CanopyWorldBindings } from './canopy-bindings.js';
export declare const hasCanopyGeometry: (model: ItemModel) => boolean;
/** Native item integration: source shader distances plus padded CPU residency.
 * Unsupported transforms retain the full static near mesh even outside the animated range.
 */
export declare function prepareCanopyModel(model: ItemModel, owner: CanopyWorldBindings): ItemModel;
