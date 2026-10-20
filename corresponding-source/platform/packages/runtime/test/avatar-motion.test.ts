import {findBody} from '@genvr/core-library';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AnimationMixer, Vector3 } from 'three/webgpu';
import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { createGenvrAvatar, DEFAULT_LOOK, loadBodyModel } from '../src/avatar.js';
import { retargetAvatarMotion } from '../src/avatar-motion.js';
import { motionGlb } from './helpers/motion-glb.js';
// Real legacy fixtures remain local/private and are supplied explicitly for the compatibility check.
describe('legacy motion import', () => {
  it.skipIf(!process.env.LEGACY_AVATAR_MOTION).each(['starter','human'])('retargets real legacy limb axes onto %s without changing its bind pose', async (bodyId) => {
    const path = process.env.LEGACY_AVATAR_MOTION;
    if (!path) return;
    if(bodyId==='human'){
      const humanBytes=await readFile(new URL('../../../apps/web/public/human/human-base.bin',import.meta.url));
      vi.stubGlobal('fetch',async()=>new Response(humanBytes));
      try {await loadBodyModel(findBody('human'));}finally{vi.unstubAllGlobals();}
    }
    const bytes = await readFile(path); const avatar = createGenvrAvatar({...DEFAULT_LOOK,body:bodyId});
    const before = avatar.mesh.skeleton.bones.map(bone => bone.quaternion.toArray());
    const clip = await retargetAvatarMotion(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), avatar, 'motion:test');
    expect(clip.tracks.length).toBeGreaterThan(10); expect(clip.duration).toBeGreaterThan(0);
    expect(clip.tracks.every(track => Array.from(track.values).every(Number.isFinite))).toBe(true);
    for (const track of clip.tracks.filter(track => track.name.endsWith('.position'))) {
      for (let i = 0; i < track.values.length; i += 3) { expect(track.values[i]).toBeCloseTo(track.values[0]!); expect(track.values[i + 2]).toBeCloseTo(track.values[2]!); }
    }
    expect(avatar.mesh.skeleton.bones.map(bone => bone.quaternion.toArray())).toEqual(before);
    expect(clip.tracks.every(track => !track.name.startsWith('.bones['))).toBe(true);
    const mixer = new AnimationMixer(avatar.root);
    mixer.clipAction(clip).play(); mixer.update(.4);
    expect(avatar.mesh.skeleton.bones.some((bone, i) => bone.quaternion.toArray().some((v, axis) => Math.abs(v - before[i]![axis]!) > .001))).toBe(true);
    const source = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const sourceMixer = new AnimationMixer(source.scene); sourceMixer.clipAction(source.animations[0]!).play();sourceMixer.update(.4);
    source.scene.updateMatrixWorld(true);avatar.root.updateMatrixWorld(true);
    const targetBone = (name: string) => avatar.mesh.skeleton.bones.find(bone => bone.name.endsWith(name))!;
    for(const side of ['Left','Right']) for(const [a,b] of [['UpLeg','Leg'],['Leg','Foot'],['Arm','ForeArm'],['ForeArm','Hand']]) {
      const ta=targetBone(side+a),tb=targetBone(side+b);
      const sa=source.scene.getObjectByName(side+a)!,sb=source.scene.getObjectByName(side+b)!;
      const targetDirection=tb.getWorldPosition(new Vector3()).sub(ta.getWorldPosition(new Vector3())).normalize();
      const sourceDirection=sb.getWorldPosition(new Vector3()).sub(sa.getWorldPosition(new Vector3())).normalize();
      expect(targetDirection.dot(sourceDirection),side+a+' axis').toBeGreaterThan(.95);
    }
    expect(targetBone('LeftFoot').getWorldPosition(new Vector3()).y).toBeLessThan(targetBone('Hips').getWorldPosition(new Vector3()).y);
    sourceMixer.stopAllAction();sourceMixer.uncacheRoot(source.scene);
    mixer.stopAllAction(); mixer.uncacheRoot(avatar.root); avatar.dispose();
  });
  it('a source rig whose arm bones are rolled about their own axis does not twist our arms (board M20)', async () => {
    const avatar = createGenvrAvatar({ ...DEFAULT_LOOK, body: 'robot' });
    const plain = await retargetAvatarMotion(motionGlb(), avatar, 'plain');
    const rolled = await retargetAvatarMotion(motionGlb('mixamorig:', 20, 90), avatar, 'rolled');
    for (const side of ['LeftArm', 'RightArm', 'LeftForeArm', 'LeftUpLeg']) {
      const a = plain.tracks.find(track => track.name.endsWith(`${side}.quaternion`))!, b = rolled.tracks.find(track => track.name.endsWith(`${side}.quaternion`))!;
      for (let i = 0; i < a.values.length; i += 4) expect(Math.abs(a.values[i]! * b.values[i]! + a.values[i + 1]! * b.values[i + 1]! + a.values[i + 2]! * b.values[i + 2]! + a.values[i + 3]! * b.values[i + 3]!), side).toBeGreaterThan(.9999);
    }
    avatar.dispose();
  });
  it('a rig in centimetres keeps its hips movement in scale (board M20)', async () => {
    const avatar = createGenvrAvatar({ ...DEFAULT_LOOK, body: 'robot' });
    // The hips rise 5 cm and come back (the floor fix leaves rises alone): the same in metres or in centimetres.
    const heights = await Promise.all([1, 100].map(async unit => {
      const clip = await retargetAvatarMotion(motionGlb('mixamorig:', 20, 0, { unit, hipBobM: -0.05 }), avatar, 'bob');
      return Array.from(clip.tracks.find(track => track.name.endsWith('Hips.position'))!.values).filter((_, i) => i % 3 === 1);
    }));
    expect(Math.max(...heights[0]!) - Math.min(...heights[0]!)).toBeGreaterThan(0.03);
    expect(Math.max(...heights[0]!) - Math.min(...heights[0]!)).toBeLessThan(0.06);
    heights[1]!.forEach((y, i) => expect(y).toBeCloseTo(heights[0]![i]!, 3));
    avatar.dispose();
  });
  it('rejects invalid and oversized motion buffers', async () => {
    const avatar = createGenvrAvatar();
    await expect(retargetAvatarMotion(new ArrayBuffer(17 * 1024 * 1024), avatar, 'motion:test')).rejects.toThrow(/16 MB/);
    await expect(retargetAvatarMotion(new ArrayBuffer(32), avatar, 'motion:test')).rejects.toThrow(); avatar.dispose();
  });
});
