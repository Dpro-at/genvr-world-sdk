import type { WorldDocument } from '../contracts/index.js';
import { Group, Vector3 } from 'three/webgpu';
/** Lamps that really light the ground: the ones nearest the camera (every light costs every lit surface). */
export declare const NIGHT_LIGHTS_MAX = 8;
/**
 * Lamp items at night (items whose Core entry has a `light`): every lamp glows, and the nearest
 * `NIGHT_LIGHTS_MAX` light the street around them. By day nothing is shown and the lights are off.
 */
export declare class NightLights {
    #private;
    readonly group: Group<import("three/webgpu").Object3DEventMap>;
    constructor();
    /** Call after the world's items changed. */
    sync(doc: WorldDocument): void;
    /** Call every frame with the camera position and how much night it is (0 day, 1 deep night). */
    update(eye: Vector3, night: number): void;
    dispose(): void;
}
