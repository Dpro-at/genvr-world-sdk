/** Tidewater PostFX.js (4811ba48), MIT: exact Jimenez13/Karis down and nine-tap tent up. */
import { StorageTexture, type Texture, type WebGPURenderer } from 'three/webgpu';
export declare class TidewaterBloom {
    #private;
    readonly input: Texture;
    readonly down: StorageTexture[];
    readonly up: StorageTexture[];
    readonly texture: StorageTexture;
    readonly half: StorageTexture;
    readonly meterTexture: StorageTexture;
    constructor(input: Texture);
    resize(w: number, h: number): void;
    update(renderer: WebGPURenderer): void;
    dispose(): void;
}
