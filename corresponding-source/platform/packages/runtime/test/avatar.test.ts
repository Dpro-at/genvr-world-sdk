import {
  AnimationMixer,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three/webgpu';
import { findBody } from '@genvr/core-library';
import { beforeAll, describe, expect, it } from 'vitest';
import { locomotionClip } from '../src/animator.js';
import {
  AVATAR_CUBE,
  bindModelGeometry,
  createAvatarClips,
  createGenvrAvatar,
  DEFAULT_LOOK,
  STANDARD_BONES,
} from '../src/avatar.js';
import { initPhysics, PhysicsWorld } from '../src/physics.js';

/** The 52-bone rig of the agent_player pipeline (docs/avatar-base/validation.json). */
const AGENT_PLAYER_BONES =
  `Hips LeftUpLeg LeftLeg LeftFoot LeftToeBase RightUpLeg RightLeg RightFoot RightToeBase Spine
Spine1 Spine2 LeftShoulder LeftArm LeftForeArm LeftHand LeftHandIndex1 LeftHandIndex2 LeftHandIndex3
LeftHandMiddle1 LeftHandMiddle2 LeftHandMiddle3 LeftHandPinky1 LeftHandPinky2 LeftHandPinky3 LeftHandRing1
LeftHandRing2 LeftHandRing3 LeftHandThumb1 LeftHandThumb2 LeftHandThumb3 Neck Head RightShoulder RightArm
RightForeArm RightHand RightHandIndex1 RightHandIndex2 RightHandIndex3 RightHandMiddle1 RightHandMiddle2
RightHandMiddle3 RightHandPinky1 RightHandPinky2 RightHandPinky3 RightHandRing1 RightHandRing2 RightHandRing3
RightHandThumb1 RightHandThumb2 RightHandThumb3`.split(/\s+/);

describe('mesh bodies (decision 111, P2-35)', () => {
  it('bind a model to the body skeleton by bone name and move it to its bind position', () => {
    const body = findBody('anime-boy');
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 1, 0, 1, 1, 0]), 3));
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1]), 3));
    // The model's own bone order (glTF drops the ':'), and a bone the body does not know.
    const modelBones = ['mixamorigHead', 'mixamorigLeftHand', 'mixamorigTail'];
    geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array([0, 1, 2, 0, 1, 0, 0, 0]), 4));
    geometry.setAttribute(
      'skinWeight',
      new BufferAttribute(new Float32Array([0.5, 0.3, 0.2, 0, 1, 0, 0, 0]), 4),
    );
    const bound = bindModelGeometry(body, geometry, modelBones, new Matrix4().makeTranslation(0, 0.5, 0));
    const joint = (name: string) => body.joints.findIndex((j) => j.name === name);
    const skin = bound.getAttribute('skinIndex');
    expect([skin.getX(0), skin.getY(0), skin.getZ(0)]).toEqual([joint('Head'), joint('LeftHand'), 0]);
    expect(skin.getX(1)).toBe(joint('LeftHand'));
    expect(bound.getAttribute('position').getY(0)).toBeCloseTo(1.5);
    // The source stays as it was (shared model data is never changed).
    expect(geometry.getAttribute('position').getY(0)).toBe(1);
  });

  it('turns and scales the blend shapes of a model with it, without moving them (lip sync P2-44)', () => {
    const body = findBody('anime-boy');
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 1, 0]), 3));
    geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array([0, 0, 0, 0]), 4));
    geometry.setAttribute('skinWeight', new BufferAttribute(new Float32Array([1, 0, 0, 0]), 4));
    // A blend shape opens the mouth 1 cm down, in a model made in centimeters.
    geometry.morphAttributes.position = [new BufferAttribute(new Float32Array([0, -1, 0]), 3)];
    geometry.morphTargetsRelative = true;
    const bindMatrix = new Matrix4().makeScale(0.01, 0.01, 0.01).setPosition(0, 0.5, 0);
    const bound = bindModelGeometry(body, geometry, ['mixamorigHead'], bindMatrix);
    expect(bound.morphAttributes.position![0]!.getY(0)).toBeCloseTo(-0.01);
    expect(geometry.morphAttributes.position![0]!.getY(0)).toBe(-1);
  });
});

describe('Genvr avatar in small cubes (P2-26)', () => {
  it('fits whole cells of about 10 cm to every body part', () => {
    const { mesh } = createGenvrAvatar();
    const size = mesh.geometry.getAttribute('cellSize');
    const origin = mesh.geometry.getAttribute('cellOrigin');
    const position = mesh.geometry.getAttribute('position');
    expect(size.count).toBe(position.count);
    for (let i = 0; i < size.count; i += 1)
      for (const axis of [0, 1, 2] as const) {
        const cell = size.getComponent(i, axis);
        // Parts thinner than a cube (glasses, buttons) are one cell thick.
        expect(cell).toBeGreaterThan(0);
        expect(cell).toBeLessThan(AVATAR_CUBE * 1.6);
        // Every corner of a part lies on a cell border.
        const cells = (position.getComponent(i, axis) - origin.getComponent(i, axis)) / cell;
        expect(Math.abs(cells - Math.round(cells))).toBeLessThan(1e-4);
      }
  });

  it('switches between smooth blocks and small cubes', () => {
    const avatar = createGenvrAvatar(DEFAULT_LOOK, { cubes: true });
    const cubes = avatar.mesh.material;
    avatar.setCubes(false);
    const smooth = avatar.mesh.material;
    expect(smooth).not.toBe(cubes);
    avatar.setCubes(true);
    expect(avatar.mesh.material).toBe(cubes);
    avatar.dispose();
  });
});

describe('Genvr avatar', () => {
  it('uses the standard 52-bone rig with Mixamo names', () => {
    const avatar = createGenvrAvatar({ ...DEFAULT_LOOK, body: 'starter' as const });
    expect(STANDARD_BONES).toEqual(AGENT_PLAYER_BONES);
    expect(avatar.skeleton.bones.map((b) => b.name)).toEqual(AGENT_PLAYER_BONES.map((b) => `mixamorig${b}`));
  });

  it('has at most 4 (here exactly 1) bone weights per vertex, summing to 1', () => {
    const { mesh } = createGenvrAvatar();
    const weights = mesh.geometry.getAttribute('skinWeight');
    for (let i = 0; i < weights.count; i += 1) {
      const w = [weights.getX(i), weights.getY(i), weights.getZ(i), weights.getW(i)];
      expect(w.filter((v) => v > 0).length).toBeLessThanOrEqual(4);
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    }
  });

  it('stands on the ground and is about 1.8 m tall', () => {
    const { mesh } = createGenvrAvatar();
    const box = new Box3().setFromBufferAttribute(mesh.geometry.getAttribute('position') as never);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.001);
    expect(box.min.y).toBeLessThan(0.01);
    expect(box.max.y).toBeGreaterThan(1.7);
    expect(box.max.y).toBeLessThan(1.9);
  });

  it('wears clothing and accessories on its bones and repaints the covered areas (P2-20)', () => {
    const plain = createGenvrAvatar({ ...DEFAULT_LOOK, body: 'starter' as const });
    const count = (avatar: ReturnType<typeof createGenvrAvatar>) =>
      avatar.mesh.geometry.getAttribute('position').count;
    const base = count(plain);
    const look = {
      ...DEFAULT_LOOK,
      body: 'starter' as const,
      skin: '#ff0000',
      wear: ['genvr.core.accessory.cap', 'genvr.core.clothing.shorts'],
    };
    const dressed = createGenvrAvatar(look);
    // The cap adds three boxes (24 vertices each); shorts only repaint the lower legs.
    expect(count(dressed)).toBe(base + 3 * 24);
    const box = new Box3().setFromBufferAttribute(dressed.mesh.geometry.getAttribute('position') as never);
    expect(box.max.y).toBeGreaterThan(1.88);
    const colors = dressed.mesh.geometry.getAttribute('color');
    const reds = Array.from(
      { length: colors.count },
      (_, i) => colors.getX(i) > 0.99 && colors.getY(i) < 0.01,
    );
    const plainReds = createGenvrAvatar({
      ...DEFAULT_LOOK,
      body: 'starter',
      skin: '#ff0000',
    }).mesh.geometry.getAttribute('color');
    const plainCount = Array.from(
      { length: plainReds.count },
      (_, i) => plainReds.getX(i) > 0.99 && plainReds.getY(i) < 0.01,
    );
    // Bare shins in the skin color: two more boxes than without the shorts.
    expect(reds.filter(Boolean).length).toBe(plainCount.filter(Boolean).length + 2 * 24);
    // Changing the look rebuilds the body on the same skeleton.
    plain.setLook(look);
    expect(count(plain)).toBe(base + 3 * 24);
    expect(plain.skeleton.bones.length).toBe(52);
  });

  it('ships the base clips, and every track drives a real bone', () => {
    const avatar = createGenvrAvatar();
    const names = avatar.clips.map((c) => c.name);
    for (const clip of ['Idle', 'Walk', 'Run', 'Jump', 'Swim', 'Sit', 'SitGround'])
      expect(names).toContain(clip);
    const bones = new Set(avatar.skeleton.bones.map((b) => b.name));
    for (const clip of avatar.clips)
      for (const track of clip.tracks) expect(bones.has(track.name.split('.')[0]!)).toBe(true);
  });

  it.each([
    ['starter', 'mixamorigLeftUpLeg', 'mixamorigLeftFoot'],
    ['classic', 'LeftUpperLeg', 'LeftFoot'],
  ] as const)(
    'walking swings the legs of the %s body, feet on or above the ground',
    (body, legName, footName) => {
      const avatar = createGenvrAvatar({ ...DEFAULT_LOOK, body });
      const mixer = new AnimationMixer(avatar.mesh);
      mixer.clipAction(avatar.clips.find((c) => c.name === 'Walk')!).play();
      const leg = avatar.skeleton.bones.find((b) => b.name === legName)!;
      const foot = avatar.skeleton.bones.find((b) => b.name === footName)!;
      const rest = new Quaternion();
      let maxTurn = 0;
      let lowestFoot = Infinity;
      for (let i = 0; i < 20; i += 1) {
        mixer.update(0.05);
        avatar.root.updateMatrixWorld(true);
        maxTurn = Math.max(maxTurn, leg.quaternion.angleTo(rest));
        lowestFoot = Math.min(lowestFoot, foot.getWorldPosition(new Vector3()).y);
      }
      expect(maxTurn).toBeGreaterThan(0.3);
      // The foot bone sits 0.1 m above the sole; the sole must not sink into the ground.
      expect(lowestFoot).toBeGreaterThan(0.05);
    },
  );

  it('the Classic body is the Roblox-like main avatar: 15 joints, standing, about 1.85 m', () => {
    const avatar = createGenvrAvatar();
    expect(avatar.body).toBe('classic');
    expect(avatar.skeleton.bones).toHaveLength(15);
    const box = new Box3().setFromBufferAttribute(avatar.mesh.geometry.getAttribute('position') as never);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.001);
    expect(box.max.y).toBeGreaterThan(1.75);
    expect(box.max.y).toBeLessThan(1.95);
  });

  it('the 2D body is flat and its joints turn only in its own plane (decision 93)', () => {
    const avatar = createGenvrAvatar({ ...DEFAULT_LOOK, body: 'flat' });
    expect(avatar.body).toBe('flat');
    const box = new Box3().setFromBufferAttribute(avatar.mesh.geometry.getAttribute('position') as never);
    // Thin across, standing, about 1.9 m with hair.
    expect(box.max.x - box.min.x).toBeLessThan(0.25);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.001);
    expect(box.max.y).toBeGreaterThan(1.8);
    // Every rotation of every clip is about the x axis only.
    const clips = createAvatarClips('flat');
    expect(clips.length).toBeGreaterThan(10);
    for (const clip of clips)
      for (const track of clip.tracks) {
        if (!track.name.endsWith('.quaternion')) continue;
        for (let i = 0; i < track.values.length; i += 4) {
          expect(Math.abs(track.values[i + 1]!), `${clip.name} ${track.name}`).toBeLessThan(1e-6);
          expect(Math.abs(track.values[i + 2]!), `${clip.name} ${track.name}`).toBeLessThan(1e-6);
        }
      }
  });

  it('switches body types live: new skeleton, and the animator keeps playing on it (P2-22)', async () => {
    const { AvatarAnimator } = await import('../src/animator.js');
    const avatar = createGenvrAvatar();
    const animator = new AvatarAnimator(avatar.mesh, avatar.clips);
    animator.play('Walk');
    expect(avatar.setLook({ ...DEFAULT_LOOK })).toBe(false);
    expect(avatar.setLook({ ...DEFAULT_LOOK, body: 'starter', wear: ['genvr.core.accessory.cap'] })).toBe(
      true,
    );
    animator.rebind(avatar.mesh, avatar.clips);
    expect(avatar.skeleton.bones).toHaveLength(52);
    expect(avatar.mesh.skeleton).toBe(avatar.skeleton);
    expect(animator.currentClip).toBe('Walk');
    const leg = avatar.skeleton.bones.find((b) => b.name === 'mixamorigLeftUpLeg')!;
    let moved = 0;
    for (let i = 0; i < 10; i += 1) {
      animator.update(0.05);
      moved = Math.max(moved, leg.quaternion.angleTo(new Quaternion()));
    }
    expect(moved).toBeGreaterThan(0.2);
  });

  it('resizes like Roblox body scales: taller skeleton and body, same joints (P2-22)', () => {
    const avatar = createGenvrAvatar();
    const top = () =>
      new Box3().setFromBufferAttribute(avatar.mesh.geometry.getAttribute('position') as never).max.y;
    const normal = top();
    const hipY = () => avatar.skeleton.bones[0]!.position.y;
    const normalHip = hipY();
    expect(avatar.setLook({ ...DEFAULT_LOOK, scale: { height: 1.1, width: 1, head: 1 } })).toBe(true);
    expect(top()).toBeCloseTo(normal * 1.1, 2);
    expect(hipY()).toBeCloseTo(normalHip * 1.1, 5);
    expect(avatar.skeleton.bones).toHaveLength(15);
    // The same size again changes nothing.
    expect(avatar.setLook({ ...DEFAULT_LOOK, scale: { height: 1.1, width: 1, head: 1 } })).toBe(false);
  });

  it('chooses the clip from the movement', () => {
    const base = { grounded: true, swimming: false, sitting: null, walkSpeed: 4.5, runSpeed: 8.5 } as const;
    expect(locomotionClip({ ...base, speed: 0 }).clip).toBe('Idle');
    expect(locomotionClip({ ...base, speed: 4.5 }).clip).toBe('Walk');
    expect(locomotionClip({ ...base, speed: 8.5 }).clip).toBe('Run');
    expect(locomotionClip({ ...base, grounded: false, speed: 3 }).clip).toBe('Jump');
    expect(locomotionClip({ ...base, swimming: true, speed: 2 }).clip).toBe('Swim');
    expect(locomotionClip({ ...base, sitting: 'seat', speed: 0 }).clip).toBe('Sit');
  });
});

describe('swimming', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('floats with the feet below the surface instead of sinking', () => {
    const physics = new PhysicsWorld();
    physics.addGround(50);
    const character = physics.createCharacter({ x: 0, y: 0, z: 0 });
    const surface = 3;
    for (let i = 0; i < 180; i += 1) character.swim({ x: 1, z: 0 }, surface - 1.25, false, 1 / 60);
    expect(character.feet.y).toBeGreaterThan(surface - 1.4);
    expect(character.feet.y).toBeLessThan(surface - 1.1);
    expect(character.feet.x).toBeGreaterThan(2);
    physics.dispose();
  });
});

describe('remote players', () => {
  it('appear, glide toward the reported position, and leave', async () => {
    const { RemotePlayers } = await import('../src/remote-players.js');
    const remotes = new RemotePlayers();
    remotes.upsert('a', { name: 'Ana', x: 0, y: 0, z: 0, yaw: 0, clip: 'Idle' });
    remotes.upsert('a', { name: 'Ana', x: 2, y: 0, z: 0, yaw: 1, clip: 'Walk' });
    expect(remotes.count).toBe(1);
    const root = remotes.group.children[0]!;
    remotes.update(1 / 60);
    expect(root.position.x).toBeGreaterThan(0);
    expect(root.position.x).toBeLessThan(2);
    for (let i = 0; i < 60; i += 1) remotes.update(1 / 60);
    expect(root.position.x).toBeCloseTo(2, 2);
    // A teleport far away jumps instead of sliding across the map.
    remotes.upsert('a', { name: 'Ana', x: 100, y: 0, z: 0, yaw: 1, clip: 'Idle' });
    remotes.update(1 / 60);
    expect(root.position.x).toBe(100);
    remotes.remove('a');
    expect(remotes.count).toBe(0);
  });

  it('wear their own look and change it live (P3-23)', async () => {
    const { RemotePlayers } = await import('../src/remote-players.js');
    const remotes = new RemotePlayers();
    const base = { name: 'Ana', x: 0, y: 0, z: 0, yaw: 0, clip: 'Idle' };
    remotes.upsert('a', { ...base, look: JSON.stringify({ wear: [] }) });
    const mesh = remotes.group.getObjectByName('avatar-body') as unknown as {
      geometry: { getAttribute(n: string): { count: number } };
    };
    const plain = mesh.geometry.getAttribute('position').count;
    remotes.upsert('a', { ...base, look: JSON.stringify({ wear: ['genvr.core.accessory.cap'] }) });
    expect(mesh.geometry.getAttribute('position').count).toBe(plain + 3 * 24);
    // A broken look falls back to a placeholder instead of failing.
    remotes.upsert('a', { ...base, look: '{broken' });
    expect(mesh.geometry.getAttribute('position').count).toBe(plain);
  });
});
