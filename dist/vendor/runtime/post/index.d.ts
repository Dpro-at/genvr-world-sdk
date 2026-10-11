/** Source PostFX orchestration, Tidewater 4811ba48 (MIT). See source-audit.md for remaining water differences. */
import { RenderTarget, Matrix4, RenderPipeline, type Scene, type PerspectiveCamera, type WebGPURenderer } from 'three/webgpu';
import type { TidewaterSky } from '../tidewater-sky/index.js';
import type { TidewaterLighting } from '../tidewater-sky/lighting.js';
import { GTAO } from './gtao.js';
import { AirHaze } from './air-haze.js';
import { TemporalUpscale } from './temporal-upscale.js';
import { MotionBlur } from './motion-blur.js';
import { LensFlare } from './lens-flare.js';
import { TidewaterBloom } from './bloom.js';
import { TidewaterExposure } from './exposure.js';
import { PostPass } from './pass.js';
import type { Texture } from 'three/webgpu';
export declare const TIDEWATER_POST_ORDER: readonly ["motion-tiles", "gtao", "air-haze", "beauty", "temporal", "bloom", "final", "exposure-next-frame"];
export declare class TidewaterPost {
    #private;
    readonly renderer: WebGPURenderer;
    readonly scene: Scene;
    readonly camera: PerspectiveCamera;
    readonly sky: TidewaterSky;
    readonly lighting: TidewaterLighting;
    readonly caustics: Texture | null;
    readonly underwaterRays: boolean;
    readonly opaque: RenderTarget<Texture<unknown, import("three/webgpu").TextureEventMap>, import("three/webgpu").RenderTargetEventMap>;
    readonly sceneTarget: RenderTarget<Texture<unknown, import("three/webgpu").TextureEventMap>, import("three/webgpu").RenderTargetEventMap>;
    readonly projection: Matrix4;
    readonly underwater: any;
    readonly direction: any;
    readonly color: any;
    readonly irradiance: any;
    readonly params: Record<"bloom" | "vignette" | "saturation" | "contrast" | "warmth" | "grain" | "sharpen" | "exposure" | "frameIndex", any>;
    constructor(renderer: WebGPURenderer, scene: Scene, camera: PerspectiveCamera, sky: TidewaterSky, lighting: TidewaterLighting, caustics?: Texture | null, underwaterRays?: boolean);
    resetHistory(): void;
    render(dt: number, submerged: number): void;
    /** Source-style stage access for GPU profiling and diagnostic fixtures. */
    get passes(): {
        scene: () => void;
        ao: GTAO | undefined;
        haze: AirHaze | undefined;
        beauty: PostPass | undefined;
        temporal: TemporalUpscale | undefined;
        motion: MotionBlur | undefined;
        flare: LensFlare | undefined;
        bloom: TidewaterBloom | undefined;
        final: RenderPipeline | undefined;
        exposure: TidewaterExposure | undefined;
    };
    dispose(): void;
}
