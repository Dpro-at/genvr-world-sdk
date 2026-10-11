/** Tidewater AirHaze.js, MIT, DRG Software Solutions LLC, 4811ba48 (LICENSE-tidewater.md).
 * Source16-step shadow march, temporal reprojection, depth-aware upsample, and 3x8 radial god rays.
 * Camera reconstruction adapts reversed-Z source to ordinary Three/WebGPU depth. */
import { StorageTexture, Matrix4, type Texture, type Camera, type WebGPURenderer } from 'three/webgpu';
type Node = any;
export interface AirHazeOptions {
    inputTexture: Texture;
    depthTexture: Texture;
    camera: Camera;
    sunDirectionNode: Node;
    sunColorNode: Node;
    seaLevelNode: Node;
    skyLuminanceNode: (direction: Node) => Node;
    skyIrradianceNode: Node;
    shadowNode?: (position: Node) => Node;
    terrainShadowNode?: (position: Node) => Node;
    cloudShadowNode?: (xz: Node) => Node;
    /** Cloud alpha is transmittance, as in source cloudsSampleView().a. */
    cloudViewNode?: (direction: Node) => Node;
    mediumTexture?: Texture;
    underwaterNode?: Node;
    /** Source haze rays and history use the pre-jitter camera; root copies this before TAA beginFrame. */
    unjitteredProjectionMatrix?: Matrix4;
}
export declare class AirHaze {
    #private;
    readonly options: AirHazeOptions;
    readonly texture: StorageTexture;
    readonly low: StorageTexture;
    readonly histories: StorageTexture[];
    readonly godRayTextures: StorageTexture[];
    readonly density: any;
    readonly shafts: any;
    readonly enabled: any;
    readonly frame: any;
    readonly sunUV: any;
    readonly screenFade: any;
    readonly historyValid: any;
    godRays: boolean;
    constructor(options: AirHazeOptions);
    get historyTexture(): StorageTexture;
    invalidate(): void;
    resize(width: number, height: number): void;
    update(renderer: WebGPURenderer, _dt?: number, camera?: Camera): void;
    dispose(): void;
}
export {};
