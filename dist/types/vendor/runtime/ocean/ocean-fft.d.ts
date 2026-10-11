import { type Node, StorageArrayTexture, StorageBufferAttribute, type WebGPURenderer } from 'three/webgpu';
export interface OceanFFTOptions {
    /** Cascades to run (Tidewater: 4; High drops the 7.1 m one). */
    cascades?: number;
    sizes?: readonly number[];
    choppiness?: number;
    /** A ready spectrum (tests); by default Tidewater's sea from `oceanSpectrum`. */
    spectrum?: {
        h0: Float32Array;
        waves: Float32Array;
    };
    /** Also copy the outputs into storage buffers that can be read back (the browser test only). */
    readback?: boolean;
}
/** The FFT ocean: call `update` once per frame, sample `displacement` / `derivatives` in materials. */
export declare class OceanFFT {
    #private;
    readonly cascades: number;
    readonly sizes: readonly number[];
    /** (lambda Dx, Dy, lambda Dz, foam) per cascade layer, mipmapped, repeat-wrapped. */
    readonly displacement: StorageArrayTexture;
    /** (dDy/dx, dDy/dz, lambda dDx/dx, lambda dDz/dz) per cascade layer. */
    readonly derivatives: StorageArrayTexture;
    /** Seconds of wave time (the room clock via `setTime`, plan task 3). */
    readonly time: import("three/webgpu").UniformNode<"float", number>;
    readonly dt: import("three/webgpu").UniformNode<"float", number>;
    readonly choppiness: import("three/webgpu").UniformNode<"float", number>;
    /** Foam starts where a cascade compresses the surface below this Jacobian (`OceanFFT.js` L103-108). */
    readonly foamBias: import("three/webgpu").UniformNode<"float", number>;
    readonly foamGain: import("three/webgpu").UniformNode<"float", number>;
    readonly foamDecay: import("three/webgpu").UniformNode<"float", number>;
    readonly foamAdd: import("three/webgpu").UniformNode<"float", number>;
    /** Readback buffers (only with `readback`): N*N*C vec4 each. */
    readonly readbackDisplacement: StorageBufferAttribute | null;
    readonly readbackDerivatives: StorageBufferAttribute | null;
    constructor(options?: OceanFFTOptions);
    /** Advances the waves by `dt` seconds and runs the two passes. */
    update(renderer: WebGPURenderer, dt: number): void;
    /**
     * Puts the waves at an absolute wave time (the room clock, `seaClock`) and runs the two passes. The foam decays
     * by the time since the last call (at most 0.1 s; one frame's worth when the clock wrapped).
     */
    setTime(renderer: WebGPURenderer, time: number): void;
    /** Runs the two passes at the current `time` (no time step). */
    dispatch(renderer: WebGPURenderer): void;
    /** The tile size of a cascade (m). */
    size(cascade: number): number;
    /**
     * Displacement of one cascade at world xz, at a mip level (`oceanSampleDisplacement` per layer). Returns
     * (lambda Dx, Dy, lambda Dz, foam).
     */
    sampleDisplacement(cascade: number, xz: Node<'vec2'>, level: Node<'float'> | number): Node<'vec4'>;
    /** Derivatives of one cascade at world xz, with the hardware's own mip choice (fragment stage). */
    sampleDerivatives(cascade: number, xz: Node<'vec2'>, level?: Node<'float'> | number): Node<'vec4'>;
    /** A TSL vec3 summing every cascade's displacement (with optional per-cascade weights). */
    displacementSum(xz: Node<'vec2'>, level?: Node<'float'> | number, weights?: ReadonlyArray<Node<'float'> | number>): Node<'vec3'>;
    dispose(): void;
}
