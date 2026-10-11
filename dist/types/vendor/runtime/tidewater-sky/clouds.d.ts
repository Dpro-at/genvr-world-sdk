import { StorageTexture, Vector2, Vector3, type Camera, type WebGPURenderer } from 'three/webgpu';
import { Atmosphere, type UniformOf } from './atmosphere.js';
import { CloudNoise } from './cloud-noise.js';
type Node = any;
/** View cache, reflection panorama and ground shadows for Tidewater's partly-cloudy preset. */
export declare class TidewaterClouds {
    #private;
    readonly coverage: UniformOf<number>;
    readonly windDirection: UniformOf<Vector2>;
    readonly windSpeed: UniformOf<number>;
    readonly night: UniformOf<number>;
    readonly keyLightDirection: UniformOf<Vector3>;
    readonly keyLightColor: UniformOf<Vector3>;
    readonly shadowStrength: UniformOf<number>;
    readonly viewValid: UniformOf<number>;
    readonly shadowCenter: UniformOf<Vector2>;
    readonly panorama: StorageTexture;
    readonly shadowMap: StorageTexture;
    readonly source: StorageTexture;
    readonly sourceMeta: StorageTexture;
    readonly histories: StorageTexture[];
    readonly historyMetas: StorageTexture[];
    readonly noise: CloudNoise;
    readonly ready: Promise<void>;
    resolutionScale: number;
    historyValid: boolean;
    historyResetCount: number;
    frameIndex: number;
    get shadowTexture(): StorageTexture;
    constructor(atmosphere: Atmosphere, noise?: CloudNoise, shadowMap?: StorageTexture);
    sampleEnvironment(direction: Node): Node;
    sampleView(direction: Node): Node;
    cloudShadow(worldXZ: Node): Node;
    update(renderer: WebGPURenderer, dt: number, camera: Camera): void;
    resetHistory(): void;
    invalidate(): void;
    dispose(): void;
}
export {};
