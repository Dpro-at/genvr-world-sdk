/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { BufferGeometry, Mesh, MeshPhysicalNodeMaterial, StorageBufferAttribute, type Material, type Object3D } from 'three/webgpu';
import { ReefBatch, type ReefStorageBufferOptions } from '../tidewater-shore/reef-batch.js';
import type { MarineBatchClass, WgslMaterial } from './marine-shared.js';
import { type Whale } from './whale.js';
type N = any;
/** The engine's `#if` / `#ifdef` / `#elif` / `#else` / `#endif` preprocessor (src/engine/gpu/Shader.js). */
export declare function preprocessWgsl(code: string, defines?: Record<string, unknown>): string;
/** A ReefBatch storage buffer on three (vec4f records or u32 lists) with its read-only storage node. */
export declare class MarineStorageBuffer {
    readonly options: ReefStorageBufferOptions;
    readonly attribute: StorageBufferAttribute;
    readonly node: N;
    writes: number;
    constructor(options: ReefStorageBufferOptions);
    /** Same contract as the engine StorageBuffer: upload `data` from element 0. */
    write(data: ArrayBufferView): void;
    destroy(): void;
}
/** The batch's storage nodes the vertex graph reads (names as the source bindings). */
export interface MarineBatchNodes {
    instances: N;
    list: N;
    base: N;
    fadeList: N | null;
    fadeBase: N | null;
}
/** The material record options the fish / whale shading reads. */
export interface MarineMaterialOptions {
    name: string;
    roughness: number;
    metalness: number;
    vertex: string;
    surface: string;
    shadow?: string;
    varyings: Record<string, string>;
    attributes: Record<string, string>;
    defines?: Record<string, unknown>;
    modules?: {
        name?: string;
        code?: string;
        deps?: unknown[];
        uniforms?: unknown;
        uniformName?: string;
    }[];
    uniforms?: Record<string, [string, unknown]>;
}
/** The skin table as the module-scope `fishSkin` the fish module reads (float32 values of the uniform block). */
export declare function fishSkinWgsl(): string;
/**
 * The ReefBatch module with its record and fade lookups bound: the record and the raw fade-list entry of the
 * vertex come from the node graph (which reads the batch's own List / Base storage exactly as
 * `<P>RecordIndex` does); `<P>FadeEntry` decodes the entry with the source's own expression.
 */
export declare function boundBatchWgsl(batchCode: string, prefix: string): string;
export declare const FISH_VERTEX_INPUTS: readonly ["twPosition", "twNormal", "twAData", "twAKind", "twR0", "twR1", "twR2", "twR3", "twFadeEntry", "twOut"];
export declare const FISH_SURFACE_INPUTS: readonly ["twP", "twN", "twV", "twPixel", "twTime", "twFrameIndex", "twView", "twLocal", "twData", "twInfo", "twFlags", "twFade"];
export declare const FISH_SHADOW_INPUTS: readonly ["twPixel", "twTime", "twData"];
export declare const WHALE_VERTEX_INPUTS: readonly ["twPosition", "twNormal", "twUv", "twRig", "twWhalePos", "twWhaleRot", "twWhaleFlip", "whaleHeightTex", "smpLinearClamp"];
export declare const WHALE_SURFACE_INPUTS: readonly ["twP", "twN", "twV", "twUv", "twWater", "twWet", "whaleAlbedoTex", "whaleHeightTex", "smpAnisoClamp"];
/**
 * The generated WGSL of one material. `vertex` is standalone; `surface` / `shadow` hold only their entry (the
 * first function) and take the shared declarations from `library` (pass it as the wgslFn include).
 */
export interface MarineShadingWgsl {
    vertex: string;
    surface: string;
    shadow: string | null;
    library: string;
}
/** The generated WGSL of one fish material (entry first in every string, helpers namespaced). */
export declare function fishShadingWgsl(record: WgslMaterial, batch: {
    prefix: string;
    module: {
        code?: string;
    };
}): MarineShadingWgsl;
/** The engine defines of the whale's main colour pass (the record's defines; PASS_DEPTH off). */
export declare const whaleDefines: (record: WgslMaterial) => Record<string, unknown>;
/** The generated WGSL of the whale material (vertex: rig + relief; surface: baked skin). */
export declare function whaleShadingWgsl(record: WgslMaterial, defines?: Record<string, unknown>): MarineShadingWgsl;
/** The shared fragment declarations of a material as one wgsl code node (the include of its fragment entries). */
export declare function marineLibraryNode(wgsl: MarineShadingWgsl): N;
/** Named vertex outputs (world transform from the engine's useWorld path) and the varyings. */
export interface MarineVertex {
    position: N;
    normal: N;
    previous: N;
    varyings: Record<string, N>;
}
/** Named surface outputs (the packing of SURFACE_RETURN). */
export interface MarineSurface {
    albedo: N;
    alpha: N;
    normal: N;
    roughness: N;
    translucency: N;
    metalness: N;
    ao: N;
    specularIntensity: N;
    clearcoat: N;
    clearcoatRoughness: N;
}
export declare function marineSurfaceSlots(m: N): MarineSurface;
/** Per-vertex inputs of the fish vertex graph (material: geometry attributes and the draw's instance index). */
export interface FishVertexInputs {
    instance: N;
    position: N;
    normal: N;
    aData: N;
    aKind: N;
}
/**
 * Fish vertex outputs for one (instance, vertex): the record found as the batch module finds it
 * (`<P>List[ <P>Base[ kind ] + instance ]`; the fade channel: `<P>FadeList[ <P>FadeBase[ kind ] + instance ]`,
 * low 24 bits = record index) and its four vec4 (`<P>Instances[ index * 4 + k ]`).
 */
export declare function fishVertexNodes(wgsl: string, nodes: MarineBatchNodes, a: FishVertexInputs, fade: boolean): MarineVertex;
export interface FishSurfaceInputs {
    P: N;
    N: N;
    V: N;
    pixel: N;
    time: N;
    frameIndex: N;
    view: N;
    local: N;
    data: N;
    info: N;
    flags: N;
    fade: N;
}
export declare function fishSurfaceNodes(wgsl: MarineShadingWgsl, a: FishSurfaceInputs): MarineSurface;
export declare function fishShadowNode(wgsl: MarineShadingWgsl, a: {
    pixel: N;
    time: N;
    data: N;
}): N;
export interface WhaleVertexInputs {
    position: N;
    normal: N;
    uv: N;
    rig: N;
    /** uniformArray nodes of the rig (whale.uPos / uRot / uFlip arrays). */
    pos: N;
    rot: N;
    flip: N;
    heightTexture: N;
}
export declare function whaleVertexNodes(wgsl: string, a: WhaleVertexInputs): MarineVertex;
export interface WhaleSurfaceInputs {
    P: N;
    N: N;
    V: N;
    uv: N;
    water: N;
    wet: N;
    albedoTexture: N;
    heightTexture: N;
}
export declare function whaleSurfaceNodes(wgsl: MarineShadingWgsl, a: WhaleSurfaceInputs): MarineSurface;
/** Frame inputs (the source engine's frame uniforms). Missing ones are owned by MarineShading. */
export interface MarineShadingBindings {
    /** Simulation time in seconds (frame.time): the props' fin dither. */
    time?: N;
    /** frame.frameIndex (u32): LOD cross-fade dither phase. Default 0 (static; no TAA in Genvr). */
    frameIndex?: N;
    /** Sun colour times intensity: multiplies s.translucency (added as emissive). Default white. */
    sunColor?: N;
    /** Main camera position (frame.cameraPos, in.V). Default: three's cameraPosition. */
    cameraPosition?: N;
    /** World-to-view matrix (frame.view: the scale footprint of the fish skin). Default: three's cameraViewMatrix. */
    view?: N;
}
/** What each material keeps for inspection and tests (the named outputs it was wired from). */
export interface MarineMaterialGraph {
    options: MarineMaterialOptions;
    wgsl: MarineShadingWgsl;
    vertex: MarineVertex;
    surface: MarineSurface;
    shadow: N | null;
}
/** One drawable kind of a batch channel (per-kind geometry over the merged buffers). */
export interface MarineKindMesh extends Mesh {
    userData: {
        kind: number;
        channel: 'main' | 'fade';
        shadowPass: boolean;
    };
}
/** Render order of the driver meshes: before every kind mesh, so the cull in its onBeforeRender comes first. */
export declare const MARINE_DRIVER_ORDER = -1000000000;
/** A ReefBatch whose storage, records and meshes are three's (see the file comment). */
export interface MarineShadingBatch extends ReefBatch {
    readonly shading: MarineShading;
    readonly nodes: MarineBatchNodes;
    readonly kindGeometries: BufferGeometry[];
    readonly kindMeshes: {
        main: MarineKindMesh[];
        fade: MarineKindMesh[];
    };
}
/**
 * The source fish and whale materials as native three.js WebGPU node materials. Fish: pass `Batch` to
 * setMarineBatch (or FishSchools' `Batch` option) before building FishSchools / FishProps; the batch builds
 * the native materials from the source records itself. Whale: `attachWhale(whale)` after `whale.load()`.
 */
export declare class MarineShading {
    #private;
    readonly time: N;
    readonly frameIndex: N;
    readonly sunColor: N;
    readonly cameraPosition: N;
    readonly view: N;
    readonly materials: Material[];
    /** ReefBatch class for the fish batches (setMarineBatch( shading.Batch )). */
    readonly Batch: MarineBatchClass;
    constructor(bindings?: MarineShadingBindings);
    /** The driver mesh of one batch channel and its per-kind meshes (children) with the native material. */
    drive(batch: MarineShadingBatch, record: WgslMaterial, channel: 'main' | 'fade', castShadow: boolean, receiveShadow: boolean): Mesh<BufferGeometry, Material>;
    /** The native material of a fish material record (Fish, FishFade, FishProps, FishPropsFade). */
    fishMaterial(record: WgslMaterial, batch: MarineShadingBatch): MeshPhysicalNodeMaterial;
    /**
     * The whale's native material (rig vertex stage over whale.uPos / uRot / uFlip, baked skin); replaces the
     * stand-in on every level of detail. Call after `whale.load()`.
     */
    attachWhale(whale: Whale): MeshPhysicalNodeMaterial;
    /** Advances the owned clock (when no `time` binding was given). */
    update(dt: number): void;
    dispose(): void;
}
/** Mesh helpers for tests and owners: every kind mesh of a batch built by MarineShading.Batch. */
export declare function marineKindMeshes(o: Object3D): MarineKindMesh[];
export {};
