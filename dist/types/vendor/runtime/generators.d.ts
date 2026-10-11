import type { GeneratedLook, GeneratedParam, ItemBounds } from '../core-library/index.js';
import { type BufferGeometry, type Material } from 'three/webgpu';
import type { PackageMesh } from './item-packages.js';
/**
 * Runtime generators of generated looks (Tidewater world, decision 130). A Core Library item with a
 * `GeneratedLook` names a generator; the generator turns the item's parameters (its defaults, overridden by the
 * placed instance's own `params` within the limits) into geometry per level of detail. Generators are pure
 * geometry (node-testable); materials are shared by key, so many items draw with few materials. Builds are kept by
 * generator and parameters, so every instance with the same parameters shares one build and one batch.
 */
/** One mesh of a generated level: its geometry and the key of a shared material. */
export interface GeneratedMesh {
    geometry: BufferGeometry;
    material: string;
}
export interface GeneratedBuild {
    /** Meshes per level of detail, nearest first. */
    levels: ReadonlyArray<ReadonlyArray<GeneratedMesh>>;
    /** What a player bumps into, where much smaller than the whole (a trunk); absent: the whole box. */
    blocks?: ItemBounds;
}
export interface Generator {
    /** Pure: the same parameters and seed always give the same geometry. */
    build(params: Readonly<Record<string, GeneratedParam>>, seed: number): GeneratedBuild;
    /** Far copies are drawn as impostors (vegetation, later tasks). */
    impostor?: true;
}
/** A generated item as `ItemsView` draws it: meshes like a package model's, its LOD levels and bounds. */
export interface GeneratedModel {
    meshes: PackageMesh[];
    lods: PackageMesh[][];
    bounds: ItemBounds;
    blocks?: ItemBounds;
}
export declare function registerGenerator(id: string, generator: Generator): void;
export declare const hasGenerator: (id: string) => boolean;
/** A shared material by key, made on first use. */
export declare function registerGeneratorMaterial(key: string, make: () => Material): void;
/** How many builds were made so far (tests: equal parameters share one). */
export declare const generatedBuildCount: () => number;
/** The build of a generator for some parameters, made once and kept; null when the generator is unknown. */
export declare function buildGenerated(id: string, params: Readonly<Record<string, GeneratedParam>>): GeneratedModel | null;
/** The parameters a generated look draws with: its defaults, overridden by an instance's own within the limits. */
export declare function generatedParams(look: GeneratedLook, instanceParams?: Readonly<Record<string, unknown>>): Record<string, GeneratedParam>;
