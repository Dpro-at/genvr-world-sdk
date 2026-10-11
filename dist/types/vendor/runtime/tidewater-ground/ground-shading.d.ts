/** Tidewater4811ba48 MIT: reusable provider-driven source terrain material. */
import { type Texture } from 'three/webgpu';
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
export declare function createTidewaterGroundGraph(input: TidewaterGroundInputs): {
    colorNode: N;
    normalWorldNode: N;
    roughnessNode: N;
    aoNode: N;
    meadowWeightNode: N;
};
export {};
