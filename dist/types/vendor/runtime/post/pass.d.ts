/** Fullscreen adapter: the source shaders own output transfer and tone mapping. */
import { RenderPipeline, RenderTarget, type Texture, type WebGPURenderer } from 'three/webgpu';
export declare class PostPass {
    readonly renderer: WebGPURenderer;
    readonly target: RenderTarget;
    readonly pipeline: RenderPipeline;
    constructor(renderer: WebGPURenderer, node: any, name: string, width?: number, height?: number);
    get texture(): Texture;
    resize(width: number, height: number): void;
    update(): void;
    dispose(): void;
}
