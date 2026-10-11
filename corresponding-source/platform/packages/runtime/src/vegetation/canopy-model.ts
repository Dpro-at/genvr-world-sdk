import { Quaternion, Vector3, type Matrix4 } from 'three/webgpu';
import type { ItemModel } from '../items.js';
import type { PackageMesh } from '../item-packages.js';
import { canopyGeometryBinding } from './canopy-generator.js';
import type { CanopyWorldBindings } from './canopy-bindings.js';

export const hasCanopyGeometry = (model: ItemModel): boolean =>
  !!model.meshes?.some((part) => canopyGeometryBinding(part.geometry));

/** Native item integration: source shader distances plus padded CPU residency.
 * Unsupported transforms retain the full static near mesh even outside the animated range.
 */
export function prepareCanopyModel(model: ItemModel, owner: CanopyWorldBindings): ItemModel {
  if (!hasCanopyGeometry(model)) return model;
  const binding = model.meshes!.map((part) => canopyGeometryBinding(part.geometry)).find(Boolean)!;
  const near = binding.definition.kind === 'tree' ? 65 : 45;
  const far = binding.definition.kind === 'tree' ? 2800 : 180;
  const prepare = (part: PackageMesh) => {
    const data = canopyGeometryBinding(part.geometry);
    return data ? owner.prepare(part, data.source, data.definition, data.level) : part;
  };
  const translation = new Vector3(),
    scale = new Vector3(),
    rotation = new Quaternion();
  const forceNear = (matrix: Matrix4) => {
    matrix.decompose(translation, rotation, scale);
    return !(
      Math.abs(rotation.x) < 1e-5 &&
      Math.abs(rotation.z) < 1e-5 &&
      scale.x > 1e-6 &&
      scale.y > 1e-6 &&
      Math.abs(scale.x - scale.z) < 1e-5
    );
  };
  return {
    ...model,
    meshes: model.meshes!.map(prepare),
    lods: model.lods!.map((parts) => parts.map(prepare)),
    lodResidency: {
      ranges: [
        [0, near * 1.06 + 10],
        [near * 0.94 - 10, far + 10],
      ],
      refreshDistance: 6,
      forceNear,
    },
  };
}
