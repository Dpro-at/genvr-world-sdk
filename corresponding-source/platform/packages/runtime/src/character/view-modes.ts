import type { BoneRole } from './shape.js';

/**
 * How the character editor shows a character (CHAR-01): normal (third person), first person (only arms and hands,
 * from the eye), the skeleton alone, the skeleton over a see-through body, the mesh topology as lines, plain clay
 * (no texture, no colours), the surface normals, and where muscle (red) or fat (yellow) grows, each alone on the mesh lines.
 */
export const CHARACTER_VIEW_MODES = [
  'normal',
  'first-person',
  'skeleton',
  'skeleton-mesh',
  'wireframe',
  'clay',
  'normals',
  'muscles',
  'fat',
] as const;
export type CharacterViewMode = (typeof CHARACTER_VIEW_MODES)[number];

export type CharacterShading = 'smooth' | 'flat';

/** What each mode draws: the body (and with which material), the bones, and where the camera is. */
export interface ViewModeSetup {
  body: 'own' | 'clay' | 'ghost' | 'wire' | 'muscles' | 'fat' | 'normals' | 'arms' | 'none';
  bones: boolean;
  camera: 'orbit' | 'eye';
}

export function viewModeSetup(mode: CharacterViewMode): ViewModeSetup {
  switch (mode) {
    case 'first-person':
      return { body: 'arms', bones: false, camera: 'eye' };
    case 'skeleton':
      return { body: 'none', bones: true, camera: 'orbit' };
    case 'skeleton-mesh':
      return { body: 'ghost', bones: true, camera: 'orbit' };
    case 'wireframe':
      return { body: 'wire', bones: false, camera: 'orbit' };
    case 'clay':
      return { body: 'clay', bones: false, camera: 'orbit' };
    case 'normals':
      return { body: 'normals', bones: false, camera: 'orbit' };
    case 'muscles':
      return { body: 'muscles', bones: false, camera: 'orbit' };
    case 'fat':
      return { body: 'fat', bones: false, camera: 'orbit' };
    default:
      return { body: 'own', bones: false, camera: 'orbit' };
  }
}

const ARM_ROLES = new Set<BoneRole>(['arm', 'hand']);

/**
 * The triangles of a skinned mesh that belong to the arms and hands (first person): every corner's strongest bone is
 * an arm or hand bone. Returns a new index (vertex ids), empty when the body has no arms.
 */
export function armsOnlyIndex(
  index: ArrayLike<number> | null,
  vertexCount: number,
  skinIndex: ArrayLike<number>,
  skinWeight: ArrayLike<number>,
  roles: readonly BoneRole[],
): Uint32Array {
  const arm = new Uint8Array(vertexCount);
  for (let v = 0; v < vertexCount; v += 1) {
    let best = -1;
    let bone = -1;
    for (let k = 0; k < 4; k += 1) {
      const w = skinWeight[v * 4 + k]!;
      if (w > best) {
        best = w;
        bone = skinIndex[v * 4 + k]!;
      }
    }
    arm[v] = best > 0 && ARM_ROLES.has(roles[bone] ?? 'other') ? 1 : 0;
  }
  const corners = index ? index.length : vertexCount;
  const kept: number[] = [];
  for (let t = 0; t + 2 < corners; t += 3) {
    const a = index ? index[t]! : t;
    const b = index ? index[t + 1]! : t + 1;
    const c = index ? index[t + 2]! : t + 2;
    if (arm[a] && arm[b] && arm[c]) kept.push(a, b, c);
  }
  return Uint32Array.from(kept);
}
