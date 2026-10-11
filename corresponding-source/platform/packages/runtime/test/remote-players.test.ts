import { Block } from '@genvr/world';
import { describe, expect, it } from 'vitest';
import { RemotePlayers } from '../src/remote-players.js';
import { DOWN_SECONDS, downLook } from '../src/avatar.js';

const base = { name: 'Ana', x: 0, y: 0, z: 0, yaw: 0, clip: 'Idle' };
const held = (remotes: RemotePlayers) => {
  let found = null as null | { parent: string | undefined };
  remotes.group.traverse((object) => {
    if (object.name === 'hands-block') found = { parent: object.parent?.name };
  });
  return found;
};

describe("other players' blocks in hand (decision 109)", () => {
  it('shows the block in the right hand, changes it, and takes it away', () => {
    const remotes = new RemotePlayers();
    remotes.setBlockStyle('plain');
    remotes.upsert('a', base);
    expect(held(remotes)).toBeNull();
    remotes.upsert('a', { ...base, hand: Block.planks });
    expect(held(remotes)).toEqual({ parent: 'RightHand' });
    remotes.upsert('a', { ...base, hand: Block.brick });
    expect(held(remotes)).toEqual({ parent: 'RightHand' });
    remotes.upsert('a', { ...base, hand: 0 });
    expect(held(remotes)).toBeNull();
    // A player who joins holding a block shows it at once; unknown blocks show nothing.
    remotes.upsert('b', { ...base, name: 'Bo', hand: Block.sand });
    remotes.upsert('c', { ...base, name: 'Cy', hand: 250 });
    let count = 0;
    remotes.group.traverse((object) => (count += Number(object.name === 'hands-block')));
    expect(count).toBe(1);
    remotes.dispose();
    expect(remotes.count).toBe(0);
  });
});

describe("other players' game tools in hand (P9-12)", () => {
  const tool = (remotes: RemotePlayers) => {
    const found: Array<{ parent: string | undefined; item: unknown }> = [];
    remotes.group.traverse((object) => {
      if (object.name === 'hands-item')
        found.push({ parent: object.parent?.name, item: object.userData.itemId });
    });
    return found;
  };

  it('holds the melee tool in the right hand in place of a block, and gives the block back', () => {
    const remotes = new RemotePlayers();
    remotes.setBlockStyle('plain');
    remotes.upsert('a', { ...base, hand: Block.planks, tool: 'genvr.core.gameplay.melee-tool' });
    expect(tool(remotes)).toEqual([{ parent: 'RightHand', item: 'genvr.core.gameplay.melee-tool' }]);
    expect(held(remotes)).toBeNull();
    remotes.upsert('a', { ...base, hand: Block.planks, tool: 'genvr.core.gameplay.melee-tool' });
    expect(tool(remotes)).toHaveLength(1);
    remotes.upsert('a', { ...base, hand: Block.planks, tool: '' });
    expect(tool(remotes)).toEqual([]);
    expect(held(remotes)).toEqual({ parent: 'RightHand' });
    // Items outside the Core Library show nothing, and the block stays in hand through later updates.
    remotes.upsert('b', { ...base, name: 'Bo', hand: Block.sand, tool: 'nobody.unknown' });
    remotes.upsert('b', { ...base, name: 'Bo', hand: Block.sand, tool: 'nobody.unknown' });
    expect(tool(remotes)).toEqual([]);
    let blocks = 0;
    remotes.group.traverse((object) => (blocks += Number(object.name === 'hands-block')));
    expect(blocks).toBe(2);
    remotes.dispose();
  });
});

describe('knock-outs and strikes of other players (P9-12)', () => {
  const body = (remotes: RemotePlayers) => {
    let found: { visible: boolean; opacity: number; transparent: boolean } | null = null;
    remotes.group.traverse((object) => {
      if (object.name !== 'avatar-body') return;
      const material = (object as unknown as { material: { opacity: number; transparent: boolean } })
        .material;
      found = { visible: object.visible, opacity: material.opacity, transparent: material.transparent };
    });
    return found!;
  };

  it('falls and fades a knocked-out player, and stands them up again when they are back', () => {
    const remotes = new RemotePlayers();
    remotes.upsert('a', { ...base, down: true });
    remotes.update(DOWN_SECONDS * 0.4);
    expect(body(remotes)).toMatchObject({ visible: true, opacity: 1 });
    remotes.update(DOWN_SECONDS * 0.3);
    expect(body(remotes).opacity).toBeLessThan(1);
    expect(body(remotes).transparent).toBe(true);
    remotes.update(DOWN_SECONDS);
    expect(body(remotes).visible).toBe(false);
    remotes.upsert('a', { ...base, down: false });
    remotes.update(0.016);
    expect(body(remotes)).toEqual({ visible: true, opacity: 1, transparent: false });
    remotes.dispose();
  });

  it('plays a strike for every announced strike, not for a reported Strike clip', () => {
    const remotes = new RemotePlayers();
    const heard: unknown[] = [];
    remotes.onStrike = (at) => heard.push(at);
    remotes.upsert('a', base);
    remotes.upsert('a', { ...base, clip: 'Strike' });
    remotes.update(0.016);
    expect(heard).toHaveLength(0);
    expect(remotes.strike('a')).toBe(true);
    expect(remotes.strike('a')).toBe(true);
    expect(heard).toHaveLength(2);
    expect(remotes.strike('nobody')).toBe(false);
    remotes.dispose();
  });

  it('holds an announced strike while the reported clip is still Idle, then follows the report', () => {
    const remotes = new RemotePlayers();
    remotes.upsert('a', base);
    remotes.strike('a');
    remotes.update(0.016);
    expect(remotes.shownClip('a')).toBe('Strike');
    remotes.update(5);
    expect(remotes.shownClip('a')).toBe('Idle');
    remotes.dispose();
  });

  it('finds who a strike would reach: the nearest standing player inside the arc', () => {
    const remotes = new RemotePlayers();
    remotes.upsert('near', { ...base, z: 1 });
    remotes.upsert('far', { ...base, z: 2 });
    remotes.upsert('behind', { ...base, z: -1 });
    remotes.upsert('down', { ...base, z: 0.5, down: true });
    expect(remotes.inReach({ x: 0, z: 0, yaw: 0 }, 2.5, 90)).toBe('near');
    expect(remotes.inReach({ x: 0, z: 0, yaw: Math.PI }, 2.5, 90)).toBe('behind');
    expect(remotes.inReach({ x: 0, z: 0, yaw: Math.PI / 2 }, 2.5, 90)).toBeNull();
    remotes.dispose();
  });
});

describe('the knocked-out look', () => {
  it('falls first, then fades out', () => {
    expect(downLook(0)).toEqual({ tilt: -0, drop: 0, opacity: 1 });
    expect(downLook(0.45)).toMatchObject({ tilt: -Math.PI / 2, opacity: 1 });
    expect(downLook(1).opacity).toBe(0);
  });
});

describe('other players riding an item (movement modes)', () => {
  it('moves the item with seat 1 and puts every rider at their seat of it', () => {
    const remotes = new RemotePlayers();
    const steered: Array<{ item: string; x: number; z: number }> = [];
    const item = { x: 0, y: 0, z: 0, yaw: 0 };
    remotes.riders = {
      steer: (id, pose) => {
        steered.push({ item: id, x: pose.x, z: pose.z });
        Object.assign(item, pose);
      },
      seat: (_id, seat, out) => {
        out.x = item.x + (seat === 1 ? 0.5 : -0.5);
        out.y = item.y + 0.2;
        out.z = item.z;
        out.yaw = item.yaw;
        return true;
      },
      snapDistance: () => 36,
    };
    remotes.upsert('a', { ...base, ride: 'r1', seat: 1 });
    remotes.upsert('b', { ...base, name: 'Bo', ride: 'r1', seat: 2 });
    remotes.upsert('c', { ...base, name: 'Cy', x: 4 });
    // 20 m away: far past walking's jump distance, within this item's.
    remotes.upsert('a', { ...base, ride: 'r1', seat: 1, x: 20 });
    remotes.update(1 / 60);
    // Eased toward the report, not jumped there.
    expect(steered.at(-1)!.x).toBeGreaterThan(0);
    expect(steered.at(-1)!.x).toBeLessThan(20);
    expect(steered.every((entry) => entry.item === 'r1')).toBe(true);
    for (let i = 0; i < 120; i += 1) remotes.update(1 / 60);
    expect(item.x).toBeCloseTo(20, 1);
    const roots = new Map<string, { x: number; y: number }>();
    remotes.group.children.forEach((root, index) =>
      roots.set(['a', 'b', 'c'][index]!, { x: root.position.x, y: root.position.y }),
    );
    expect(roots.get('a')!.x).toBeCloseTo(20.5, 1);
    expect(roots.get('b')!.x).toBeCloseTo(19.5, 1);
    expect(roots.get('a')!.y).toBeCloseTo(0.2, 1);
    expect(roots.get('c')!.x).toBeCloseTo(4, 1);
    remotes.dispose();
  });
});
