import { AnimationMixer, Mesh, Quaternion, Vector3 } from 'three/webgpu';
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
it('gives the robot five toe shells per foot on ToeBase that stay flat when the heel lifts', () => {
  const avatar = createGenvrAvatar({ ...DEFAULT_LOOK, body: 'robot' });
  try {
    const indices = avatar.mesh.geometry.getAttribute('skinIndex'), bones = avatar.skeleton.bones;
    const toe = bones.find(b => b.name.endsWith('LeftToeBase'))!, foot = bones.find(b => b.name.endsWith('LeftFoot'))!;
    // 5 boxes × 24 vertices on each ToeBase.
    for (const side of ['Left', 'Right']) {
      const index = bones.findIndex(b => b.name.endsWith(side + 'ToeBase'));
      expect(Array.from({ length: indices.count }, (_, i) => indices.getX(i)).filter(i => i === index)).toHaveLength(5 * 24);
    }
    const toePitch = () => { avatar.root.updateMatrixWorld(true); const f = new Vector3(0, 0, 1).applyQuaternion(toe.getWorldQuaternion(new Quaternion())); return Math.asin(-f.y) * 180 / Math.PI; };
    avatar.updateSprings(1 / 60); expect(toePitch()).toBeCloseTo(0, 3);
    // Heel lifted 30° (toes pointing down): the toes bend back to flat.
    foot.rotation.x = 30 * Math.PI / 180; avatar.updateSprings(1 / 60); expect(toePitch()).toBeCloseTo(0, 3);
    // Lifted 70°: the toes bend at most 45°.
    foot.rotation.x = 70 * Math.PI / 180; avatar.updateSprings(1 / 60); expect(toePitch()).toBeCloseTo(25, 1);
    // A clip that keys the toe itself wins.
    toe.rotation.set(.2, 0, 0); const keyed = toe.quaternion.clone(); avatar.updateSprings(1 / 60); expect(toe.quaternion.equals(keyed)).toBe(true);
  } finally { avatar.dispose(); }
});
it('draws round screen eyes that blink and follow a gaze target', () => {
  const avatar = createGenvrAvatar({ ...DEFAULT_LOOK, body: 'robot' });
  try {
    const screen = avatar.root.getObjectByName('robot-face')!;
    const discs = () => screen.children.filter(c => c instanceof Mesh && c.geometry.type === 'CircleGeometry') as Mesh[];
    const rings = screen.children.filter(c => c instanceof Mesh && c.geometry.type === 'RingGeometry');
    expect(rings).toHaveLength(2); expect(discs()).toHaveLength(4);
    avatar.updateExpression(.1); expect(discs().every(d => d.visible)).toBe(true);
    avatar.updateExpression(4.1); expect(discs().some(d => d.visible)).toBe(false);
    avatar.updateExpression(.2);
    avatar.root.updateMatrixWorld(true);
    const head = screen.getWorldPosition(new Vector3()), pupil = discs()[0]!;
    avatar.setGazeTarget(head.clone().add(new Vector3(0, 0, 2))); avatar.updateExpression(.01); const ahead = pupil.position.x;
    avatar.setGazeTarget(head.clone().add(new Vector3(1.5, 0, 2))); avatar.updateExpression(.01);
    expect(Math.abs(pupil.position.x - ahead)).toBeGreaterThan(.005);
    const states = new Set<string>();
    for (const expression of ['neutral', 'smile', 'angry', 'sad', 'surprised', 'thinking'] as const) {
      avatar.setExpression(expression);
      states.add(JSON.stringify(screen.children.map(c => [c.visible, c.position.toArray().map(v => v.toFixed(4)), c.scale.toArray().map(v => v.toFixed(4)), c.rotation.z.toFixed(3)])));
    }
    expect(states.size).toBe(6);
  } finally { avatar.dispose(); }
});
