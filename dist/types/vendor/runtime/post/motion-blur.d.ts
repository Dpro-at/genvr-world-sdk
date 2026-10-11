/** Tidewater 4811ba48, MIT: MotionBlur.js reconstruction filter with exact tile and neighbour reductions. */
import { StorageTexture, type Texture, type PerspectiveCamera, type WebGPURenderer } from 'three/webgpu';
type N = any;
export declare class MotionBlur {
    #private;
    readonly color: Texture;
    readonly depth: Texture;
    readonly velocity: Texture;
    readonly camera: PerspectiveCamera;
    readonly tileMax: StorageTexture;
    readonly neighborMax: StorageTexture;
    readonly shutter: any;
    constructor(color: Texture, depth: Texture, velocity: Texture, camera: PerspectiveCamera);
    resize(w: number, h: number): void;
    beginFrame(): void;
    update(renderer: WebGPURenderer, dt: number): void;
    node(sharp: N, uv: N): N;
    reset(): void;
    dispose(): void;
}
export {};
