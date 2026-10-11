import type { BufferGeometry } from 'three/webgpu';
import { type StarfishPalette } from './palettes.js';
/**
 * Starfish (SEALIFE-01): a 5- or 6-armed sea star lying on sand or rock. Own procedural code.
 *
 * The body is a closed polar mesh: a domed top and a nearly flat underside share the outline ring, so nothing is
 * coplanar (no flicker) and the underside, which faces the ground, is culled from above. The outline is a sum of
 * per-arm lobes (seeded length, angle, sideways bend and tip lift); the top tapers from the central disc to the
 * tips and its cross-section is rounded. Tubercles (knobs) are drawn by the material from the vertex pattern
 * settings (worley spots with a bump), so the mesh stays light.
 */
export interface StarfishParams {
    seed: number;
    size: number;
    arms: number;
    palette: StarfishPalette;
    curl: number;
}
export declare const STARFISH_DEFAULTS: StarfishParams;
export declare function starfishParams(params: Readonly<Record<string, unknown>>): StarfishParams;
export declare const STARFISH_LEVELS: 3;
/** Highest arm-tip lift of the curl animation as a fraction of the radius, at curl = 1. */
export declare const STARFISH_CURL_LIFT = 0.12;
export declare function buildStarfish(input: StarfishParams, level: number): BufferGeometry;
