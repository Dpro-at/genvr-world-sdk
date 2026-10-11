import { GroundWetness } from './ocean/ground-wetness.js';
import type { WaterBody, WorldDocument } from '../contracts/index.js';
import { type WakeField } from './water-wake.js';
import { TidewaterSea } from './ocean/tidewater-sea.js';
import type { SurfGround, SurfShore } from './ocean/surf-sound.js';
/**
 * Cells per side of the shore field solved for the surf sound alone (Tidewater plan task 6), when the sea is not
 * the Tidewater sea (phones, WebGL2, graphics 1-6): the timing needs no finer grid, and the solve stays small.
 */
export declare const SOUND_SHORE_RES = 256;
import { type Camera, type DirectionalLight, type Scene, type WebGPURenderer, BufferGeometry, Group, type Texture } from 'three/webgpu';
/** Depths up to this many meters are stored (deeper water looks the same). */
export declare const MAX_STORED_DEPTH = 8;
/** Water bodies that mirror the world at most (each one renders the scene once more). */
export declare const MAX_REFLECTING_BODIES = 2;
/**
 * How strongly each color is swallowed per meter of water. Red goes first and blue-green lasts,
 * which is why clear water turns deep blue-green rather than grey as it gets deeper.
 */
export declare const ABSORB: {
    readonly r: 0.46;
    readonly g: 0.09;
    readonly b: 0.06;
};
/** Meters one can see down into the water by default (the World tab's clarity setting). */
export declare const DEFAULT_CLARITY = 9;
/** The tiling caustics picture (`tooling/realistic-models/caustics.py`). */
export declare const CAUSTICS_URL = "/materials/water/caustics.webp";
/** The part of a water body the depth map and the surface need. */
export type WaterShape = Pick<WaterBody, 'level' | 'area'>;
/** How much of the water a device draws (P2-39); filled from the graphics setting. */
export interface WaterQuality {
    /** Surface vertices per meter; more means finer waves. */
    grid: number;
    /** Gerstner waves that really move the surface; 0 keeps the flat normal-map look. */
    waves: number;
    /** Bend what is seen under the water. Costs no extra pass: it reads the drawn scene. */
    refraction: boolean;
    /** Light patterns on the bed. */
    caustics: boolean;
    /** How many bodies mirror the world; each one costs a whole pass over the scene. */
    reflect: number;
    /**
     * The sea: today's Gerstner surface, or Tidewater's FFT deep sea (WebGPU High/Ultra only, plan task 2). Lakes
     * and rivers never change. Absent means Gerstner.
     */
    ocean?: 'gerstner' | 'tidewater';
    /** FFT cascades, camera grid cells per side and near ripples of the Tidewater sea. */
    oceanCascades?: number;
    oceanGrid?: number;
    oceanRipples?: boolean;
    /** Gusts, slicks and windrows on the Tidewater sea (Ultra, plan task 7). */
    oceanDetail?: boolean;
    /** A debug view of the Tidewater sea (`?oceanDebug=normal|foam|depth|...`), for checks only. */
    oceanDebug?: string;
}
export declare const DEFAULT_WATER_QUALITY: WaterQuality;
/** How deep a water body is over the ground, sampled on a grid over its area. */
export interface WaterDepthMap {
    minX: number;
    minZ: number;
    sizeX: number;
    sizeZ: number;
    width: number;
    height: number;
    /** Depth per cell, 0-255 for 0 to MAX_STORED_DEPTH meters (0 where the ground is above). */
    data: Uint8Array;
}
/** How much ground a polygon covers, in square meters (shoelace). */
export declare function polygonArea(area: ReadonlyArray<readonly [number, number]>): number;
/**
 * Samples a water body's depth (its level minus the ground) at about one meter per cell, fewer
 * cells for big seas. The shader reads it for the depth color, the shore foam, and for calming
 * the waves in the shallows.
 */
export declare function bakeWaterDepth(body: WaterShape, heightAt: (x: number, z: number) => number): WaterDepthMap;
/**
 * Height of the waves at a point, in meters, at a moment. The same sum the shader uses, so a
 * floating item bobs with the water it sits on. Every device works it out for itself from the
 * clock: nothing about the waves is sent over the network (owner choice: play uses the flat
 * level with a light bob on top).
 */
export declare function waveHeightAt(x: number, z: number, seconds: number, waves?: number): number;
/**
 * A grid over the water's area, in the mesh's own plane (local x is world x, local y is world -z,
 * local z is world up so the waves lift the surface along it). Only the cells that touch the
 * polygon are kept, plus the ring around them so the water still reaches the shore.
 */
export declare function waterGridGeometry(area: ReadonlyArray<readonly [number, number]>, verticesPerMeter: number): BufferGeometry;
/** Renders the world's water bodies and rebuilds only those that changed. */
export declare class WaterView {
    #private;
    private readonly heightAt;
    /** How far the sea reaches from the middle of the place (the outer ground's edge). */
    private readonly seaExtent;
    readonly group: Group<import("three/webgpu").Object3DEventMap>;
    /** Stable provider survives sea quality switches; WaterView owns final disposal. */
    get groundWetness(): GroundWetness;
    constructor(heightAt: (x: number, z: number) => number, color: number, opacity?: number, 
    /** How far the sea reaches from the middle of the place (the outer ground's edge). */
    seaExtent?: number);
    /**
     * Lets the sea use Tidewater's FFT ocean when the quality asks for it. Only a renderer on the WebGPU backend
     * is kept: WebGL2 has no compute, so it keeps today's sea whatever the quality says.
     */
    setRenderer(renderer: WebGPURenderer | null, doc: WorldDocument): void;
    /** True while the sea is drawn by the Tidewater FFT ocean. */
    get tidewaterSea(): TidewaterSea | null;
    /**
     * Once per frame before rendering: the Tidewater sea's FFT, camera grid and light (nothing for Gerstner), at the
     * room's time when given (plan task 3).
     */
    update(dt: number, camera: Camera, scene: Scene, sun: DirectionalLight, roomMs?: number): void;
    /** The caustics picture in use now: the blank one until the real one has arrived. */
    get causticsTexture(): Texture;
    /** Settles with the real caustics picture once it loads, or null if it never does. */
    whenCausticsReady(): Promise<Texture | null>;
    /** The style's water color and opacity (set_style). */
    setLook(color: number, opacity: number): void;
    /** How many meters one can see down into the water (World tab, P2-39). */
    setClarity(meters: number, doc: WorldDocument): void;
    /** The rings swimmers leave, shared with the rivers (owner request, 2026-09-28). */
    setWake(wake: WakeField | null, doc: WorldDocument): void;
    /**
     * How rough the surface is (the World tab, P2-39). Calm and rough scale the wave heights; how
     * many waves there are stays with the graphics setting, because that is what costs.
     */
    setWaves(waves: 'calm' | 'normal' | 'rough', doc: WorldDocument): void;
    /** Surface detail and how many waves really move it (the graphics setting, P2-39). */
    setQuality(quality: WaterQuality, doc: WorldDocument): void;
    /**
     * Mirrors the world in the water (high graphics quality on computers): the first
     * MAX_REFLECTING_BODIES water bodies get a planar reflection.
     */
    setReflections(on: boolean, doc: WorldDocument): void;
    sync(doc: WorldDocument): void;
    /**
     * The ground changed inside these areas (terrain edits): water over them measures its depth
     * again, so shores and foam follow sculpting.
     */
    groundChanged(areas: ReadonlyArray<{
        minX: number;
        minZ: number;
        maxX: number;
        maxZ: number;
    }>): void;
    /** The ground and sea level for the surf sound, null without a sea. */
    surfGround(): SurfGround | null;
    /**
     * The shore the surf sound listens to: the Tidewater sea's own field (the sound follows the waves drawn), else
     * a field solved for the sound alone, so every device hears the same waves. Null until a field is solved.
     */
    surfShore(): SurfShore | null;
    dispose(): void;
}
