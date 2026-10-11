import type { BufferGeometry } from 'three/webgpu';
import { type ClamMantle } from './palettes.js';
/**
 * Giant clam (SEALIFE-01): two fluted valves sitting hinge-down, gaping upwards, with the coloured mantle between
 * them. Own procedural code.
 *
 * Each valve is a fan from the umbo (the hinge point at the origin) to a half-elliptical lip, bulging outwards,
 * with 4-6 big radial folds. Both valves carry the same fold offset in absolute z, so their wavy lips interlock.
 * The lip rolls inwards and down (a hem), so the shell edge has thickness without a second coplanar sheet. The
 * valves are built at the rest gape (the `open` parameter) and turned about the hinge line; the shader closes them
 * by at most `CLAM_CLOSE_FRACTION` of that gape, so they never meet. The mantle spans the gape below the lips,
 * inset from the hems, and follows the valves by its across-gape position.
 */
export interface ClamParams {
    seed: number;
    size: number;
    mantle: ClamMantle;
    open: number;
    speed: number;
}
export declare const CLAM_DEFAULTS: ClamParams;
export declare function clamParams(params: Readonly<Record<string, unknown>>): ClamParams;
export declare const CLAM_LEVELS: 3;
/** Most the valves close, as a fraction of the rest gape. */
export declare const CLAM_CLOSE_FRACTION = 0.6;
/** Rest gape (radians between the valves) at open = 0 and open = 1. */
export declare const CLAM_GAPE: readonly [0.3, 0.9];
export declare function buildClam(input: ClamParams, level: number): BufferGeometry;
