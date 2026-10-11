import { type Camera, type Scene, type Texture, type WebGPURenderer } from 'three/webgpu';
export interface UnderwaterSettings {
    /** Fog and caustics; the cheap part, on at every quality. */
    on: boolean;
    /** Rays of light slanting down through the water (high quality only). */
    rays: boolean;
}
/**
 * Screen effects after the scene is drawn (P2-36, P2-39): bloom for the realistic sky, and the
 * underwater view. A pipeline is built whenever either is wanted; with both off it draws the plain
 * way, so other styles pay nothing. Bloom and the underwater view are independent on purpose: a
 * phone runs with bloom off and must still be able to go under water.
 */
export declare class PostEffects {
    #private;
    private readonly renderer;
    private readonly scene;
    private readonly camera;
    constructor(renderer: WebGPURenderer, scene: Scene, camera: Camera);
    /** The caustics picture, shared with the water (it loads once). */
    setCaustics(caustics: Texture): void;
    set(bloomOn: boolean, underwater?: UnderwaterSettings, worldLook?: 'genvr' | 'tidewater'): void;
    /**
     * How far under the water the camera is, 0 to 1. Kept apart from `set` because it changes every
     * frame: moving it never rebuilds the pipeline, it only moves a number the shader already reads.
     */
    setSubmerged(amount: number): void;
    /** Seconds the view takes to go under or come back up. */
    get fadeSeconds(): number;
    render(dt?: number): void;
    /** A filming cut must not blend pixels from the previous shot. */
    resetHistory(): void;
    dispose(): void;
}
