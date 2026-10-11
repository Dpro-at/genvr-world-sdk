import { Group } from 'three/webgpu';
/** Side of one grass patch (meters): patches are made once and dropped when out of range. */
export declare const GRASS_PATCH = 16;
/** Grass cards cut from Poly Haven grass_medium_01 (CC0) by tooling/realistic-models/grass-cards.py. */
export declare const GRASS_CARDS_URL = "/materials/grass/cards.webp";
/** What the ground says about one spot: is it grass, how steep, and is anything in the way. */
export interface GrassGround {
    /** True where the ground shows a grass material (palette slot of kind grass). */
    isGrass(x: number, z: number): boolean;
    height(x: number, z: number): number;
    /** Slope in degrees. */
    slope(x: number, z: number): number;
    /** True under water, on roads and walls, and above the snow line. */
    blocked(x: number, z: number): boolean;
}
/** Share of grass that grows at a spot (0 none, 1 all), P2-38. */
export declare function grassShare(ground: GrassGround, x: number, z: number): number;
/** Grass cards per square meter at a distance: full near the camera, thinning to none at the edge. */
export declare function grassDensity(distance: number, radius: number, perSquareMeter: number): number;
/**
 * Grass that grows by itself on grass ground in Realistic places (P2-38): patches of instanced
 * grass cards (real clumps cut from a scanned texture, alpha-tested) around the camera, swaying in
 * the wind (TSL), sparser with distance.
 */
export declare class GrassView {
    #private;
    private readonly ground;
    readonly group: Group<import("three/webgpu").Object3DEventMap>;
    /** `cardsUrl` is the atlas; without it (tests) the cards stay clear. */
    constructor(ground: GrassGround, cardsUrl?: string);
    /** How far grass grows and how dense it is (quality and the place's density setting). */
    setDensity(radius: number, perSquareMeter: number, wind?: number): void;
    /** Grow at most this many patches per frame (a fast camera spreads the work over frames). */
    setGrowBudget(patchesPerFrame: number): void;
    /** Drops every patch (the ground changed); they grow again around the camera. */
    clear(): void;
    /** Call every frame with the camera position (cheap while it stays in the same patch). */
    update(x: number, z: number): void;
    get patchCount(): number;
    dispose(): void;
}
