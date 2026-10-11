import { Color, Group, Scene, Vector3, type Camera, type Mesh, type StorageTexture, type WebGPURenderer } from 'three/webgpu';
import { Atmosphere } from './atmosphere.js';
import { type Vec3 } from './atmosphere-math.js';
import { SkyShading } from './sky-dome.js';
import { TidewaterClouds } from './clouds.js';
import { TidewaterEnvironment } from './environment.js';
export { Atmosphere } from './atmosphere.js';
export { ATMO_RG, ATMO_RT, moonDirection, nightFactor, SUN_ILLUMINANCE, sunDirection, sunDirectionFromTime, sunLight, transmittance, type Vec3, } from './atmosphere-math.js';
/** Tidewater's camera exposure (App.js `settings.exposure`). */
export declare const TIDEWATER_EXPOSURE = 0.55;
export interface TidewaterSkyState {
    /** Direction toward the real sun (may be below the horizon). */
    sun: Vec3;
    /** Camera exposure (Tidewater 0.55). */
    exposure: number;
    /** Weather light: 1 clear, lower dims the sky and the sun. */
    dim: number;
    windDirection?: [number, number];
    windSpeed?: number;
}
export declare class TidewaterSky {
    #private;
    private readonly renderer;
    private readonly scene;
    readonly group: Group<import("three/webgpu").Object3DEventMap>;
    readonly atmosphere: Atmosphere;
    readonly shading: SkyShading;
    readonly clouds: TidewaterClouds;
    readonly dome: Mesh;
    /** The key light now: direction toward it, its colour (illuminance), and how much it is night. */
    readonly light: {
        direction: Vector3;
        color: Color;
        night: number;
    };
    readonly environment: TidewaterEnvironment;
    constructor(renderer: WebGPURenderer, scene: Scene, shadowMap?: StorageTexture);
    /** Takes over tone mapping and the scene's environment while on (EnvironmentView switches it). */
    enable(on: boolean): void;
    /** Environment map size and how far the sun moves before it is made again (the quality table). */
    setEnvironmentQuality(size: number, everyDeg: number): void;
    /** The sky for a sun direction (App.js `updateSun`): the sky follows the real sun, the light switches to the moon. */
    show(state: TidewaterSkyState): void;
    /** Call every frame: the dome follows the camera, the LUTs and the environment map are made when due. */
    update(dt: number, camera: Vector3, viewCamera?: Camera): void;
    /** Average sky colour just above the horizon (read back from the GPU; null before the first read-back). */
    get horizon(): Color | null;
    dispose(): void;
}
