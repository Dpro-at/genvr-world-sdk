/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { BufferGeometry, Mesh, type Material } from 'three';
/** StorageBuffer options as the source passes them. */
export interface ReefStorageBufferOptions {
    label: string;
    count: number;
    type: string;
    usage?: string[];
}
/** The part of the engine StorageBuffer the reef uses. */
export interface ReefStorageBuffer {
    write(data: ArrayBufferView): void;
    destroy(): void;
}
export interface ReefBinding {
    storage?: ReefStorageBuffer;
    uniform?: unknown;
    access?: string;
}
/** ShaderModule options as the source passes them (kept as data). */
export interface ReefShaderModuleOptions {
    name: string;
    deps?: ReefShaderModuleLike[];
    bindings?: Record<string, ReefBinding>;
    code: string;
}
export interface ReefShaderModuleLike {
    name: string;
    code?: string;
}
export interface ReefBatchGpu {
    StorageBuffer: new (o: ReefStorageBufferOptions) => ReefStorageBuffer;
    ShaderModule: new (o: ReefShaderModuleOptions) => ReefShaderModuleLike;
}
/** Records the buffer options and the last data written (a copy) and counts writes. */
export declare class RecordingStorageBuffer implements ReefStorageBuffer {
    label: string;
    count: number;
    type: string;
    usage: string[] | undefined;
    writes: number;
    last: number[] | null;
    destroyed: boolean;
    constructor(o: ReefStorageBufferOptions);
    write(data: ArrayBufferView): void;
    destroy(): void;
}
/** Keeps the ShaderModule options as data. */
export declare class RecordingShaderModule implements ReefShaderModuleLike {
    name: string;
    deps: ReefShaderModuleLike[];
    bindings: Record<string, ReefBinding>;
    code: string;
    constructor(o: ReefShaderModuleOptions);
}
export declare const RECORDING_REEF_GPU: ReefBatchGpu;
/** One model at one level of detail (the source's `kinds` entries; triangles / vertices are set by the batch). */
export interface ReefKind {
    geometry: BufferGeometry;
    type?: string;
    lod?: number;
    shadow?: boolean;
    shadowOnly?: boolean;
    triangles?: number;
    vertices?: number;
}
/** The engine geometry's indirect draw description (buffer + byte offsets of the commands to draw). */
export interface ReefIndirect {
    buffer: ReefStorageBuffer;
    offsets: number[];
}
export type ReefBatchGeometry = BufferGeometry;
export declare const indirectOf: (g: BufferGeometry) => ReefIndirect;
export interface ReefBatchOptions {
    maxInstances: number;
    dynamic?: boolean;
    fade?: boolean;
}
export declare function prefixOf(name: string): string;
export declare class ReefBatch {
    name: string;
    kinds: ReefKind[];
    maxInstances: number;
    dynamic: boolean;
    prefix: string;
    firstIndex: Uint32Array;
    indexCount: Uint32Array;
    baseVertex: Uint32Array;
    vertexCount: number;
    data: Float32Array;
    instanceBuffer: ReefStorageBuffer;
    dataAttr: {
        needsUpdate: boolean;
    };
    list: Uint32Array;
    listBuffer: ReefStorageBuffer;
    baseArray: Uint32Array;
    baseBuffer: ReefStorageBuffer;
    commands: Uint32Array;
    indirectBuffer: ReefStorageBuffer;
    offsetPool: number[][][];
    mainOffsets: number[];
    shadowOffsets: number[];
    geometry: ReefBatchGeometry;
    pairKind: Uint16Array;
    pairId: Uint32Array;
    pairs: number;
    counts: Uint32Array;
    cursor: Uint32Array;
    visibleInstances: number;
    visibleTriangles: number;
    shadowTriangles: number;
    mesh: Mesh | null;
    fadeMesh: Mesh | null;
    fadeOffsets: number[];
    fadeInstances: number;
    fadeList?: Uint32Array;
    fadeListBuffer?: ReefStorageBuffer;
    fadeBaseArray?: Uint32Array;
    fadeBaseBuffer?: ReefStorageBuffer;
    fadeCommands?: Uint32Array;
    fadeIndirectBuffer?: ReefStorageBuffer;
    fadeGeometry?: ReefBatchGeometry;
    fadeKind?: Uint16Array;
    fadeVal?: Uint32Array;
    fadePairs?: number;
    fadeCounts?: Uint32Array;
    fadeCursor?: Uint32Array;
    fadePool?: number[][];
    module: ReefShaderModuleLike;
    constructor(name: string, kinds: ReefKind[], { maxInstances, dynamic, fade }: ReefBatchOptions, gpu?: ReefBatchGpu);
    fadeEntry(): string;
    addFade(kind: number, id: number, fade: number, outgoing: boolean): void;
    createFadeMesh(material: unknown): Mesh<ReefBatchGeometry, Material<import("three").MaterialEventMap>, import("three").Object3DEventMap>;
    recordIndex(): string;
    record(index: string): string[];
    createMesh(material: unknown, { castShadow, receiveShadow }?: {
        castShadow?: boolean;
        receiveShadow?: boolean;
    }): Mesh<ReefBatchGeometry, Material<import("three").MaterialEventMap>, import("three").Object3DEventMap>;
    upload(): void;
    begin(): void;
    add(kind: number, id: number): void;
    offsets(which: number, n: number): number[];
    commit(): void;
    commitFade(): void;
    dispose(): void;
}
