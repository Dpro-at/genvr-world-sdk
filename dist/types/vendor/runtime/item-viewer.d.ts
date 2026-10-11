import { type PackageFetcher } from './item-packages.js';
import { type ViewFace } from './view-cube.js';
export interface ItemViewerOptions {
    container: HTMLElement;
    itemId: string;
    /** Loads packages of items that are not in the Core Library (P2-16). */
    fetchPackage?: PackageFetcher;
    dracoPath?: string;
    /** Background behind the item: a number or any CSS color (e.g. the page's paper color). */
    background?: number | string;
    /** The view cube in the corner (default true; small previews leave it out). */
    viewCube?: boolean;
}
/** What a reviewer wants to know about a model (counted from what is drawn). */
export interface ItemFacts {
    triangles: number;
    vertices: number;
    meshes: number;
    materials: number;
    /** Skeleton bones (0 for models without a rig). */
    bones: number;
    /** Width, height, depth in meters. */
    size: [number, number, number];
}
export interface ItemViewer {
    /** The item's name, or null when there is no model to show. */
    readonly name: string | null;
    /** Sound name to link, from the package manifest. */
    readonly sounds: Record<string, string>;
    /** Names of the model's animations; the first plays in a loop. */
    readonly animations: string[];
    readonly backend: 'WebGPU' | 'WebGL';
    /** Model facts (null when there is no model). */
    readonly facts: ItemFacts | null;
    /** Shows the triangles of the model as lines. */
    setWireframe(on: boolean): void;
    /** Shows the skeleton's bones (models with a rig). */
    setBones(on: boolean): void;
    /** Shows the box the model fits in (its size in meters). */
    setSizeBox(on: boolean): void;
    /** Turns the camera to look from one side (the view cube does this too). */
    lookFrom(face: ViewFace): void;
    /** Plays an animation of the model by name (loops). */
    playAnimation(name: string): void;
    /** Called each time the playing animation starts again (e.g. to sound every bounce). */
    onAnimationLoop(listener: () => void): () => void;
    /** Puts the camera back to the first view. */
    resetView(): void;
    dispose(): void;
}
/**
 * An interactive 3D view of one item (reviewers' preview): drag to turn, scroll or pinch to
 * zoom, right-drag to pan. Core items use the same geometry as in worlds; packages show their
 * glTF scene with its materials, and the first animation loops.
 */
export declare function createItemViewer({ container, itemId, fetchPackage, dracoPath, background, viewCube: showCube, }: ItemViewerOptions): Promise<ItemViewer>;
