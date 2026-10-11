import type { Road } from '../contracts/index.js';
import { type RoadLook } from '../core-library/index.js';
import type { RoadSample } from '../world/index.js';
import { Mesh, MeshStandardMaterial, type Texture } from 'three/webgpu';
type HeightAt = (x: number, z: number) => number;
/** Loads a Core ground material's color picture as a repeating texture (an empty one on servers and in tests). */
export declare function groundTexture(name: string): Texture;
/** Materials per road look plus the shared rail, bridge, and ghost materials. */
export declare class RoadMaterials {
    #private;
    /** Sidewalk paving (R2h). */
    get sidewalk(): MeshStandardMaterial;
    readonly rail: MeshStandardMaterial;
    /** White road paint, drawn over the surface of the same junction level. */
    marking(level?: number): MeshStandardMaterial;
    readonly concrete: MeshStandardMaterial;
    /** The surface of a look; `level` raises its depth bias so it wins over lower roads at junctions. */
    surface(look: RoadLook, level?: number): MeshStandardMaterial;
    /** See-through version for the preview while drawing. */
    ghost(look: RoadLook): MeshStandardMaterial;
    dispose(): void;
}
export interface RoadCrossing {
    /** The part of the other road's centre line near this road. */
    line: ReadonlyArray<readonly [number, number]>;
    /** Half the other road's width. */
    half: number;
    /** True when the other road is drawn over this one (it is wider, or as wide with a smaller id). */
    above: boolean;
    /** The other road's sidewalk on each side, metres (0 for none). */
    sidewalk: number;
}
/** How a road meets the roads that cross it. */
export interface RoadJunctions {
    /** 0 for a road under every road it meets; one more than the highest road it is drawn over. */
    level: number;
    crossings: RoadCrossing[];
}
/**
 * Finds where roads meet (their surfaces overlap off bridges, except pieces of one street continuing each other;
 * railways are left alone) and
 * decides which is drawn on top: the wider road, then the smaller id. The road below leaves out its part inside the one
 * above, and both are drawn plain (no lines) where they overlap, so a junction is one clean asphalt area.
 */
export declare function planJunctions(roads: ReadonlyArray<Pick<Road, 'id' | 'width' | 'materialId' | 'sidewalk'> & {
    samples: readonly RoadSample[];
}>): Map<string, RoadJunctions>;
/** A painted line along a road: sideways offset (right of travel is +, the frames' normal), width, and dashing. */
export interface LaneLine {
    offset: number;
    width: number;
    /** null for a solid line, else metres on and off. */
    dash: {
        on: number;
        off: number;
    } | null;
}
/**
 * The lines of a Street-type road (R2g), right-hand traffic: solid edge lines, dashed lines between lanes of one
 * direction, and on a two-way road a centre line between the directions (dashed with two lanes, solid with more).
 * Without a lane count a one-way road has one lane and a two-way road two (one when too narrow for two).
 */
export declare function laneLines(road: Pick<Road, 'width' | 'lanes' | 'oneway'>): LaneLine[];
export interface BuiltRoad {
    meshes: Mesh[];
    /** Collider triangles for bridge decks and parapets (graded ground carries the rest). */
    collider: {
        positions: Float32Array;
        indices: Uint32Array;
    } | null;
}
/**
 * Builds a road: a textured surface draped on the graded ground, raised to a deck with
 * parapets and piers where it is a bridge, plus rails for railways.
 */
export declare function buildRoad(road: Pick<Road, 'id' | 'width' | 'materialId' | 'lanes' | 'oneway' | 'sidewalk' | 'sidewalkSide'>, samples: readonly RoadSample[], heightAt: HeightAt, materials: RoadMaterials, options?: {
    ghost?: boolean;
    lift?: number;
    junctions?: RoadJunctions | undefined;
}): BuiltRoad;
export {};
