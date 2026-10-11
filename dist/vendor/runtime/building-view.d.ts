import type { BuildingLook, Wall } from '../contracts/index.js';
import { MeshStandardMaterial } from 'three/webgpu';
type HeightAt = (x: number, z: number) => number;
type Facade = NonNullable<BuildingLook['facade']>;
type RoofMaterial = NonNullable<BuildingLook['roofMaterial']>;
/** Geometry lists of one part, merged later per 64 m cell. */
export interface Arrays {
    positions: number[];
    normals: number[];
    uvs: number[];
    colors: number[];
    indices: number[];
}
export declare const emptyArrays: () => Arrays;
/** A real building's drawn parts: facade and roof by surface, window glass and frames, and the roof to stand on. */
export interface BuildingParts {
    facadeSurface: Facade;
    facade: Arrays;
    roofSurface: RoofMaterial;
    roof: Arrays;
    glass: Arrays;
    frames: Arrays;
    collider: {
        positions: Float32Array;
        indices: Uint32Array;
    };
}
/** The look a building has: what the map says, else plaster, storeys of 3 m and a flat roof. */
export declare function resolvedLook(wall: Wall): {
    facade: "stone" | "brick" | "plaster" | "concrete" | "wood";
    facadeTint: [number, number, number];
    roofMaterial: RoofMaterial;
    roofTint: [number, number, number];
    roofShape: "flat" | "gabled" | "hipped" | "pyramidal" | "skillion";
    roofHeight: number;
    levels: number;
};
/**
 * A real building's facades, roof, windows and doors (Real place R4b). The facade reaches from below the lowest
 * ground to the eaves and follows the roof at gable ends; the roof sits on the exact outline; window rows follow the
 * storeys, with one door on the ground floor of the longest side where the ground is high.
 */
export declare function buildingParts(wall: Wall, heightAt: HeightAt, level: number): BuildingParts;
/** One material per facade and roof surface, glass and frames, shared by every real building. */
export declare class BuildingMaterials {
    #private;
    readonly glass: MeshStandardMaterial;
    readonly frames: MeshStandardMaterial;
    constructor();
    facade(surface: Facade): MeshStandardMaterial;
    roof(surface: RoofMaterial): MeshStandardMaterial;
    dispose(): void;
}
export {};
