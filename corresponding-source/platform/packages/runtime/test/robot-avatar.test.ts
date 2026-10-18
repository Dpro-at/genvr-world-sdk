import { AnimationMixer, Mesh, Vector3 } from 'three/webgpu';
import { expect, it } from 'vitest';
import { createGenvrAvatar, DEFAULT_LOOK } from '../src/avatar.js';
it('keeps robot shells rigid and weights the individual fingers on the standard rig', () => {
  const avatar = createGenvrAvatar({ ...DEFAULT_LOOK, body: 'robot' });
  try {
    expect(avatar.body).toBe('robot'); expect(avatar.skeleton.bones).toHaveLength(52);
    const weights = avatar.mesh.geometry.getAttribute('skinWeight');
    for (let i = 0; i < weights.count; i++) expect([weights.getX(i), weights.getY(i), weights.getZ(i), weights.getW(i)]).toEqual([1, 0, 0, 0]);
    const indices = avatar.mesh.geometry.getAttribute('skinIndex');
    const finger = avatar.skeleton.bones.findIndex(b => b.name.endsWith('LeftHandIndex2'));
    expect(Array.from({ length: indices.count }, (_, i) => indices.getX(i))).toContain(finger);
    const rest = avatar.mesh.getVertexPosition(0, new Vector3()).distanceTo(avatar.mesh.getVertexPosition(1, new Vector3()));
    const mixer = new AnimationMixer(avatar.root); mixer.clipAction(avatar.clips.find(c => c.name === 'Run')!).play();
    for (const time of [.1, .3, .6]) { mixer.setTime(time); avatar.root.updateMatrixWorld(true); expect(avatar.mesh.getVertexPosition(0, new Vector3()).distanceTo(avatar.mesh.getVertexPosition(1, new Vector3()))).toBeCloseTo(rest, 5); }
    mixer.stopAllAction(); mixer.uncacheRoot(avatar.root);
  } finally { avatar.dispose(); }
});
it('keeps screen expressions independent from speech and removes the screen on body changes', () => {
  const avatar = createGenvrAvatar({ ...DEFAULT_LOOK, body: 'robot' });
  try {
    const screen = avatar.root.getObjectByName('robot-face')!; expect(screen.parent?.name).toMatch(/Head$/);
    const signature = () => screen.children.filter(c => c instanceof Mesh && c.visible).map(c => [c.visible, c.position.toArray(), c.scale.toArray(), c.rotation.z]);
    const neutral = signature(); avatar.setExpression('smile'); expect(signature()).not.toEqual(neutral);
    avatar.setExpression('surprised'); const surprised = signature(); avatar.setExpression('angry'); expect(signature()).not.toEqual(surprised);
    avatar.setMouth('D'); avatar.updateExpression(.1); expect(avatar.mouth).toBe('D');
    avatar.setMouth('X'); avatar.setExpression('neutral'); expect(signature()).toEqual(neutral);
    avatar.setLook({ ...DEFAULT_LOOK, body: 'starter' }); expect(avatar.root.getObjectByName('robot-face')).toBeUndefined();
    avatar.setLook({ ...DEFAULT_LOOK, body: 'robot' }); expect(avatar.root.getObjectByName('robot-face')).toBeDefined();
  } finally { avatar.dispose(); }
});
