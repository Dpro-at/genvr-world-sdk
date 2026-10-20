import { Color, MeshStandardMaterial, Texture, Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BODY_ID, findBody } from '@genvr/core-library';
import { createGenvrAvatar, DEFAULT_LOOK, headTopOf, HitTint } from '../src/avatar.js';
import { DAMAGE_NUMBER, DamageNumbers } from '../src/damage-numbers.js';
import { HIT_FLASH_SECONDS, NUMBER_ABOVE_HEAD, RemotePlayers } from '../src/remote-players.js';

const base = { name: 'Ana', x: 1, y: 0, z: 2, yaw: 0, clip: 'Idle' };

describe('a hit player flashes red (P9-12)', () => {
  it('tints the avatar its own material and gives it back its own glow', () => {
    const avatar = createGenvrAvatar();
    const material = avatar.mesh.material as MeshStandardMaterial;
    const own = material.emissive.clone();
    avatar.setFlash(1);
    expect(avatar.mesh.material).toBe(material);
    expect(material.emissive.r).toBeGreaterThan(0.9);
    expect(material.emissive.g).toBeLessThan(0.2);
    avatar.setFlash(0);
    expect(material.emissive.equals(own)).toBe(true);
    // Switching to small cubes mid-flash leaves the smooth material as it was.
    avatar.setFlash(1);
    avatar.setCubes(true);
    expect(material.emissive.equals(own)).toBe(true);
    expect((avatar.mesh.material as MeshStandardMaterial).emissive.equals(new Color(0, 0, 0))).toBe(false);
    avatar.dispose();
  });

  it('fades another player back from red over a moment', () => {
    const remotes = new RemotePlayers();
    remotes.upsert('a', base);
    const body = () => {
      let found: MeshStandardMaterial | null = null;
      remotes.group.traverse((object) => {
        if (object.name === 'avatar-body')
          found = (object as never as { material: MeshStandardMaterial }).material;
      });
      return found!;
    };
    expect(remotes.flash('a')).toBe(true);
    expect(remotes.flash('nobody')).toBe(false);
    expect(body().emissive.r).toBeGreaterThan(0.9);
    remotes.update(HIT_FLASH_SECONDS / 2);
    expect(body().emissive.r).toBeGreaterThan(0.3);
    expect(body().emissive.r).toBeLessThan(0.7);
    remotes.update(HIT_FLASH_SECONDS);
    expect(body().emissive.r).toBe(0);
    // The number starts above the head, and above the name tag while names show.
    const head = remotes.numberAnchor('a')!;
    expect(head.y).toBeGreaterThanOrEqual(1.85 + NUMBER_ABOVE_HEAD - 0.01);
    expect(head.y).toBeLessThan(1.85 + 0.5);
    remotes.showNames = false;
    // A player without a readable look wears the default body (the Standard robot, board A12).
    expect(remotes.numberAnchor('a')!.y).toBeCloseTo(createGenvrAvatar({ ...DEFAULT_LOOK, body: DEFAULT_BODY_ID }).headTop + NUMBER_ABOVE_HEAD);
    expect(remotes.numberAnchor('nobody')).toBeNull();
    remotes.dispose();
  });

  it('hears another player strike once per strike', () => {
    const remotes = new RemotePlayers();
    const heard: number[] = [];
    remotes.onStrike = (at) => heard.push(at.x);
    remotes.upsert('a', base);
    // The room announces the strike (struck); the Strike clip in the player's moves adds no second one.
    remotes.strike('a');
    remotes.upsert('a', { ...base, clip: 'Strike' });
    remotes.update(1 / 60);
    remotes.update(1 / 60);
    expect(heard).toHaveLength(1);
    remotes.dispose();
  });
});

describe('the red of a hit on any material (P9-12)', () => {
  it('turns the glow on for a material whose glow is off, and puts it back exactly', () => {
    const tint = new HitTint();
    const material = new MeshStandardMaterial({ emissive: 0x112233, emissiveIntensity: 0 });
    tint.apply(material, 1);
    expect(material.emissiveIntensity).toBe(1);
    expect(material.emissive.r).toBeGreaterThan(0.9);
    tint.apply(material, 0.5);
    expect(material.emissiveIntensity).toBe(1);
    tint.apply(material, 0);
    expect(material.emissiveIntensity).toBe(0);
    expect(material.emissive.getHex()).toBe(0x112233);
  });

  it('sets a glow picture aside while red and gives the same one back', () => {
    const tint = new HitTint();
    const glow = new Texture();
    const material = new MeshStandardMaterial({
      emissive: 0xffffff,
      emissiveMap: glow,
      emissiveIntensity: 2,
    });
    const version = material.version;
    tint.apply(material, 1);
    expect(material.emissiveMap).toBeNull();
    expect(material.emissiveIntensity).toBe(2);
    tint.apply(material, 0.4);
    tint.apply(material, 0);
    expect(material.emissiveMap).toBe(glow);
    expect(material.emissive.getHex()).toBe(0xffffff);
    expect(material.emissiveIntensity).toBe(2);
    // Two shader changes per flash (picture off, picture back), not one per frame.
    expect(material.version - version).toBe(2);
  });

  it('gives a material swapped out mid-flash its own glow back', () => {
    const tint = new HitTint();
    const first = new MeshStandardMaterial({ emissiveIntensity: 0 });
    const second = new MeshStandardMaterial();
    tint.apply(first, 1);
    tint.apply(second, 1);
    expect(first.emissiveIntensity).toBe(0);
    expect(first.emissive.getHex()).toBe(0);
    expect(second.emissive.r).toBeGreaterThan(0.9);
  });
});

describe('damage numbers (P9-12)', () => {
  it('are about a head tall and start just above the head, for every body', () => {
    for (const body of ['classic', 'starter', 'warrior'] as const) {
      const avatar = createGenvrAvatar({ ...DEFAULT_LOOK, body });
      const numbers = new DamageNumbers();
      numbers.show({ x: 0, y: avatar.headTop + NUMBER_ABOVE_HEAD, z: 0 }, 25);
      const sprite = numbers.group.children[0]!;
      numbers.group.updateMatrixWorld(true);
      const scale = new Vector3().setFromMatrixScale(sprite.matrixWorld);
      expect(scale.y).toBeGreaterThanOrEqual(0.25);
      expect(scale.y).toBeLessThanOrEqual(0.5);
      const bottom = sprite.position.y - scale.y / 2;
      expect(bottom - avatar.headTop).toBeGreaterThan(0);
      expect(bottom - avatar.headTop).toBeLessThanOrEqual(0.5);
      numbers.dispose();
    }
    // Mesh bodies (no blocks) take the top of the head above their Head joint.
    expect(headTopOf(findBody('warrior'))).toBeCloseTo(1.77, 1);
  });

  it('rise over the hit player, fade, go away, and reuse their sprites', () => {
    const numbers = new DamageNumbers();
    numbers.show({ x: 0, y: 2, z: 0 }, 25);
    const sprite = numbers.group.children[0]!;
    const startY = sprite.position.y;
    numbers.update(DAMAGE_NUMBER.seconds * 0.25);
    expect(sprite.position.y).toBeGreaterThan(startY);
    numbers.update(DAMAGE_NUMBER.seconds * 0.5);
    expect((sprite as never as { material: { opacity: number } }).material.opacity).toBeLessThan(1);
    numbers.update(DAMAGE_NUMBER.seconds);
    expect(numbers.count).toBe(0);
    expect(numbers.group.children).toHaveLength(0);
    numbers.show({ x: 0, y: 2, z: 0 }, 25);
    expect(numbers.group.children[0]).toBe(sprite);
    numbers.dispose();
  });
});
