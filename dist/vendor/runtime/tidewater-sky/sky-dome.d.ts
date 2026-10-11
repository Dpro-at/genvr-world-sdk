import { Mesh, Vector3 } from 'three/webgpu';
import type { Atmosphere } from './atmosphere.js';
type AnyNode = any;
/** A TSL uniform node with its `value` (typed loosely, like the node chains). */
type UniformOf<T> = AnyNode & {
    value: T;
};
/** Reflections and the environment keep only a trace of the stars. */
export declare const STAR_REFLECTION = 0.08;
/** Uniforms of the sky (Sky.js `SkyParams`). */
export interface SkyParams {
    moonDir: UniformOf<Vector3>;
    sunDiskIntensity: UniformOf<number>;
    starIntensity: UniformOf<number>;
    /** How much it is night (App.js `G.night`), for the moonlit sky. */
    night: UniformOf<number>;
    /** Weather dims the whole sky (1 clear). */
    dim: UniformOf<number>;
}
/** The sky's TSL functions on one atmosphere (Sky.js `_buildModule`). */
export declare class SkyShading {
    readonly atmosphere: Atmosphere;
    readonly params: SkyParams;
    constructor(atmosphere: Atmosphere);
    /** Sun disc radiance along `dir`, the air's transmittance included. */
    sunDisk(dir: AnyNode): AnyNode;
    /** Stars: one candidate per cube-face cell, power-law magnitudes, denser along the Milky Way (Sky.js 101-136). */
    stars(dir: AnyNode): AnyNode;
    moon(dir: AnyNode): AnyNode;
    /** Faint blue-grey moonlit sky and the moon's aureole (Sky.js 148-155). */
    moonSky(dir: AnyNode): AnyNode;
    /** Everything behind the clouds except the sun and moon discs (night terms weighted by the star intensity). */
    background(dir: AnyNode, starK: number): AnyNode;
    /** The main view: background, moon and sun disc (Sky.js `skyViewRadiance`, no clouds yet). */
    viewRadiance(dir: AnyNode): AnyNode;
    /** The environment map's sky: no sun or moon disc (the key light is lit directly), a trace of stars. */
    environmentRadiance(dir: AnyNode): AnyNode;
}
/** An inside-out sphere around the camera drawing `radiance(dir)`; drawn first, never writing depth. */
export declare function skyDome(radiance: (dir: AnyNode) => AnyNode, name: string, radius?: number): Mesh;
export {};
