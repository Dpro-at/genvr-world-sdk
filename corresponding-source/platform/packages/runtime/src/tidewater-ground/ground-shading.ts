/** Tidewater4811ba48 MIT: reusable provider-driven source terrain material. */
import { TSL, type Texture } from 'three/webgpu';
import { GROUND_WGSL } from './ground-math.js';
/* eslint-disable @typescript-eslint/no-explicit-any -- native TSL graph interface */
type N = any;
export interface GroundLayerWeights {
  beachSand?: N;
  seabedSand?: N;
  rock?: N;
  grass?: N;
  dirt?: N;
  rubble?: N;
  /** Source third splat channel: seabed vegetation, or gully on land. */
  seagrass?: N;
}
export interface TidewaterGroundInputs {
  detailTexture: Texture;
  /** World coordinates with sea level subtracted from Y. Camera must use same coordinates. */
  position: N;
  /** Source encoding: normal X/Z, rock exposure, baked horizon AO. */
  normalRock: N;
  /** Source encoding: sand, path, gully/seagrass, scarp/rubble. */
  splat: N;
  cameraPosition: N;
  wetFoam?: N;
  windDirection?: N;
  windSpeed?: N;
  gustOffset?: N;
  swellDirection?: N;
  reefWeight?: N;
  wetDarken?: N;
  /** Optional smoothly interpolated paint weights. One graph, preserving source height zonation. */
  layerWeights?: GroundLayerWeights;
}
export function createTidewaterGroundGraph(input: TidewaterGroundInputs): {
  colorNode: N;
  normalWorldNode: N;
  roughnessNode: N;
  aoNode: N;
  meadowWeightNode: N;
} {
  const t = TSL as N;
  const detail = t.texture(input.detailTexture);
  const f = t.wgslFn(GROUND_WGSL);
  const weights = input.layerWeights;
  let nr = input.normalRock,
    sp = input.splat;
  if (weights) {
    // Paint drives the source masks, rather than evaluating one shader per material.
    const total = t.max(
      t.add(
        weights.beachSand ?? 0,
        weights.seabedSand ?? 0,
        weights.rock ?? 0,
        weights.grass ?? 0,
        weights.dirt ?? 0,
        weights.rubble ?? 0,
        weights.seagrass ?? 0,
      ),
      1e-6,
    );
    nr = t.vec4(nr.xy, t.clamp(t.div(weights.rock ?? 0, total), 0, 1), nr.w);
    sp = t.vec4(
      t.clamp(t.div(t.add(weights.beachSand ?? 0, weights.seabedSand ?? 0), total), 0, 1),
      t.clamp(t.div(weights.dirt ?? 0, total), 0, 1),
      weights.seagrass === undefined ? sp.z : t.clamp(t.div(weights.seagrass, total), 0, 1),
      t.clamp(t.div(weights.rubble ?? 0, total), 0, 1),
    );
  }
  const surface = f({
    position: input.position,
    normalRock: nr,
    splat: sp,
    cameraPosition: input.cameraPosition,
    wetFoam: input.wetFoam ?? t.vec2(t.smoothstep(0.5, 0, input.position.y), 0),
    windDirection: input.windDirection ?? t.vec2(0, -1),
    windSpeed: input.windSpeed ?? t.float(0),
    gustOffset: input.gustOffset ?? t.vec2(0),
    swellDirection: input.swellDirection ?? t.vec2(-0.11914522, -0.99287684),
    reefWeight: input.reefWeight ?? t.float(0),
    wetDarken: input.wetDarken ?? t.float(0.58),
    terrainDetailTex: detail,
    smpAniso4Repeat: t.sampler(detail),
  });
  // Accessing the source struct preserves a single common result across output channels.
  return {
    colorNode: surface.element(0),
    normalWorldNode: surface.element(1),
    roughnessNode: surface.element(2).x,
    aoNode: surface.element(2).y,
    meadowWeightNode: surface.element(2).z,
  };
}
