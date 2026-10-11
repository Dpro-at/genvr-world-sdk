import type { Node, Texture } from 'three/webgpu';
import type { OceanFFT } from './ocean-fft.js';
type AnyNode = any;
/** Per-cascade foam weights (L53). */
export declare const FOAM_WEIGHTS: readonly [0.35, 0.45, 0.5, 0.25];
/** Foam look (L39-45): coverage gain, pattern repeats per meter. */
export declare const FOAM_SCALE = 0.09;
/** Near-field ripple tiles: the finest cascade re-sampled at size / 7.3 and size / 3.1, rotated 0.63 and 2.14 rad. */
export declare const RIPPLES: readonly [{
    readonly tiles: 7.3;
    readonly angle: 0.63;
    readonly weight: 0.55;
}, {
    readonly tiles: 3.1;
    readonly angle: 2.14;
    readonly weight: 0.35;
}];
/** How each cascade fades in shallow water: the depth it reaches full height and the floor it keeps (L55-63). */
export declare function cascadeAttenuationTable(sizes: readonly number[]): Array<{
    d0: number;
    floor: number;
}>;
/**
 * `waterSurfaceCascadeAttenuation`: long cascades vanish in shallow water, short ones persist until very shallow.
 * `mix(floor x smoothstep(0, 0.6, depth), 1, smoothstep(0, d0, depth))`.
 */
export declare function cascadeAttenuation(sizes: readonly number[], cascade: number, depth: number): number;
/** The TSL version of `cascadeAttenuation`. */
export declare function cascadeAttenuationNode(sizes: readonly number[], cascade: number, depth: AnyNode): AnyNode;
export interface SurfaceVertex {
    /** Displacement of the vertex (m), already faded by depth. */
    displacement: AnyNode;
    /** Persistent whitecap foam carried by the vertex. */
    foam: AnyNode;
}
/**
 * The vertex part (L120-171): every cascade sampled at `level = max(log2(spacing / texel) + 0.7, 0)`, faded by
 * depth; foam per vertex at a fixed detail level (1.5) where the displacement sample is finer.
 */
export declare function waterSurfaceVertex(fft: OceanFFT, worldXZ: AnyNode, spacing: AnyNode, depth: AnyNode): SurfaceVertex;
export interface SurfaceFragment {
    normal: AnyNode;
    foam: AnyNode;
    coverage: AnyNode;
    slopes: AnyNode;
    jacobian: AnyNode;
    /** Pixel footprint on the surface (m). */
    footprint: AnyNode;
    /** Bubbles mixed into the water (milky, hides the bottom): the surf. */
    aeration: AnyNode;
}
export interface SurfaceFragmentOptions {
    /** Near-camera capillary ripples (Ultra). */
    ripples: boolean;
    foamTexture: Texture;
    foamBias: AnyNode;
    /** Foam sharpness and coverage gain (`waterSurface.foamCoverage`). */
    foamCoverage?: number;
    /** The shore waves here: their normal (per vertex), whitewater + swash foam, clear plunging face (0..1). */
    shore?: {
        normal: AnyNode;
        foam: AnyNode;
        face: AnyNode;
    };
    /** Gusts, slicks and windrows here (sea-detail.ts, Ultra): short-wave roughness and extra whitecaps. */
    detail?: {
        rough: AnyNode;
        gust: AnyNode;
        streak: AnyNode;
    };
}
/**
 * The pixel part (L274-383) without shore, wake, sea detail and ShoreSim: slopes from the derivative cascades,
 * the near ripples, the Jacobian, whitecaps (persistent + fresh), and the foam pattern thresholded by coverage.
 */
export declare function waterSurfaceFragment(fft: OceanFFT, lagXZ: AnyNode, depth: AnyNode, vertexFoam: AnyNode, options: SurfaceFragmentOptions): SurfaceFragment;
export type { Node };
