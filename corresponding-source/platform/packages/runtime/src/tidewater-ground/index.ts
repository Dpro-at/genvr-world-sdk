/** Reusable Ground-library adapter for the pinned Tidewater procedural surface. */
import { getGround } from '@genvr/core-library';
import { DataTexture, LinearFilter, RGBAFormat, TSL, Vector2, type MeshStandardNodeMaterial } from 'three/webgpu';
import type { VegetationWindProvider } from '../vegetation/wind.js';
import { TidewaterWorldWind } from '../vegetation/world-wind.js';
import { bakeTerrainMaps, sampleTerrainFields } from './ground-bake.js';
import { createTidewaterGroundGraph } from './ground-shading.js';
import { attachGroundSunModulation } from './sun-modulation.js';
/* eslint-disable @typescript-eslint/no-explicit-any -- TSL dynamically indexed paint attributes */
type N = any;
const t = TSL as N;
export const GROUND_VARIANTS = ['beach-sand', 'seabed-sand', 'rock', 'grass', 'dirt', 'rubble', 'seagrass'] as const;
/** Zero denotes an existing image material, preserving every old palette slot. */
export function groundVariantIds(names: readonly string[]): number[] {
  return names.map(name => {
    const variant = getGround(name)?.procedural?.variant;
    return variant ? GROUND_VARIANTS.indexOf(variant) + 1 : 0;
  });
}
/** Water owns this persistent bridge and its textures; ground only consumes its nodes. */
export interface GroundShoreProvider {
  wetFoamNode(xz: N, heightSeaRelative: N): N;
  readonly swellDirectionNode: N;
}
export class TidewaterGround {
  readonly detail;
  readonly sea = t.uniform(0);
  readonly windDirection;
  readonly windSpeed;
  readonly gustOffset;
  readonly swellDirection = t.uniform(new Vector2(-.11914522, -.99287684));
  readonly normal: DataTexture;
  readonly resolution: number;
  #dirty = true;
  #disposed = false;
  readonly #ownedWind: TidewaterWorldWind | null;
  constructor(readonly terrain: { half: number; heightAt(x: number, z: number): number },
    readonly shore?: GroundShoreProvider, wind?: VegetationWindProvider) {
    this.#ownedWind = wind ? null : new TidewaterWorldWind();
    const provider = wind ?? this.#ownedWind!;
    this.detail = provider.detail;
    this.windDirection = provider.windDirection;
    this.windSpeed = provider.windSpeed;
    this.gustOffset = provider.gustOffset;
    for (const node of [this.sea, this.swellDirection])
      node.setGroup(t.renderGroup);
    // Preserve a one-metre grid for small places; cap large-world memory explicitly.
    this.resolution = Math.max(8, Math.min(512, Math.ceil(terrain.half * 2 / 4) * 4));
    this.normal = new DataTexture(new Uint8Array(this.resolution ** 2 * 4), this.resolution, this.resolution, RGBAFormat);
    this.normal.minFilter = this.normal.magFilter = LinearFilter;
    this.normal.generateMipmaps = false;
  }
  invalidate(): void { this.#dirty = true; }
  update(seaLevel: number, dt = 0): void {
    if (this.#disposed) return;
    if (this.sea.value !== seaLevel) { this.sea.value = seaLevel; this.invalidate(); }
    // Terrain.update: integrate in world metres, so changing wind never jumps the pattern.
    this.#ownedWind?.update(dt);
    if (!this.#dirty) return;
    const fields = sampleTerrainFields({ res: this.resolution,
      texel: this.terrain.half * 2 / this.resolution, origin: -this.terrain.half,
      heightAt: (x, z) => this.terrain.heightAt(x, z) - seaLevel });
    const baked = bakeTerrainMaps(fields);
    (this.normal.image.data as Uint8Array).set(baked.normal);
    this.normal.needsUpdate = true;
    this.#dirty = false;
  }
  /** Barycentric paint weights select source masks; only selected regions use the source graph. */
  bind(material: MeshStandardNodeMaterial, names: readonly string[], fixedLayer?: number): boolean {
    const ids = groundVariantIds(names);
    if (!ids.some(Boolean) || (fixedLayer !== undefined && !ids[fixedLayer])) return false;
    const table = t.uniformArray(ids, 'float');
    const layers = t.attribute('groundLayers', 'vec3'), bary = t.attribute('groundBary', 'vec3');
    const weight = (id: number) => fixedLayer !== undefined ? t.float(ids[fixedLayer] === id ? 1 : 0) :
      t.select(table.element(layers.x).equal(id), bary.x, 0)
        .add(t.select(table.element(layers.y).equal(id), bary.y, 0))
        .add(t.select(table.element(layers.z).equal(id), bary.z, 0));
    const weights = GROUND_VARIANTS.map((_, i) => weight(i + 1));
    const coverage = weights.reduce((a, b) => a.add(b)).clamp(0, 1);
    const total = coverage.max(.00001);
    const nr = t.texture(this.normal, t.positionWorld.xz.add(this.terrain.half).div(this.terrain.half * 2));
    const graph = createTidewaterGroundGraph({ detailTexture: this.detail,
      position: t.positionWorld.sub(t.vec3(0, this.sea, 0)),
      cameraPosition: t.cameraPosition.sub(t.vec3(0, this.sea, 0)),
      normalRock: t.vec4(nr.rg.mul(2).sub(1), nr.b, nr.a), splat: t.vec4(0),
      windDirection: this.windDirection, windSpeed: this.windSpeed, gustOffset: this.gustOffset,
      swellDirection: this.shore?.swellDirectionNode ?? this.swellDirection,
      ...(this.shore ? { wetFoam: this.shore.wetFoamNode(t.positionWorld.xz, t.positionWorld.y.sub(this.sea)) } : {}),
      layerWeights: { beachSand: weights[0].div(total), seabedSand: weights[1].div(total),
        rock: weights[2].div(total), grass: weights[3].div(total), dirt: weights[4].div(total), rubble: weights[5].div(total),
        seagrass: weights[6].div(total) } });
    material.colorNode = t.mix(material.colorNode ?? t.materialColor, graph.colorNode, coverage);
    material.roughnessNode = t.mix(material.roughnessNode ?? t.materialRoughness, graph.roughnessNode, coverage);
    material.normalNode = t.normalize(t.mix(material.normalNode ?? t.normalView,
      t.transformNormalToView(graph.normalWorldNode), coverage));
    material.aoNode = t.mix(material.aoNode ?? t.float(1), graph.aoNode, coverage);
    attachGroundSunModulation(material, graph.meadowWeightNode.mul(coverage));
    return true;
  }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#ownedWind?.dispose(); this.normal.dispose();
  }
}
