import type { SkinnedMesh, Material } from 'three/webgpu';
import type { FaceUniforms } from './character/human/face.js';
export type AvatarExpression = 'neutral' | 'smile' | 'angry' | 'sad' | 'surprised' | 'thinking';
export const EXPRESSION_MORPHS: Record<AvatarExpression, Record<string, number>> = {
  neutral: {},
  smile: { mouthSmileLeft: .7, mouthSmileRight: .7, cheekSquintLeft: .35, cheekSquintRight: .35, browInnerUp: .1 },
  angry: { browDownLeft: .75, browDownRight: .75, mouthFrownLeft: .45, mouthFrownRight: .45, noseSneerLeft: .3, noseSneerRight: .3, eyeSquintLeft: .3, eyeSquintRight: .3 },
  sad: { browInnerUp: .7, mouthFrownLeft: .55, mouthFrownRight: .55, eyeSquintLeft: .25, eyeSquintRight: .25 },
  surprised: { browInnerUp: .85, browOuterUpLeft: .7, browOuterUpRight: .7, eyeWideLeft: .65, eyeWideRight: .65, jawOpen: .35 },
  thinking: { browInnerUp: .35, eyeSquintLeft: .2, browOuterUpRight: .25 },
};
export const EXPRESSION_KEYS = [...new Set(Object.values(EXPRESSION_MORPHS).flatMap(Object.keys))];
/** The mouth is composed first each frame; expression weights never accumulate over previous frames. */
export function applyAvatarExpression(mesh: SkinnedMesh, expression: AvatarExpression, weights: Record<string, number>, delta: number): void {
  const preset = EXPRESSION_MORPHS[expression];
  const blend = 1 - Math.exp(-Math.max(0, delta) * 8);
  for (const key of EXPRESSION_KEYS) {
    weights[key] = (weights[key] ?? 0) + ((preset[key] ?? 0) - (weights[key] ?? 0)) * blend;
    const index = mesh.morphTargetDictionary?.[key];
    if (index !== undefined && mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = Math.min(1, (mesh.morphTargetInfluences[index] ?? 0) + weights[key]!);
  }
  const material = mesh.userData.humanMaterial as Material | undefined;
  const face = material?.userData.face as FaceUniforms | undefined;
  if (face) {
    const values = ['smile', 'angry', 'sad', 'surprised'];
    for (let i = 0; i < values.length; i++) face.expressions.value.setComponent(i, face.expressions.value.getComponent(i) + ((expression === values[i] ? 1 : 0) - face.expressions.value.getComponent(i)) * blend);
    face.thinking.value += ((expression === 'thinking' ? 1 : 0) - face.thinking.value) * blend;
    face.emotion.value += ((expression === 'smile' ? 1 : expression === 'sad' ? -1 : 0) - face.emotion.value) * blend;
    face.browTilt.value += ((expression === 'angry' ? 1 : expression === 'sad' ? -1 : expression === 'thinking' ? -.5 : 0) - face.browTilt.value) * blend;
    face.surprise.value += ((expression === 'surprised' ? 1 : 0) - face.surprise.value) * blend;
  }
}
