import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AnimationMixer, Vector3 } from 'three/webgpu';
import { findBody } from '@genvr/core-library';
import { describe, expect, it } from 'vitest';
import { clipFromAnimation, createGenvrAvatar, DEFAULT_LOOK } from '../src/avatar.js';
import { retargetMotionScene } from '../src/avatar-motion.js';
import { bakeMotion, bakedAnimation, BAKE_FPS } from '../src/avatar-motion-bake.js';
import { registerAvatarMotionLibrary, resolveAvatarLibraryMotion } from '../src/avatar-motion-library.js';
import { motionGlb } from './helpers/motion-glb.js';

const meta = { slug: 'swing', name: 'Swing walk', category: 'Walking', source: 'Test Pack' };
const load = async (data: ArrayBuffer) => { const gltf = await new GLTFLoader().parseAsync(data, ''); return { scene: gltf.scene, clip: gltf.animations[0]! }; };

describe('our own motion files (baked keys)', () => {
  it('bakes a motion into our keys that put every joint where the motion did', async () => {
    const { scene, clip } = await load(motionGlb('mixamorig:', 25));
    const motion = bakeMotion(scene, clip, meta);
    expect(motion).toMatchObject({ format: 'genvr.motion', version: 1, slug: 'swing', kind: 'loop', duration: 1 });
    expect(motion.keys).toHaveLength(BAKE_FPS + 1);
    expect(Object.keys(motion.keys[0]![1])).toContain('LeftUpLeg');
    // The same motion played straight from the source and from our keys, on the Standard robot.
    const robot = findBody('robot');
    const a = createGenvrAvatar({ ...DEFAULT_LOOK, body: 'robot' }), b = createGenvrAvatar({ ...DEFAULT_LOOK, body: 'robot' });
    const source = retargetMotionScene((await load(motionGlb('mixamorig:', 25))).scene, clip, a, 'x');
    const ours = clipFromAnimation(bakedAnimation(motion, 'Swing'), robot);
    const ma = new AnimationMixer(a.root), mb = new AnimationMixer(b.root);
    ma.clipAction(source).play(); mb.clipAction(ours).play();
    const at = (avatar: typeof a, name: string) => avatar.mesh.skeleton.bones.find((bone) => bone.name.endsWith(name))!.getWorldPosition(new Vector3());
    for (const time of [0.1, 0.35, 0.6, 0.85]) {
      ma.setTime(time); mb.setTime(time); a.root.updateMatrixWorld(true); b.root.updateMatrixWorld(true);
      for (const joint of ['LeftFoot', 'RightFoot', 'LeftHand', 'Head']) expect(at(a, joint).distanceTo(at(b, joint)), `${joint} at ${time}`).toBeLessThan(0.01);
    }
    a.dispose(); b.dispose();
  });
  it('the motion library plays a baked motion on any body through our clip pipeline', async () => {
    const { scene, clip } = await load(motionGlb('mixamorig:', 25));
    const motion = bakeMotion(scene, clip, meta);
    const restore = registerAvatarMotionLibrary({ entries: [{ id: 'motion:swing', name: 'Swing walk', category: 'Walking', loop: true, motion: async () => motion }] });
    try {
      const avatar = createGenvrAvatar({ ...DEFAULT_LOOK, body: 'robot' });
      const played = await resolveAvatarLibraryMotion(avatar.root, 'motion:swing');
      expect(played?.loop).toBe(true);
      expect(played?.clip.tracks.some((track) => track.name.endsWith('LeftUpLeg.quaternion'))).toBe(true);
      avatar.dispose();
    } finally { restore(); }
    expect(() => registerAvatarMotionLibrary({ entries: [{ id: 'motion:empty', name: 'x', category: 'Idle', loop: true }] })).toThrow('no data');
  });
});
