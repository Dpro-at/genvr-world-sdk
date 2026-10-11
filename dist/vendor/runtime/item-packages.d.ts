import type { GenvrManifest, ItemPackage, Style } from '../contracts/index.js';
import { type ItemBounds } from '../core-library/index.js';
import { BufferGeometry, Matrix4, type Material, type Object3D, type AnimationClip, type InstancedMesh } from 'three/webgpu';
import { type GltfLoaderOptions } from './gltf.js';
/** Asks the platform for an item's package (manifest and file links); null when there is none. */
export type PackageFetcher = (itemId: string) => Promise<ItemPackage | null>;
/** One mesh of a package model, with its place inside the model. */
export interface PackageMesh {
    geometry: BufferGeometry;
    material: Material;
    /** Model-space matrix of the mesh (applied before the placed item's own transform). */
    matrix: Matrix4;
    /** Optional per-world procedural binding, invoked once for each ItemsView batch/LOD mesh.
     * Instance matrices are populated after setup; read them at render/update time.
     * Do not mutate shared model geometry/materials. Return cleanup for owned resources.
     * Static model geometry remains the source for preview, bounds and fallback drawing. */
    setupInstance?: (mesh: InstancedMesh) => (() => void) | void;
}
/** A loaded package model, ready to draw. */
export interface LoadedPackage {
    manifest: GenvrManifest;
    meshes: PackageMesh[];
    bounds: ItemBounds;
    /** The glTF scene and clips (for animated items, P2-16 slice d). */
    scene: Object3D;
    animations: AnimationClip[];
    /** Sound name to signed file link (`manifest.audio`). */
    sounds: Record<string, string>;
    /** Simpler versions for far away (decision 94), nearest first; moving models too. */
    lods: PackageMesh[][];
}
/**
 * glTF packages of non-Core items (P2-16 slice c): each item is fetched and parsed once; the
 * items view asks for a model and is told when it arrives. Items without a package, or whose
 * files fail to load, stay "missing" (drawn as the placeholder box).
 */
export declare class ItemPackages {
    #private;
    private readonly fetchPackage;
    private readonly fetchFile;
    constructor(fetchPackage: PackageFetcher, options?: GltfLoaderOptions, fetchFile?: (url: string) => Promise<ArrayBuffer>);
    /** The loaded model, or null while loading or when it is missing (loading starts on first ask). */
    get(itemId: string): LoadedPackage | null;
    /** True once the package is known to be missing or failed (not while it loads). */
    isMissing(itemId: string): boolean;
    /** Called with the item id whenever a model finishes loading. */
    onLoaded(listener: (itemId: string) => void): () => void;
    /** Resolves when the package is loaded or known missing (tests, pictures). */
    whenSettled(itemId: string): Promise<LoadedPackage | null>;
    dispose(): void;
}
/**
 * Some free kits (Kenney's Nature Kit) export every material as fully metallic with no metal
 * texture. Metal reflects only its surroundings, and items get no environment map, so every face
 * the sun misses was drawn pure black: such materials are drawn as the plain colour they mean.
 */
export declare function plainMetal(material: Material): void;
/** The meshes of a glTF scene with their model-space matrices, and the model's bounds. */
export declare function modelParts(scene: Object3D): {
    meshes: PackageMesh[];
    bounds: ItemBounds;
};
/**
 * All meshes of a model merged into one geometry with vertex colors from their materials, for
 * the placement ghost and library pictures (one mesh, the caller's material).
 */
export declare function mergedPackageGeometry(meshes: readonly PackageMesh[]): BufferGeometry;
/**
 * The package of a Core item's real 3D model in a style (P2-38), made from the library entry: the
 * near model and its simpler levels, served with the web app. Null when the item has none.
 */
export declare function coreModelPackage(itemId: string, style?: Style): ItemPackage | null;
/**
 * Leaves of real trees and plants use cutout transparency (P2-38): alpha-tested and double-sided,
 * never sorted, so forests draw fast and without flicker.
 */
export declare function cutoutLeaves(model: LoadedPackage): void;
