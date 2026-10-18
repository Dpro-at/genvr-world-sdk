import { describe, expect, it } from 'vitest';
import { SkinnedMesh, BoxGeometry, MeshStandardMaterial } from 'three/webgpu';
import { applyAvatarExpression, EXPRESSION_KEYS } from '../src/avatar-expression.js';
import { createGenvrAvatar } from '../src/avatar.js';
import { faceUniforms } from '../src/character/human/face.js';

describe('avatar facial expression composition', () => {
  it('fades outgoing keys when switching presets and clamps composed weights', () => {
    const mesh = new SkinnedMesh(new BoxGeometry(), new MeshStandardMaterial());
    mesh.morphTargetDictionary = Object.fromEntries(EXPRESSION_KEYS.map((key, i) => [key, i]));
    mesh.morphTargetInfluences = EXPRESSION_KEYS.map(() => 0);
    const weights = {};
    applyAvatarExpression(mesh, 'smile', weights, 1);
    const smile = mesh.morphTargetDictionary.mouthSmileLeft!;
    expect(mesh.morphTargetInfluences[smile]).toBeGreaterThan(.6);
    mesh.morphTargetInfluences.fill(0);
    applyAvatarExpression(mesh, 'angry', weights, 2);
    expect(mesh.morphTargetInfluences[smile]).toBeLessThan(.001);
    mesh.morphTargetInfluences.fill(.9);
    applyAvatarExpression(mesh, 'angry', weights, 1);
    expect(mesh.morphTargetInfluences.every(v => v <= 1)).toBe(true);
    mesh.geometry.dispose(); (mesh.material as MeshStandardMaterial).dispose();
  });
  it('changes drawn human face uniforms and returns them to neutral', () => {
    const mesh = new SkinnedMesh(new BoxGeometry(), new MeshStandardMaterial());
    const material = new MeshStandardMaterial(); const face = faceUniforms(); material.userData.face = face; mesh.userData.humanMaterial = material;
    applyAvatarExpression(mesh, 'smile', {}, 1); expect(face.emotion.value).toBeGreaterThan(.9);
    expect(face.expressions.value.x).toBeGreaterThan(.9);
    applyAvatarExpression(mesh, 'angry', {}, 1); expect(face.browTilt.value).toBeGreaterThan(.9);
    applyAvatarExpression(mesh, 'neutral', {}, 2); expect(Math.abs(face.browTilt.value)).toBeLessThan(.001);
    expect(face.expressions.value.length()).toBeLessThan(.001);
    mesh.geometry.dispose(); (mesh.material as MeshStandardMaterial).dispose(); material.dispose();
  });
  it('keeps expression state per avatar and preserves the speech mouth shape', () => {
    const one = createGenvrAvatar(), two = createGenvrAvatar();
    one.setExpression('smile'); one.setMouth('D'); one.updateExpression(.1); two.updateExpression(.1);
    expect(one.mouth).toBe('D'); expect(two.mouth).toBe('X');
    one.setExpression('neutral'); one.dispose(); two.dispose();
  });
});
