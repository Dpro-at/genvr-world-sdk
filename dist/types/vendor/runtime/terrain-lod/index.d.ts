/** Tidewater4811ba48 MIT: Strugar continuous distance-dependent quadtree LOD. */
import { InstancedBufferAttribute, InstancedBufferGeometry, Vector2, Vector3, Vector4, type Camera } from 'three/webgpu';
type N = any;
export interface TerrainLodOptions {
    gridSize?: number;
    leafSize?: number;
    levels?: number;
    rangeFactor?: number;
    morphStartRatio?: number;
    maxInstances?: number;
    minY?: number;
    maxY?: number;
    heightBounds?: ((x0: number, z0: number, x1: number, z1: number) => readonly [number, number]) | null;
    center?: {
        x: number;
        z: number;
        size: number;
    } | null;
}
export interface TerrainLodVertex<T> {
    worldXZ: T;
    spacing: T;
    morphK: T;
    lod: T;
    size: T;
}
export interface TerrainLodCpuVertex {
    worldXZ: readonly [number, number];
    spacing: number;
    morphK: number;
    lod: number;
    size: number;
}
export declare class TerrainLod {
    readonly geometry: InstancedBufferGeometry;
    readonly G: number;
    readonly leafSize: number;
    readonly levels: number;
    readonly maxInstances: number;
    readonly ranges: number[];
    readonly morph: Vector4[];
    readonly uMorph: {
        array: Vector2[];
    };
    readonly uSpacing: {
        array: number[];
    };
    readonly viewPosition: import("three/webgpu").UniformNode<"vec3", Vector3>;
    readonly nodeArray: Float32Array;
    readonly nodeAttr: InstancedBufferAttribute;
    readonly lodCounts: number[];
    count: number;
    overflowCount: number;
    disposed: boolean;
    private readonly minY;
    private readonly maxY;
    private readonly heightBounds;
    private readonly fixedRoot;
    private readonly morphUniform;
    private readonly box;
    private readonly frustum;
    private readonly matrix;
    private readonly cam;
    private readonly order;
    constructor({ gridSize, leafSize, levels, rangeFactor, morphStartRatio, maxInstances, minY, maxY, heightBounds, center, }?: TerrainLodOptions);
    /** Height must be sampled at snappedNode first. Use the view camera for every pass, including shadows. */
    snappedNode(node: N, grid: N): N;
    morphNode(node: N, grid: N, height?: N, view?: N): TerrainLodVertex<N>;
    snapped(node: readonly [number, number, number, number], grid: readonly [number, number]): readonly [number, number];
    morphVertex(node: readonly [number, number, number, number], grid: readonly [number, number], view: Vector3, y0?: number): TerrainLodCpuVertex;
    update(camera: Camera): void;
    private bounds;
    private intersectsSphere;
    private add;
    private select;
    dispose(): void;
}
export {};
