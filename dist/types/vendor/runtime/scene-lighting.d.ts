import { type Scene } from 'three/webgpu';
import type { SceneLight } from '../contracts/index.js';
/** Shared world lights: actor-relative offsets follow a live character; null actor uses world coordinates. */
export declare class SceneLighting {
    private scene;
    private entries;
    constructor(scene: Scene);
    update(settings: SceneLight[], anchor: (id: string) => {
        x: number;
        y: number;
        z: number;
    } | null): void;
    dispose(): void;
}
