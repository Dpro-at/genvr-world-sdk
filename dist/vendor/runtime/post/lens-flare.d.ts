/** Tidewater 4811ba48 MIT: LensFlare.js seven-blade ghosts, dispersive halo and starburst. */
import { Vector3, type Texture, type PerspectiveCamera, type WebGPURenderer } from 'three/webgpu';
type N = any;
export declare class LensFlare {
    #private;
    readonly depth: Texture;
    readonly camera: PerspectiveCamera;
    readonly strength: any;
    readonly sunUV: any;
    constructor(depth: Texture, camera: PerspectiveCamera, cloudTransmittance?: (direction: N) => N);
    resize(w: number, h: number): void;
    update(renderer: WebGPURenderer, dt: number, sun: Vector3, aboveWater?: boolean, sunColor?: Vector3): void;
    node(uv: N): N;
    reset(): void;
    dispose(): void;
}
export {};
