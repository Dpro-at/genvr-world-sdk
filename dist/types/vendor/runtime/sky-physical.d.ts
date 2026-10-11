import { Color, Group, Mesh, MeshBasicNodeMaterial, SphereGeometry, Vector3 } from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import type { SkyState } from './sky-cycle.js';
/** Uniforms added to a physical sky: the night glow, and how much clouds and storms darken it. */
export interface SkyTint {
    top: {
        value: Color;
    };
    horizon: {
        value: Color;
    };
    amount: {
        value: number;
    };
    /** 1 clear; lower under storm clouds and in bad weather. */
    dim: {
        value: number;
    };
}
/**
 * Adds to a `SkyMesh` (P2-36) the night sky's own glow (the physical sky is black once the sun is
 * down, while a real night sky stays deep blue with a lighter horizon; the colors come from the
 * sky preset) and a dimmer for storm clouds and bad weather (the sky's clouds are lit like fair
 * weather clouds, so an overcast sky would glow white).
 */
export declare function addSkyTint(sky: SkyMesh): SkyTint;
/** How much an overcast sky and bad weather darken the sky: 1 clear, about 0.3 in a rainy storm. */
export declare function skyDim(cloudCoverage: number, weatherLight: number): number;
/**
 * The Realistic style's sky (P2-36): air that scatters light (blue by day, orange and red at
 * sunrise and sunset), the sun disc, a moving cloud layer (three.js `SkyMesh`), and a moon lit by
 * the real sun, so its phase is right. Stars stay with `EnvironmentView`.
 */
export declare class PhysicalSky {
    #private;
    readonly group: Group<import("three/webgpu").Object3DEventMap>;
    readonly sky: SkyMesh;
    readonly moon: Mesh<SphereGeometry, MeshBasicNodeMaterial>;
    readonly tint: SkyTint;
    constructor();
    /** Shows one sky state; `weatherLight` below 1 (rain, fog) covers more of the sky. */
    show(state: SkyState, weatherLight: number, nowMs: number): void;
    /** Direction the sunlight comes from on the moon's surface (follows the moon's phase). */
    get moonLight(): Vector3;
    /** Call every frame: the sky and the moon stay around the camera. */
    update(center: Vector3): void;
    dispose(): void;
}
