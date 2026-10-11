import type { GroundWetness } from './ground-wetness.js';
import { type Camera, type DirectionalLight, BufferGeometry, Mesh, type Scene, type WebGPURenderer } from 'three/webgpu';
import { OceanFFT } from './ocean-fft.js';
import { type Swell } from './sea-clock.js';
import type { SurfShore } from './surf-sound.js';
/** How the deep sea is drawn at a quality level. */
export interface TidewaterSeaOptions {
    /** Shared ground history bridge owned by WaterView. */
    groundWetness?: GroundWetness;
    /** FFT cascades: 3 at High (the 7.1 m one dropped), 4 at Ultra. */
    cascades: number;
    /** Grid cells per side of the camera grid. */
    gridCells: number;
    /** Near-camera ripples (Ultra). */
    ripples: boolean;
    /** Gusts, slicks and windrows (Ultra, plan task 7). */
    detail?: boolean;
    /** Debug views for checks: the shading normal, the foam, or the wave height. */
    debugView?: string | 'normal' | 'foam' | 'height' | 'sky' | 'fresnel' | 'reflection' | 'transmitted' | 'glint' | 'path' | 'below';
}
/** Size of the grid's finest cell, right under the camera (m). */
export declare const SEA_GRID_FINEST = 0.3;
/** Cells of the sea depth map per side. */
export declare const SEA_DEPTH_CELLS = 512;
/** The depth map keeps depths in this range (m): below it the sea looks the same, above it land is land. */
export declare const SEA_DEPTH_RANGE: readonly [-40, 500];
/** How far the sea grid reaches from the camera (m): just inside the camera's far plane (5000 m). */
export declare const SEA_HORIZON = 4900;
/**
 * Coordinates along one axis of the camera grid, from -radius to radius: `cells / 2` steps each side growing
 * geometrically from `finest`, p(i) = a (e^{b i} - 1) with a b = finest and p(cells / 2) = radius.
 */
export declare function seaGridAxis(cells: number, finest: number, radius: number): Float64Array;
/**
 * The camera grid: positions (x, 0, z) in the mesh's own space and a `spacing` per vertex (the larger of its
 * cells' sides) for the band limit of the waves. Triangles face up.
 */
export declare function seaGridGeometry(cells: number, finest: number, radius: number): BufferGeometry;
/** Depth of the sea over its square (level minus ground, clamped to SEA_DEPTH_RANGE), row-major from -extent. */
export declare function bakeSeaDepth(level: number, extent: number, heightAt: (x: number, z: number) => number, cells?: number): Float32Array;
/** Seconds the shore waves take to fade in or out when a new shore field replaces the old one. */
export declare const SHORE_FADE_SECONDS = 0.5;
/** A terrain edit solves the shore field again after this quiet time (ms). */
export declare const SHORE_RESOLVE_DELAY = 1000;
/** The Tidewater deep sea: FFT, foam pattern, depth map, camera grid and the water material. */
export declare class TidewaterSea {
    #private;
    private readonly renderer;
    private readonly heightAt;
    readonly options: TidewaterSeaOptions;
    readonly mesh: Mesh;
    readonly fft: OceanFFT;
    /** The direction the swell travels in, once the field is solved (automatic or the place's). */
    swellDirection: [number, number] | null;
    constructor(renderer: WebGPURenderer, heightAt: (x: number, z: number) => number, options: TidewaterSeaOptions);
    /**
     * Puts the sea at `level` over a square of +-extent; bakes its depth map and solves its shore field again when
     * either or the swell changes.
     */
    sync(level: number, extent: number, scene: Scene | null, swell?: Swell): void;
    /** Terrain edits: the depth map follows the ground, the shore field after a quiet second. */
    groundChanged(): void;
    /** The shore the surf sound hears (plan task 6): the field the waves are drawn from, null until the first one. */
    get surfShore(): SurfShore | null;
    /** True once a shore field is on the GPU and faded in (for checks). */
    get shoreReady(): boolean;
    /**
     * Once per frame before rendering: advance the waves, follow the camera, take the sun and the sky's light.
     */
    update(dt: number, camera: Camera, scene: Scene, sun: DirectionalLight, fallback?: {
        sky: number[];
        horizon: number[];
    }, 
    /** The room's time (ms since 1970): every device in the room shows the same waves. Absent: local steps. */
    roomMs?: number): void;
    /** The CPU shore phase s for a field sample (T, along) at the current shore time (checks; the surf sound later). */
    shorePhaseAt(T: number, along: number): number;
    dispose(): void;
}
