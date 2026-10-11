import { StorageArrayTexture, StorageBufferAttribute, Vector3, type WebGPURenderer } from 'three/webgpu';
import { type UniformOf } from './atmosphere.js';
type ShaderNode = any;
/** Source-faithful GGX96, amortized as three32-sample sums to stay within the frame budget. */
export declare class TidewaterEnvironment {
    #private;
    readonly source: StorageArrayTexture;
    readonly targets: StorageArrayTexture[];
    readonly sh: StorageBufferAttribute[];
    readonly environmentNode: ShaderNode;
    readonly intensity: UniformOf<number>;
    readonly frontIndex: UniformOf<number>;
    readonly size: number;
    front: number;
    step: number;
    primed: boolean;
    interval: number;
    timer: number;
    refreshCount: number;
    readonly totalSteps = 25;
    constructor(radiance: (direction: ShaderNode) => ShaderNode, size?: number);
    sampleSpecular(direction: ShaderNode, roughness: ShaderNode): ShaderNode;
    sampleDiffuse(normal: ShaderNode): ShaderNode;
    get texture(): StorageArrayTexture;
    update(renderer: WebGPURenderer, dt: number, sun: Vector3, force?: boolean): void;
    dispose(): void;
}
export {};
