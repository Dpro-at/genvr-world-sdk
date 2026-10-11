import type { Paving } from '../contracts/index.js';
import { Mesh, MeshStandardMaterial } from 'three/webgpu';
type HeightAt = (x: number, z: number) => number;
/** Highest level: 0.03 + 3 x 0.006 stays under a road's 6 cm. */
export declare const MAX_PAVING_LEVEL = 3;
/** One material per paving ground, shared by every paved area that uses it. */
export declare class PavingMaterials {
    #private;
    /** The material of a ground at a level; a higher level wins the depth test, still less than a road (-2). */
    get(materialId: string, level?: number): MeshStandardMaterial;
    dispose(): void;
}
/**
 * Levels of paved areas that lie on each other: the biggest first at 0, each one more than the bigger areas it
 * overlaps (by their bounds), so they never share a height and flicker.
 */
export declare function pavingLevels(pavings: readonly Paving[]): Map<string, number>;
/**
 * A paved area (R2l): its outline triangulated with the exact edge, every triangle split until no edge is longer than
 * the ground grid, each corner on the ground. Textured in real size (the ground material's tile).
 */
export declare function buildPaving(paving: Paving, heightAt: HeightAt, materials: PavingMaterials, level?: number): Mesh;
export {};
