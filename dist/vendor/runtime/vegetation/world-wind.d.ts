import { Vector2 } from 'three/webgpu';
import type { VegetationWindProvider } from './wind.js';
/** One source detail texture and gust phase per world, independent of ground material lifetime.
 * Consumers borrow all resources; only this owner advances the phase and disposes the texture. */
export declare class TidewaterWorldWind implements VegetationWindProvider {
    #private;
    readonly detail: import("three/webgpu").DataTexture;
    readonly gustOffset: import("three/webgpu").UniformNode<"vec2", Vector2>;
    readonly windDirection: any;
    readonly windSpeed: any;
    constructor(nodes?: Pick<VegetationWindProvider, 'windDirection' | 'windSpeed'>);
    update(dt: number): void;
    dispose(): void;
}
