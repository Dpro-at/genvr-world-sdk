/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import * as THREE from 'three';
import { Noise2D, type Rng } from './shore-math.js';
import { ReefBatch, type ReefBatchGpu, type ReefKind } from './reef-batch.js';
import { type ReefMaterialGpu, type ReefOceanFFT, type ReefUniformBlock, type ReefMaterialLike } from './reef-materials.js';
import { type NoiseVolumeTextureOptions } from './reef-noise.js';
/** What the reef reads of the terrain (src/world/Terrain.js). */
export interface ReefTerrain {
    heightAt(x: number, z: number): number;
    normalAt(x: number, z: number, out: THREE.Vector3): THREE.Vector3;
    /** meadow mask (0..255) on a res x res grid of 1 m cells from `origin` */
    seagrass?: ArrayLike<number> | null;
    res: number;
    origin: number;
}
/** What the reef passes to FishSchools (src/world/Fish.js, not ported). */
export interface ReefFishOptions {
    parent: THREE.Group;
    terrain: ReefTerrain;
    center: THREE.Vector3;
    radius: number;
    floorAt: (x: number, z: number) => number;
    anchors: [number, number][];
    shoreField: unknown;
}
/** What the reef uses of FishSchools. */
export interface ReefFish {
    update(dt: number, cameraPosition: THREE.Vector3 | null): void;
    cull(camera: THREE.Camera): void;
    mesh: {
        visible: boolean;
    };
    batch: {
        visibleInstances: number;
    };
    spray?: unknown;
    setWhale(whale: unknown): void;
    fishCount: number;
    dispose(): void;
}
export type ReefFishFactory = (o: ReefFishOptions) => ReefFish;
/** The engine's 3D noise texture (only destroy() is used here). */
export interface ReefTextureLike {
    destroy(): void;
}
/** All engine GPU classes the reef uses; `texture` stands for the source's `new Texture( options )` (ReefNoise.js). */
export type ReefGpu = ReefBatchGpu & ReefMaterialGpu & {
    texture(options: NoiseVolumeTextureOptions): ReefTextureLike;
};
export declare const RECORDING_REEF_ALL_GPU: ReefGpu;
export interface ReefOptions {
    scene: {
        add(object: THREE.Object3D): unknown;
    };
    terrain: ReefTerrain;
    shoreField?: unknown;
    /** replaces the source's `new FishSchools( ... )` (default: no fish) */
    fish?: ReefFishFactory | null;
    /** engine GPU classes (default: recording stand-ins) */
    gpu?: ReefGpu;
}
export interface ReefModelDef {
    gen: (rng: Rng, lod: number) => THREE.BufferGeometry;
    variants: number;
    lods?: number;
    shadow?: boolean;
    soft?: boolean;
}
export interface ReefType {
    model: string;
    surface: number;
    scale: [number, number];
    sy: [number, number];
    sxz: [number, number];
    lod: number[];
    align: number;
    sink: number;
    c1: number[];
    c2: number[];
    warp?: number;
    flex?: number;
    solid?: boolean;
    flat?: number;
    warm?: number;
    emerge?: boolean;
    fan?: boolean;
    far?: boolean;
}
export interface ReefLayer {
    mode: string;
    occ: number;
    spacing: number;
    allow: number;
    types: Record<string, number[]>;
}
/** One model variant: first kind, levels, bounding radius / top, shadow proxy kind and height-field stamp. */
export interface ReefModel {
    kind0: number;
    lods: number;
    radius: number;
    top: number;
    proxy: number;
    stamp: THREE.BufferGeometry | null;
}
export interface ReefItem {
    name: string;
    model: ReefModel;
    x: number;
    y: number;
    z: number;
    s: number;
    sx: number;
    sy: number;
    sz: number;
    q: THREE.Quaternion;
    c1: number;
    c2: number;
    seed: number;
    flex: number;
    radius: number;
    range?: number;
}
export interface ReefHabitat {
    f: number;
    depth: number;
    w0: number;
    w1: number;
    w2: number;
    w3: number;
    w4: number;
    u: number;
    v: number;
}
export interface ReefCullData {
    x: Float32Array;
    y: Float32Array;
    z: Float32Array;
    r: Float32Array;
    d0: Float32Array;
    d1: Float32Array;
    d2: Float32Array;
    dmax: Float32Array;
    kind0: Uint16Array;
    lods: Uint8Array;
    proxy: Int16Array;
}
export interface ReefCell {
    x: number;
    z: number;
    ymin: number;
    ymax: number;
    r: number;
    hard: number[] | Uint32Array;
    soft: number[] | Uint32Array;
}
type Which = 'hard' | 'soft';
interface PlaceOptions {
    layer?: number;
    allow?: number;
    onGround?: boolean;
}
interface ReefView {
    position: {
        value: THREE.Vector3;
    };
    range: {
        value: number;
    };
}
declare const BAY: {
    x0: number;
    x1: number;
    z0: number;
    z1: number;
};
declare const MODELS: Record<string, ReefModelDef>;
declare const TYPES: Record<string, ReefType>;
declare const LAYERS: ReefLayer[];
export { MODELS as REEF_MODELS, TYPES as REEF_TYPES, LAYERS as REEF_LAYERS, BAY as REEF_BAY };
export declare class Reef {
    terrain: ReefTerrain;
    center: THREE.Vector3;
    radius: number;
    group: THREE.Group;
    rng: Rng;
    noise: Noise2D;
    noise2: Noise2D;
    fft: ReefOceanFFT | null;
    timings: Record<string, number>;
    gpu: ReefGpu;
    kinds: {
        hard: ReefKind[];
        soft: ReefKind[];
    };
    models: Record<string, ReefModel[]>;
    items: {
        hard: ReefItem[];
        soft: ReefItem[];
    };
    x0: number;
    z0: number;
    x1: number;
    z1: number;
    hx0: number;
    hz0: number;
    hfW: number;
    hfH: number;
    hf: Float32Array;
    occ: Map<number, number[]>[];
    occMax: number[];
    anchors: [number, number][];
    fields: (Float32Array | undefined)[] | null;
    fW: number;
    fH: number;
    skip: {
        W: number;
        H: number;
        c: number;
        d: Float32Array;
    } | null;
    hc: Float32Array | null;
    hcW?: number;
    hcH?: number;
    _hab?: ReefHabitat;
    _stampX?: Float32Array;
    _stampY?: Float32Array;
    _stampZ?: Float32Array;
    counts: Record<string, number>;
    batches: {
        hard: ReefBatch;
        soft: ReefBatch;
    };
    noise3D: ReefTextureLike;
    viewBlock: ReefUniformBlock;
    view: ReefView;
    materials: {
        hard: ReefMaterialLike;
        soft: ReefMaterialLike;
    };
    fadeMaterials: {
        hard: ReefMaterialLike;
        soft: ReefMaterialLike;
    };
    cells: Map<number, ReefCell>;
    hardCull: ReefCullData;
    softCull: ReefCullData;
    cellList: ReefCell[];
    extent: {
        x0: number;
        x1: number;
        z0: number;
        z1: number;
    };
    fish: ReefFish | null;
    camera: THREE.Camera | null;
    _cullPos: THREE.Vector3;
    _cullQuat: THREE.Quaternion;
    _cullFrame: number;
    frame: number;
    constructor({ scene, terrain, shoreField, fish, gpu }: ReefOptions);
    setOcean(fft: ReefOceanFFT | null): void;
    setSpray(spray: unknown): void;
    setWhale(whale: unknown): void;
    buildKinds(): void;
    initFields(): void;
    frameUV(x: number, z: number): [number, number];
    habitat(x: number, z: number, out?: ReefHabitat): ReefHabitat;
    hfIndex(x: number, z: number): number;
    structureAt(x: number, z: number): number;
    groundAt(x: number, z: number): number;
    groundNormal(x: number, z: number, out: THREE.Vector3): THREE.Vector3;
    stamp(geometry: THREE.BufferGeometry, it: ReefItem): void;
    occupied(layer: number, x: number, z: number, r: number, allow: number): boolean;
    occupy(layer: number, x: number, z: number, r: number): void;
    place(name: string, x: number, z: number, rng: Rng, { layer, allow, onGround }?: PlaceOptions): boolean;
    placeFramework(rng: Rng, stats: Record<string, number>): void;
    placeLayers(): void;
    field(slot: number, x: number, z: number): number;
    clusterWeight(name: string, x: number, z: number, hab: ReefHabitat): number;
    buildSkipGrid(): void;
    habitatCached(x: number, z: number, out: ReefHabitat): ReefHabitat;
    skipAt(x: number, z: number): number;
    suits(name: string, hab: {
        depth: number;
    }): boolean;
    placeBay(rng: Rng, stats: Record<string, number>): void;
    placeMeadows(rng: Rng, stats: Record<string, number>): void;
    placeAnchors(): void;
    buildBatches(): void;
    drawDistance(it: ReefItem, which: Which): number;
    buildCells(): void;
    update(dt: number, cameraPosition?: THREE.Vector3 | null): void;
    cull(camera: THREE.Camera): void;
    cullList(ids: ArrayLike<number>, D: ReefCullData, batch: ReefBatch, cx: number, cy: number, cz: number, range: number, visible: boolean): void;
    floorHeightAt(x: number, z: number): number;
    get stats(): {
        instances: {
            hard: number;
            soft: number;
        };
        visible: {
            hard: number;
            soft: number;
        };
        triangles: number;
        shadowTriangles: number;
        drawCalls: number;
        subDraws: number;
        shadowSubDraws: number;
        kinds: {
            hard: number;
            soft: number;
        };
        counts: Record<string, number>;
        timings: Record<string, number>;
        fish: number;
    };
    dispose(): void;
}
