import type { ItemModel } from '../items.js';
import type { PalmWorldBindings } from './palm-bindings.js';
export declare const hasPalmGeometry: (model: ItemModel) => boolean;
/** Adapt existing generated model parts, retaining their identity, previews and trunk collider.
 * Logical picking/collision use the authoring pose, as for other animated item models.
 * Shader-deformed batches disable frustum culling; no incorrect static GPU bound clips wind. */
export declare function preparePalmModel(model: ItemModel, owner: PalmWorldBindings): ItemModel;
