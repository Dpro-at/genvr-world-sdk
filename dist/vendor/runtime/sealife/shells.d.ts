import type { BufferGeometry } from 'three/webgpu';
import { type ShellKind, type ShellTone } from './palettes.js';
/**
 * Sea shells (SEALIFE-01): cowrie, conch, scallop and a small spiral snail, each lying on sand. Own procedural
 * code. Static (no motion).
 *
 * - Cowrie: a glossy closed dome, flattened underneath, with dense dark spots drawn by the material.
 * - Conch and snail: a tube swept along a logarithmic helico-spiral (radius r = r1 * e^(b (theta - theta1)), axial
 *   drop proportional to r, tube radius proportional to r), so every whorl is the same shape grown by a fixed
 *   ratio. The conch has shoulder knobs and a flared lip and lies on its side; the snail has a low spire and
 *   spiral bands. The aperture is open: its inside shows the back-side colour (pink in a conch).
 * - Scallop: one ribbed fan-shaped valve with ears at the hinge and a lip that rolls under, lying convex side up.
 *
 * Every kind is moved so its lowest point is at y = 0 and centred on the origin in x and z.
 */
export interface ShellParams {
    seed: number;
    kind: ShellKind;
    size: number;
    tone: ShellTone;
}
export declare const SHELL_DEFAULTS: ShellParams;
export declare function shellParams(params: Readonly<Record<string, unknown>>): ShellParams;
export declare const SHELL_LEVELS = 3;
export declare function buildShell(input: ShellParams, level: number): BufferGeometry;
