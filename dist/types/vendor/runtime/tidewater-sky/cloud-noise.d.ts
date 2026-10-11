import { Storage3DTexture, StorageTexture, type WebGPURenderer } from 'three/webgpu';
export declare class CloudNoise {
    #private;
    readonly noiseTexture: Storage3DTexture;
    readonly weatherTexture: StorageTexture;
    readonly boundsTexture: StorageTexture;
    readonly blueTexture: StorageTexture;
    /** Graph setup is synchronous; update(renderer) prepares GPU resources before sampling. */
    readonly ready: Promise<void>;
    isReady: boolean;
    constructor();
    update(renderer: WebGPURenderer): Promise<void>;
    dispose(): void;
}
