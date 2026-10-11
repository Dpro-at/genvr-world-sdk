import { MeshStandardNodeMaterial, type DataArrayTexture, type UniformNode } from 'three/webgpu';
/** Share of rock on a slope (P2-37): none below 35 degrees, all above 45 degrees. */
export declare function rockShare(slopeDeg: number): number;
/** Share of snow at a height on a slope; none with the snow line off (null). */
export declare function snowShare(height: number, line: number | null, slopeDeg: number): number;
/**
 * The texture layers to load for a place's ground palette (slot to material name), each once, in
 * slot order, then the rock and snow of the slope and height rules; empty slots show slot 0.
 */
export declare function groundLayers(palette: readonly (string | undefined)[], rules: {
    rock: string;
    snow: string;
}): {
    names: string[];
    layerOfSlot: (slot: number) => number;
    rockLayer: number;
    snowLayer: number;
};
/**
 * Per-triangle corners for a non-indexed chunk (P2-37): every vertex of a triangle carries the
 * layers of its three corners and a barycentric weight, so three materials blend across it.
 * `order` lists the source vertex of each output vertex (to copy positions and normals).
 */
export declare function triangleCorners(slots: ArrayLike<number>, indices: ArrayLike<number>, layerOf: (slot: number) => number): {
    layers: Float32Array;
    bary: Float32Array;
    order: Uint32Array;
};
/** Uniforms of the realistic ground material that change without rebuilding it. */
export interface GroundRules {
    snowLine: UniformNode<'float', number>;
    snowOn: UniformNode<'float', number>;
    rockOn: UniformNode<'float', number>;
}
/** Largest number of texture layers: 16 palette slots plus rock and snow. */
export declare const MAX_GROUND_LAYERS = 18;
/**
 * The Realistic style's ground material (P2-37). Each triangle blends the three corner materials
 * (weights sharpened by each material's brightness, so gravel and rock show between grass instead
 * of a soft smear); steep slopes turn to the rock layer drawn from three sides (no stretching on
 * cliffs); snow covers ground above the snow line; a slow, large color change hides the repeats.
 */
export declare function realisticGroundMaterial(color: DataArrayTexture, surface: DataArrayTexture, tiles: readonly number[], rockLayer: number, snowLayer: number, proceduralLayers?: readonly boolean[]): {
    material: MeshStandardNodeMaterial;
    rules: GroundRules;
};
/**
 * The ground beyond the place's edge in Realistic places (P2-37): the place's grass (slot 0) laid
 * flat in world space, with the same large color changes as the ground inside.
 */
export declare function realisticOuterMaterial(color: DataArrayTexture, surface: DataArrayTexture, tile: number, layer: number): MeshStandardNodeMaterial;
