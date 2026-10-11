import { writeFileSync } from 'node:fs';
import { AnimationMixer, Bone, Group, Matrix4, Skeleton } from 'three/webgpu';
import { CORE_ANIMATIONS, findBody } from '@genvr/core-library';
import { it } from 'vitest';
import { clipFromAnimation } from '../src/avatar.js';
import { SpringBones } from '../src/spring-bones.js';

/**
 * Records the warrior's skin matrices (bone world x A-pose bind inverse) per frame, exactly as the runtime
 * computes them (same clips, same spring bones), for a close-up replay in Blender:
 * tooling/avatar-bodies/polyone/warrior/replay_frames.py (P2-35). Runs only on request:
 *   RECORD=1 CLIP=Run SECONDS=3 OUT=C:/temp/frames.json npx vitest run test/record-warrior.test.ts
 * Env: CLIP (Run), SECONDS (3), SPEED (m/s forward), TURN (rad/s), OUT (file).
 */
it.skipIf(!process.env.RECORD)('records the warrior for a Blender replay', () => {
  const clipName = process.env.CLIP ?? 'Run';
  const seconds = Number(process.env.SECONDS ?? 3);
  const speed = Number(process.env.SPEED ?? (clipName === 'Run' ? 5 : clipName === 'Walk' ? 1.6 : 0));
  const turnRate = Number(process.env.TURN ?? 0);
  const body = findBody('warrior');
  const byName = new Map<string, { bone: Bone; at: readonly number[] }>();
  const bones = body.joints.map((j) => {
    const b = new Bone();
    b.name = body.bonePrefix + j.name;
    const p = j.parent ? byName.get(j.parent) : undefined;
    if (p) {
      b.position.set(j.at[0] - p.at[0]!, j.at[1] - p.at[1]!, j.at[2] - p.at[2]!);
      p.bone.add(b);
    } else b.position.set(...j.at);
    byName.set(j.name, { bone: b, at: j.at });
    return b;
  });
  const root = new Group();
  root.add(bones[0]!);
  const skeleton = new Skeleton(bones);
  for (const j of body.joints)
    if (j.bind) skeleton.getBoneByName(body.bonePrefix + j.name)!.quaternion.set(...j.bind);
  root.updateMatrixWorld(true);
  skeleton.calculateInverses();
  for (const j of body.joints)
    if (j.bind) skeleton.getBoneByName(body.bonePrefix + j.name)!.quaternion.identity();
  const springs = new SpringBones(
    skeleton,
    body.springs!.chains,
    body.springs!.colliders,
    (n) => body.bonePrefix + n,
  );
  const mixer = new AnimationMixer(root);
  mixer
    .clipAction(
      clipFromAnimation(
        CORE_ANIMATIONS.find((a) => a.clip === clipName)!,
        body,
      ),
    )
    .play();
  const frames: number[][][] = [];
  const inv = new Matrix4();
  const m = new Matrix4();
  for (let f = 0; f < seconds * 60; f += 1) {
    root.rotation.y += turnRate / 60;
    root.position.x += (Math.sin(root.rotation.y) * speed) / 60;
    root.position.z += (Math.cos(root.rotation.y) * speed) / 60;
    mixer.update(1 / 60);
    springs.update(1 / 60);
    root.updateMatrixWorld(true);
    inv.copy(root.matrixWorld).invert();
    frames.push(
      bones.map((b, i) =>
        m.multiplyMatrices(inv, b.matrixWorld).multiply(skeleton.boneInverses[i]!).toArray(),
      ),
    );
  }
  writeFileSync(
    process.env.OUT ?? 'C:/temp/genvr-hf/warrior/frames.json',
    JSON.stringify({ bones: bones.map((b) => b.name), frames }),
  );
});
