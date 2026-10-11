/** Tidewater 4811ba48 (MIT): source TAAU resolve with camera-only fallback velocities. */
import { StorageTexture, type Texture, type PerspectiveCamera, type WebGPURenderer } from 'three/webgpu';
type N = any;
export declare class TemporalUpscale {
    #private;
    readonly beauty: Texture;
    readonly depth: Texture;
    readonly camera: PerspectiveCamera;
    readonly waterMask?: Texture | undefined;
    readonly externalVelocity?: Texture | undefined;
    readonly history: StorageTexture[][];
    readonly texture: StorageTexture;
    readonly velocityTexture: StorageTexture;
    readonly previousDepth: StorageTexture;
    jitterPhaseOverride: number;
    jitterScale: number;
    jitterMoving: number;
    readonly settings: Record<string, N>;
    constructor(beauty: Texture, depth: Texture, camera: PerspectiveCamera, waterMask?: Texture | undefined, externalVelocity?: Texture | undefined);
    /** Bind previous-frame GPU auto exposure before the first update/compile. */
    setExposureNode(node: N): void;
    resize(w: number, h: number): void;
    reset(): void;
    beginFrame(): void;
    update(renderer: WebGPURenderer, _dt: number, exposure?: number): void;
    endFrame(): void;
    dispose(): void;
}
export {};
