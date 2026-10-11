/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { type StorageBufferFactory, type WgslModule, type WildlifeStorageBuffer } from './kit.js';
import { type WildlifeGlobals } from './context.js';
/** Source engine ComputeKernel options (gpu/Compute.js). */
export interface ComputeKernelOptions {
    label: string;
    modules: WgslModule[];
    bindings: Record<string, {
        storage: WildlifeStorageBuffer;
        access: string;
    }>;
    workgroupSize: [number, number, number];
    code: string;
}
export interface SwashKernel {
    options?: ComputeKernelOptions;
    dispatch(x: number): void;
}
/** Source engine Readback (gpu/Readback.js): request() returns whether a copy was queued. */
export interface SwashReadback {
    onData: ((buf: ArrayBuffer) => void) | null;
    request(buffer: WildlifeStorageBuffer): boolean;
}
export interface SwashProbeGpu {
    storageBuffer: StorageBufferFactory;
    computeKernel(options: ComputeKernelOptions): SwashKernel;
    readback(options: {
        byteLength: number;
        label: string;
    }): SwashReadback;
}
/** Recorder kernel: counts dispatches. */
export declare class RecordedKernel implements SwashKernel {
    options: ComputeKernelOptions;
    dispatches: number[];
    constructor(options: ComputeKernelOptions);
    dispatch(x: number): void;
}
/** Recorder readback: queues every request; `deliver( data )` plays the GPU's answer. */
export declare class RecordedReadback implements SwashReadback {
    onData: ((buf: ArrayBuffer) => void) | null;
    requests: number;
    byteLength: number;
    constructor(options: {
        byteLength: number;
        label: string;
    });
    request(): boolean;
    deliver(data: Float32Array): void;
}
export declare const recordedSwashGpu: () => SwashProbeGpu;
/** Shore waves (ShoreWaves.js): its WGSL module and the swash period uniform. */
export interface SwashShore {
    module: WgslModule;
    period: {
        value: number;
    };
}
export interface SwashTerrainGpu {
    module: WgslModule;
}
/** Result of SwashProbe.get. */
export interface SwashSample {
    runup: number;
    inland: number;
    speed: number;
    tau: number;
    x: number;
    z: number;
    age: number;
}
export declare class SwashProbe {
    renderer: unknown;
    shore: SwashShore;
    n: number;
    interval: number;
    _frame: number;
    inputs: Float32Array;
    inputBuffer: WildlifeStorageBuffer;
    results: WildlifeStorageBuffer;
    readback: SwashReadback;
    cpu: Float32Array;
    valid: boolean;
    issued: Float32Array;
    resultTime: number;
    _pending: boolean;
    _inputsCopy: Float32Array;
    active: boolean;
    kernel: SwashKernel;
    G: WildlifeGlobals;
    _issuedTime: number;
    constructor(renderer: unknown, { shore, terrainGPU, count, interval, gpu, globals }: {
        shore: SwashShore;
        terrainGPU: SwashTerrainGpu;
        count?: number;
        interval?: number;
        gpu?: SwashProbeGpu;
        globals?: WildlifeGlobals;
    });
    set(i: number, x: number, z: number): void;
    clear(i: number): void;
    update(): void;
    get(i: number, out: SwashSample): SwashSample | null;
}
