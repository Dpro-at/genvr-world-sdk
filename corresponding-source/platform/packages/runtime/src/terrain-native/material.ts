import type { TerrainActiveSurface } from '@genvr/contracts';
import type { TerrainFieldStore } from '@genvr/world';
import { resolveTerrainSurface } from '@genvr/core-library';
import {
  DataTexture,
  RGBAFormat,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshStandardNodeMaterial,
  TSL,
  type Texture,
} from 'three/webgpu';
import { bakeTerrainMaps, type TerrainBakeFields } from '../tidewater-ground/ground-bake.js';
import { createDetailTexture } from '../tidewater-ground/detail-texture.js';
import { createTidewaterGroundGraph } from '../tidewater-ground/ground-shading.js';
import { attachGroundSunModulation } from '../tidewater-ground/sun-modulation.js';
import type { TerrainFieldTextures } from '../terrain-fields-gpu.js';
/* eslint-disable @typescript-eslint/no-explicit-any -- native TSL graph API */
type Node = any;
const t = TSL as Node;
export interface NativeGroundProviders {
  /** Borrowed source detail texture, shared with vegetation; caller owns disposal. */
  detailTexture?: Texture;
  wetFoam?: (seaRelativePosition: Node) => Node;
  windDirection?: Node;
  windSpeed?: Node;
  gustOffset?: Node;
  swellDirection?: Node;
}
/** No implicit source-channel names or palette normalization. */
export function validateNativeMaterialBindings(
  store: TerrainFieldStore,
  surface: TerrainActiveSurface,
): void {
  resolveTerrainSurface(store.descriptor, surface);
}
export function createNativeGroundMaterial(
  gpu: TerrainFieldTextures,
  surface: TerrainActiveSurface,
  seaLevel: Node,
  providers: NativeGroundProviders = {},
  sourceMaterial = true,
): {
  material: MeshStandardNodeMaterial;
  sourceMaterial: MeshStandardNodeMaterial | null;
  fallbackMaterial: MeshStandardNodeMaterial;
  dispose: () => void;
} {
  validateNativeMaterialBindings(gpu.store, surface);
  const material = new MeshStandardNodeMaterial();
  const fallbackMaterial = new MeshStandardNodeMaterial();
  const release = () => {
    if (disposed) return;
    disposed = true;
    for (const tex of owned) tex.dispose();
    material.dispose();
    fallbackMaterial.dispose();
  };
  const owned: Texture[] = [];
  let disposed = false;
  try {
    const d = gpu.descriptor,
      count = d.width * d.height;
    const rawHeights = gpu.textures.get(d.heightBinding!.channel)!.image.data as Float32Array;
    const heightShift = d.heightBinding!.offset - Number(seaLevel.value);
    const heights = heightShift === 0 ? rawHeights : Float32Array.from(rawHeights, (h) => h + heightShift);
    const fields: TerrainBakeFields = {
      res: d.width,
      texel: d.spacing,
      origin: d.origin[0],
      heights,
      rock: new Float32Array(count),
      sand: new Uint8Array(count),
      path: new Uint8Array(count),
      gully: new Uint8Array(count),
      seagrass: new Uint8Array(count),
      rubble: new Uint8Array(count),
      scarp: new Uint8Array(count),
    };
    const mapped: Record<
      string,
      keyof Pick<TerrainBakeFields, 'rock' | 'sand' | 'path' | 'gully' | 'seagrass' | 'rubble' | 'scarp'>
    > = {
      'beach-sand': 'sand',
      rock: 'rock',
      grass: 'gully',
      dirt: 'path',
      seagrass: 'seagrass',
      rubble: 'rubble',
    };
    for (const binding of resolveTerrainSurface(d, surface).bindings) {
      const variant = binding.variant;
      for (const [key, input] of Object.entries(binding.inputs)) {
        const field = key === 'scarp' ? 'scarp' : mapped[variant]!;
        const values = gpu.textures.get(input.channel)!.image.data!;
        const output = fields[field]!;
        for (let i = 0; i < count; i++)
          output[i] =
            field === 'rock'
              ? Math.max(0, Math.min(1, values[i]! * input.scale))
              : Math.round(Math.max(0, Math.min(1, values[i]! * input.scale)) * 255);
      }
    }
    // Source bake uses sea-relative heights. Descriptor height offset is applied only to geometry.
    const baked = bakeTerrainMaps(fields);
    const normal = new DataTexture(baked.normal, d.width, d.height, RGBAFormat);
    const splat = new DataTexture(baked.splat, d.width, d.height, RGBAFormat);
    owned.push(normal, splat);
    for (const texture of [normal, splat]) {
      // Source TerrainGPU generates full trilinear mip chains for both data maps.
      texture.magFilter = LinearFilter;
      texture.minFilter = LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      texture.needsUpdate = true;
    }
    const position = t.vec3(t.positionWorld.x, t.positionWorld.y.sub(seaLevel), t.positionWorld.z);
    const uv = t.positionWorld.xz.sub(t.vec2(...d.origin)).div(d.width * d.spacing);
    const nr = t.texture(normal, uv);
    const sp = t.texture(splat, uv),
      xz = nr.rg.mul(2).sub(1);
    fallbackMaterial.colorNode = t.mix(t.vec3(0.12, 0.22, 0.07), t.vec3(0.65, 0.55, 0.32), sp.r);
    fallbackMaterial.normalNode = t.transformNormalToView(
      t.vec3(xz.x, t.sqrt(t.max(t.float(1).sub(t.dot(xz, xz)), 0)), xz.y),
    );
    fallbackMaterial.roughnessNode = t.float(0.9);
    fallbackMaterial.aoNode = nr.a;
    if (!sourceMaterial)
      return { material: fallbackMaterial, sourceMaterial: null, fallbackMaterial, dispose: release };
    const detail = providers.detailTexture ?? createDetailTexture();
    if (!providers.detailTexture) owned.push(detail);
    const graph = createTidewaterGroundGraph({
      detailTexture: detail,
      position,
      cameraPosition: t.vec3(t.cameraPosition.x, t.cameraPosition.y.sub(seaLevel), t.cameraPosition.z),
      normalRock: t.vec4(nr.rg.mul(2).sub(1), nr.ba),
      splat: t.texture(splat, uv),
      ...providers,
      wetFoam: providers.wetFoam?.(position),
    });
    material.colorNode = graph.colorNode;
    material.normalNode = t.transformNormalToView(graph.normalWorldNode);
    material.roughnessNode = graph.roughnessNode;
    material.aoNode = graph.aoNode;
    attachGroundSunModulation(material, graph.meadowWeightNode);
    return { material, sourceMaterial: material, fallbackMaterial, dispose: release };
  } catch (error) {
    release();
    throw error;
  }
}
