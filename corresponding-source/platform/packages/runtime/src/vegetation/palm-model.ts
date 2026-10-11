import type { ItemModel } from '../items.js';
import type { PackageMesh } from '../item-packages.js';
import { palmGeometryBinding } from './palm-generator.js';
import type { PalmWorldBindings } from './palm-bindings.js';

export const hasPalmGeometry = (model: ItemModel): boolean =>
  !!model.meshes?.some(part => palmGeometryBinding(part.geometry));

/** Adapt existing generated model parts, retaining their identity, previews and trunk collider.
 * Logical picking/collision use the authoring pose, as for other animated item models.
 * Shader-deformed batches disable frustum culling; no incorrect static GPU bound clips wind. */
export function preparePalmModel(model: ItemModel, owner: PalmWorldBindings): ItemModel {
  if (!hasPalmGeometry(model)) return model;
  const prepare = (part: PackageMesh) => {
    const binding = palmGeometryBinding(part.geometry);
    if (!binding) return part;
    const near = binding.level === 0;
    return owner.prepare(part, binding.source, binding.definition,
      near ? [0, 120, 120] : [120, 2600, 2800], near);
  };
  return { ...model, meshes: model.meshes!.map(prepare), lods: model.lods!.map(level => level.map(prepare)),
    lodResidency: { ranges: [[0, 137.2], [102.8, 2810]], refreshDistance: 6 } };
}
