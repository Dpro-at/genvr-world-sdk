/** Tidewater4811ba48 Terrain.js: meadow self shade affects only key direct sunlight. */
import { TSL, type DirectionalLight, type MeshStandardNodeMaterial } from 'three/webgpu';
/* eslint-disable @typescript-eslint/no-explicit-any -- Three lighting model extension */
type N = any;
const bindings = new WeakMap<MeshStandardNodeMaterial, N>();
const installed = new WeakMap<MeshStandardNodeMaterial, () => void>();
export function meadowSunFactor(height: number, weight: number): number {
  const v = Math.max(0, Math.min(1, (height + 0.05) / 0.5));
  return 1 + (v * v * (3 - 2 * v) * 0.35 + 0.62 - 1) * weight;
}
/** Register the source meadow mask on the original; the lighting adapter supplies its actual sun. */
export function attachGroundSunModulation(material: MeshStandardNodeMaterial, meadowWeightNode: N): void {
  bindings.set(material, meadowWeightNode);
}
/** NodeMaterial.clone does not copy custom setup functions, so transfer explicitly when installing. */
export function copyGroundSunModulation(
  source: MeshStandardNodeMaterial,
  target: MeshStandardNodeMaterial,
  sun: DirectionalLight,
  sunDirection: N,
  terrainVisibility?: N,
): (() => void) | null {
  installed.get(target)?.();
  const weight = bindings.get(source);
  if (weight === undefined && terrainVisibility === undefined) return null;
  const t = TSL as N;
  const factor = t
    .mix(1, t.smoothstep(-0.05, 0.45, sunDirection.y).mul(0.35).add(0.62), weight ?? t.float(0))
    .mul(terrainVisibility ?? 1);
  const original: N = target.setupLightingModel;
  const replacement = function (this: MeshStandardNodeMaterial, builder: N): N {
    const model = original.call(this, builder) as N;
    const direct = model.direct;
    model.direct = function (data: N, nodeBuilder: N): void {
      direct.call(
        this,
        data.lightNode?.light === sun ? { ...data, lightColor: data.lightColor.mul(factor) } : data,
        nodeBuilder,
      );
    };
    return model;
  };
  (target as N).setupLightingModel = replacement;
  target.needsUpdate = true;
  const restore = (): void => {
    if (target.setupLightingModel === replacement) target.setupLightingModel = original;
    installed.delete(target);
  };
  installed.set(target, restore);
  return restore;
}
