/** Source leaf transmission multiplies shadowed sun light, never ambient/emissive. */
import { type DirectionalLight, type MeshStandardNodeMaterial } from 'three/webgpu';
/* eslint-disable @typescript-eslint/no-explicit-any -- Three lighting model extension */
type N = any;
const bindings = new WeakMap<MeshStandardNodeMaterial, N>();
const installed = new WeakMap<MeshStandardNodeMaterial, () => void>();

/** Save the source graph separately: Three clone() does not copy custom setup methods. */
export function registerPlantTransmission(material: MeshStandardNodeMaterial, node: N): void {
  bindings.set(material, node);
}

/** Install after ground sun modulation; the added term needs its own terrain factor. */
export function copyPlantTransmission(
  source: MeshStandardNodeMaterial,
  target: MeshStandardNodeMaterial,
  sun: DirectionalLight,
  terrainVisibility?: N,
): (() => void) | null {
  installed.get(target)?.();
  const node = bindings.get(source);
  if (node === undefined) return null;
  bindings.set(target, node);
  const transmission = terrainVisibility === undefined ? node : node.mul(terrainVisibility);
  const original: N = target.setupLightingModel;
  const originalKey = target.customProgramCacheKey;
  // The graph lives in a custom setup method, outside NodeMaterial's normal node
  // properties. Distinct terrain factors must not reuse an earlier clone's program.
  const cacheKey = () => `${originalKey.call(target)}:plant-transmission:${sun.uuid}:${transmission.id ?? ''}`;
  const replacement = function (this: MeshStandardNodeMaterial, builder: N): N {
    const model: N = original.call(this, builder);
    const direct = model.direct;
    model.direct = function (data: N, nodeBuilder: N): void {
      direct.call(this, data, nodeBuilder);
      if (data.lightNode?.light === sun) {
        data.reflectedLight.directDiffuse.addAssign(transmission.mul(data.lightColor));
      }
    };
    return model;
  };
  (target as N).setupLightingModel = replacement;
  target.customProgramCacheKey = cacheKey;
  target.needsUpdate = true;
  const restore = (): void => {
    let changed = false;
    if (target.setupLightingModel === replacement) { target.setupLightingModel = original; changed = true; }
    if (target.customProgramCacheKey === cacheKey) { target.customProgramCacheKey = originalKey; changed = true; }
    if (changed) target.needsUpdate = true;
    if (installed.get(target) === restore) installed.delete(target);
  };
  installed.set(target, restore);
  return restore;
}
