/** Tidewater4811ba48, ©2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import * as THREE from 'three';
export interface VegetationRecord {
    x: number;
    y: number;
    z: number;
    s: number;
    yaw: number;
    seed: number;
    sy?: number;
    la?: number;
    l?: number;
    H?: number;
    qr?: number;
    msx?: number;
    msy?: number;
    msz?: number;
}
export interface VegetationPart {
    geometry: THREE.BufferGeometry;
    material: THREE.Material;
    castShadow?: boolean;
    name?: string;
}
export interface VegetationOptions {
    near?: VegetationPart[] | null;
    far?: {
        parts: VegetationPart[];
        fade: readonly [number, number];
    } | null;
    nearRange?: number;
    fade?: readonly [number, number] | null;
    margin?: number;
    refreshDistance?: number;
    farExcludeNear?: boolean;
    sortNear?: boolean;
    sortFar?: boolean;
    farRefresh?: number;
}
export declare class VegInstances {
    readonly count: number;
    readonly px: Float32Array;
    readonly py: Float32Array;
    readonly pz: Float32Array;
    readonly matrices: Float32Array;
    readonly qr2: Float32Array;
    readonly iPos: Float32Array;
    readonly iDat: Float32Array;
    readonly cellSize: number;
    readonly cells: Map<number, Int32Array>;
    constructor(records: readonly VegetationRecord[], cellSize?: number);
    _key(i: number, j: number): number;
    queryNear(x: number, z: number, radius: number, out: Int32Array): number;
}
export declare class LodLevel {
    readonly capacity: number;
    readonly instanceMatrix: THREE.InstancedBufferAttribute;
    readonly iBuffer: THREE.InstancedInterleavedBuffer;
    readonly iPos: THREE.InterleavedBufferAttribute;
    readonly iDat: THREE.InterleavedBufferAttribute;
    readonly lodRange: THREE.Vector3;
    readonly meshes: THREE.InstancedMesh[];
    count: number;
    trianglesPerInstance: number;
    constructor(parts: readonly VegetationPart[], capacity: number, lodRange: THREE.Vector3);
    setDynamic(): void;
    fill(inst: VegInstances, list?: Int32Array | null, n?: number, matrices?: boolean): void;
    get triangles(): number;
}
export declare class VegType {
    readonly name: string;
    readonly sortNear: boolean;
    readonly sortFar: boolean;
    readonly farRefresh: number;
    farX: number;
    farZ: number;
    readonly inst: VegInstances;
    readonly nearRange: number;
    readonly margin: number;
    readonly refreshDistance: number;
    lastX: number;
    lastY: number;
    lastZ: number;
    readonly levels: LodLevel[];
    readonly queryRadius: number;
    nearIds: Int32Array;
    farIds: Int32Array;
    near?: LodLevel;
    far?: LodLevel;
    farExcludeNear: boolean;
    private _bucket?;
    private _bstart?;
    private _sortKey?;
    constructor(name: string, records: readonly VegetationRecord[], { near, far, nearRange, fade, margin, refreshDistance, farExcludeNear, sortNear, sortFar, farRefresh }?: VegetationOptions);
    get meshes(): THREE.InstancedMesh<THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>, THREE.Material<THREE.MaterialEventMap> | THREE.Material<THREE.MaterialEventMap>[], THREE.Object3DEventMap>[];
    overdue(camPos: THREE.Vector3): number;
    _sortFar(camPos: THREE.Vector3): void;
    update(camPos: THREE.Vector3, force?: boolean): boolean;
}
