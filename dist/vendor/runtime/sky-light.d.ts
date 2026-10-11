import { Color, Scene, Vector3, type DirectionalLight, type WebGPURenderer } from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import type { RealisticQuality } from './realistic-quality.js';
import { type SkyTint } from './sky-physical.js';
import type { SkyState } from './sky-cycle.js';
/** Sunlight color from the sun's height (sine of its elevation): white high, golden low, red at the horizon. */
export declare function sunColor(elevationSin: number): Color;
/** True when the sun moved more than `everyDeg` degrees since the last environment map (or there is none). */
export declare function envDue(last: Vector3 | null, now: Vector3, everyDeg: number): boolean;
/**
 * Light from the physical sky (P2-36): the sky is drawn into an environment map that lights and
 * reflects on every material; the camera's tone mapping and exposure follow the time of day; the
 * sunlight takes its color from the sun's height. `enable(false)` puts everything back for styles
 * lit by a hemisphere light.
 */
export declare class SkyLight {
    #private;
    private readonly renderer;
    private readonly scene;
    constructor(renderer: WebGPURenderer, scene: Scene);
    enable(on: boolean): void;
    /** Lights the scene for one sky state; makes the environment map again when the sun moved enough. */
    show(state: SkyState, sky: SkyMesh, glow: SkyTint, sun: DirectionalLight, quality: RealisticQuality, weatherLight: number): void;
    dispose(): void;
}
