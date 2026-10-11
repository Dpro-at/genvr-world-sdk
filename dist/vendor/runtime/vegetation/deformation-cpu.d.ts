/** CPU adapter of Tidewater4811ba48 VegNodes plant equations. MIT; LICENSE-tidewater.md. */
import { type BufferGeometry, Vector3 } from 'three';
export type Four = readonly [number, number, number, number];
export interface PlantCpuInputs {
    position: Vector3;
    normal: Vector3;
    instancePosition: Four;
    instanceData: Four;
    vegetation: Four;
    material: Four;
    lobe: Four;
    lodRange: readonly [number, number, number];
    camera: Vector3;
    time: number;
    strength: number;
    gust: number;
    windDirection: Vector3;
    windPerpendicular: Vector3;
}
/** Allocation-oriented authoring adapter, not a per-frame CPU animation loop.
 * Inputs follow the GPU contract: position/normal already transformed by instance matrix. */
export declare function deformPlantCpu(i: PlantCpuInputs): {
    position: Vector3;
    normal: Vector3;
    trunkDirection: Vector3;
    trunkHeight: number;
};
/** Bake a declared calm authoring pose for bounds/ghost/fallback. Does not mutate source geometry.
 * Wind strength retains the source calm floor; gust0/time0 and +X wind are explicit defaults.
 * The resulting bounds describe this pose only, not the full dynamic wind envelope. */
export declare function bakePlantPose(source: BufferGeometry, height: number, seed: number, lean?: number, leanAngle?: number): BufferGeometry;
