/** Tidewater PostFX.js 394-456, pinned4811ba48 MIT: centre-weighted log-luminance reduction. */
import { StorageBufferAttribute, type Texture, type WebGPURenderer } from 'three/webgpu';
type Node = any;
export declare class TidewaterExposure {
    #private;
    readonly input: Texture;
    readonly buffer: StorageBufferAttribute;
    readonly node: Node;
    readonly params: {
        enabled: any;
        refLum: any;
        min: any;
        max: any;
        up: any;
        down: any;
    };
    readonly dt: any;
    readonly night: any;
    constructor(input: Texture);
    update(renderer: WebGPURenderer, dt: number, night?: number): void;
    reset(): void;
    dispose(): void;
}
export {};
