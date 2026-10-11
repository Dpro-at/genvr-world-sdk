import type { WorldSeed } from '../contracts/index.js';
import type { Cover, Soil, TerrainData } from './terrain-data.js';
/**
 * Everything that stands on the ground without being placed one by one (P2-40): the woods a
 * starter world comes with, and the plants and pebbles a creator paints. Grass (P2-38) already
 * works this way; this is the same idea written once, so a layer is described rather than coded.
 *
 * It is worked out from the world's seed, so every device and the server get the same trees from
 * the same place with nothing sent between them, and it is read per patch of ground so it streams
 * with the chunks instead of being built up front.
 *
 * A creator takes one away by clearing the ground under it: the cover byte on the chunk (P2-40) is
 * what a rule uses instead of a row it could delete.
 */
/** How the ground under a candidate is judged, supplied by whoever knows about that place. */
export interface ScatterGround {
    /** Height of the ground, which is also where the thing stands. */
    heightAt: (x: number, z: number) => number;
    /** The water surface here, or null where there is none: nothing grows under water. */
    waterAt?: (x: number, z: number) => number | null;
    /** True where a road, a floor or anything else built covers the ground. */
    builtAt?: (x: number, z: number) => boolean;
    /** What the creator painted here. */
    coverAt: (x: number, z: number) => Cover;
    /** The soil here, for layers that only stand on some of them. */
    soilAt: (x: number, z: number) => Soil;
}
/** One kind of thing that scatters. */
export interface ScatterLayer {
    id: string;
    /** Core Library items to choose between; each spot picks one from its own hash. */
    items: readonly string[];
    /** Things per 100 square meters. */
    density: number;
    /** Soils it may stand on. */
    soils: readonly Soil[];
    /** Steepest ground it accepts, in degrees. */
    maxSlope: number;
    /**
     * The painted cover this layer belongs to, or absent for the world's own woods. A painted layer
     * grows only where that cover was painted; the woods grow only where nothing was painted at all.
     */
    cover?: Cover;
    /** Smallest and largest size, so a wood is not made of identical trees. */
    scale?: readonly [number, number];
}
/** What the caller knows about a spot that the ground does not (P2-43). */
export interface ScatterOptions {
    /** True where something is built over the ground (a floor, a deck, a placed item). */
    blocked?(x: number, z: number): boolean;
}
/** One thing standing somewhere. */
export interface Scattered {
    x: number;
    z: number;
    y: number;
    itemId: string;
    /** Turn around the upright axis, in radians. */
    yaw: number;
    scale: number;
}
/**
 * Everything of one layer standing inside a box. Candidates come from a jittered grid keyed by the
 * seed, so the same ground always grows the same things and a patch can be worked out on its own.
 *
 * The rules are checked cheapest first, because most candidates fail: what the creator painted,
 * then the spawn clearing, then the soil, then water and anything built, and the slope last since
 * it reads the ground four more times.
 */
export declare function scatterIn(ground: ScatterGround, world: WorldSeed, layer: ScatterLayer, box: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
}, options?: ScatterOptions): Scattered[];
/** Everything of one layer in the patch of ground a chunk covers. */
export declare function scatterInChunk(ground: ScatterGround, world: WorldSeed, layer: ScatterLayer, terrain: Pick<TerrainData, 'chunkSize'>, cx: number, cz: number, options?: ScatterOptions): Scattered[];
/**
 * The woods a kind of starter world comes with (P2-40).
 *
 * The densities are in things per 100 square meters. 0.6 is 60 trees a hectare, which is a real
 * mature broadleaf wood, and it holds 52 fps on a desktop at 25.9 million triangles. A phone will
 * not, and task 8 is where these start following the graphics setting; they are not lowered here,
 * because what they are for is how a wood looks.
 *
 * They were cut to a third for a while during task 4, on the strength of a frame rate of 1 that
 * turned out to be a dev server left running too long: a flat place with twelve items measured 0.7
 * on the same machine at the same moment. Restarting it gave 60. The cut was undone.
 */
export declare function woodsOf(kind: WorldSeed['kind']): ScatterLayer;
/** What the cover brush paints (P2-40, owner choice 4). */
export declare const COVER_LAYERS: Record<'plants' | 'pebbles', ScatterLayer>;
/**
 * What stands at the spawn of a new starter world (P2-40 task 4, design 3.5).
 *
 * A place must never open onto an empty field, so a dozen real trees and rocks are placed as
 * ordinary items the creator owns and can move or delete, not as a rule. They stand inside the
 * flattened clearing, where the scatter's rules refuse to put anything, so a rule and a placed item
 * can never end up in the same spot.
 *
 * A wedge toward +z is left open, because that is the way the camera first looks and the kind's
 * water lies that way: arriving should show the place, not a trunk.
 */
export interface SpawnThing {
    itemId: string;
    position: [number, number, number];
    /** Turn about the upright axis, in radians. */
    yaw: number;
    scale: number;
}
/**
 * Where an item blocks, seen from above, at size 1 and not turned: the middle of the part a player
 * bumps into (a tree's trunk, which is often not at the model's origin) and a circle around it.
 */
export interface Footprint {
    x: number;
    z: number;
    radius: number;
}
export declare function spawnRing(ground: Pick<ScatterGround, 'heightAt'>, world: WorldSeed, 
/**
 * Places around the circle, not things placed: the open wedge is a quarter of it, so 16 leaves
 * the dozen the place actually gets.
 */
count?: number, 
/**
 * The item's footprint (2026-09-29). With it, a spot that would put one thing inside another, or
 * on the player, is left empty, as the wedge is: the ring was laid out by angle alone, and with
 * trees at life size the owner's first look at a new world showed them inside each other.
 */
footprint?: (itemId: string) => Footprint | null): SpawnThing[];
