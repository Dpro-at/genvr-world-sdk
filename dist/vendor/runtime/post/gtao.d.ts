/** Tidewater GTAO/PostFX, MIT DRG Software Solutions LLC, 4811ba48.
 * The source itself ports Three r186 GTAONode. Use that same kernel with standard Three depth,
 * source half-resolution copy, separable bilateral filter and multibounce composite.
 * distanceExponent=1.4 is retained for parity; both source and Three leave it unused. */
import { StorageTexture, RenderTarget, type Texture, type Camera, type WebGPURenderer } from 'three/webgpu';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
export interface GTAOOptions {
    inputTexture?: Texture;
    finalDepthTexture?: Texture;
}
export declare class GTAO {
    #private;
    readonly depthTexture: Texture;
    readonly camera: Camera;
    readonly options: GTAOOptions;
    readonly depth: StorageTexture;
    readonly normals: StorageTexture;
    readonly raw: RenderTarget;
    readonly blurX: StorageTexture;
    readonly texture: StorageTexture;
    readonly colorTexture: StorageTexture;
    readonly strength: any;
    readonly node: ReturnType<typeof ao>;
    constructor(depthTexture: Texture, camera: Camera, options?: GTAOOptions);
    resize(width: number, height: number): void;
    update(renderer: WebGPURenderer, _dt?: number, _camera?: Camera): void;
    dispose(): void;
}
