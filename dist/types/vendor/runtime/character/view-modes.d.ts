import type { BoneRole } from './shape.js';
/**
 * How the character editor shows a character (CHAR-01): normal (third person), first person (only arms and hands,
 * from the eye), the skeleton alone, the skeleton over a see-through body, the mesh topology as lines, plain clay
 * (no texture, no colours), the surface normals, and where muscle (red) or fat (yellow) grows, each alone on the mesh lines.
 */
export declare const CHARACTER_VIEW_MODES: readonly ["normal", "first-person", "skeleton", "skeleton-mesh", "wireframe", "clay", "normals", "muscles", "fat"];
export type CharacterViewMode = (typeof CHARACTER_VIEW_MODES)[number];
export type CharacterShading = 'smooth' | 'flat';
/** What each mode draws: the body (and with which material), the bones, and where the camera is. */
export interface ViewModeSetup {
    body: 'own' | 'clay' | 'ghost' | 'wire' | 'muscles' | 'fat' | 'normals' | 'arms' | 'none';
    bones: boolean;
    camera: 'orbit' | 'eye';
}
export declare function viewModeSetup(mode: CharacterViewMode): ViewModeSetup;
/**
 * The triangles of a skinned mesh that belong to the arms and hands (first person): every corner's strongest bone is
 * an arm or hand bone. Returns a new index (vertex ids), empty when the body has no arms.
 */
export declare function armsOnlyIndex(index: ArrayLike<number> | null, vertexCount: number, skinIndex: ArrayLike<number>, skinWeight: ArrayLike<number>, roles: readonly BoneRole[]): Uint32Array;
