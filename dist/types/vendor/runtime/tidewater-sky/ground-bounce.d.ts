import { StorageTexture, Vector2, type MeshStandardNodeMaterial, type WebGPURenderer } from 'three/webgpu';
type Node = any;
/** Compose additive material hooks and restore independently in any disposal order. */
export declare function attachMaterialLighting(material: MeshStandardNodeMaterial, owner: object, makeNode: () => Node): () => void;
export declare function bounceAlbedo(height: number, normal: readonly number[], rock: number, splat: readonly number[], seaLevel: number, extinction: readonly number[]): number[];
export declare function reflectedGround(albedo: readonly number[], normal: readonly number[], sun: readonly number[], visibility?: number): number[];
export declare function bounceIrradiance(sample: readonly number[], height: number, normal: readonly number[], sun: readonly number[], sunColor: readonly number[], seaLevel: number, cloud?: number, strength?: number): number[];
/** Source coarse sand/grass/forest/rock palette including sea-column attenuation. */
export declare function bounceAlbedoNode(height: Node, normal: Node, rock: Node, splat: Node, seaLevel: Node, waterExtinction?: Node): Node;
export interface GroundBounceOptions {
    /** Node callbacks sample the current terrain; height includes actual displacement. */
    heightNode: (xz: Node, lod?: Node) => Node;
    normalNode: (xz: Node) => Node;
    albedoNode: (xz: Node) => Node;
    groundShadowNode?: (position: Node) => Node;
    cloudShadowNode?: (xz: Node) => Node;
    sunDirection: Node;
    sunColor: Node;
    seaLevel: Node;
    origin?: Vector2;
    size?: number;
    resolution?: number;
}
export declare class GroundBounce {
    #private;
    readonly raw: StorageTexture;
    readonly map: StorageTexture;
    readonly shadowMap: StorageTexture;
    readonly strength: any;
    readonly ready: any;
    readonly origin: Node;
    readonly size: Node;
    constructor(options: GroundBounceOptions);
    invalidate(): void;
    /** AirHaze.hazeTerrainSun: one filtered fetch of the cached terrain occluder field. */
    heightfieldVisibilityNode(position: Node): Node;
    update(renderer: WebGPURenderer, force?: boolean): boolean;
    irradianceNode(position?: Node, normal?: Node): Node;
    attach(material: MeshStandardNodeMaterial): void;
    detach(material: MeshStandardNodeMaterial): void;
    dispose(): void;
}
export {};
