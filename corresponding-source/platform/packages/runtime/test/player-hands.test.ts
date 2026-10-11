import { WorldDocument } from '@genvr/contracts';
import { Block, createWorldState } from '@genvr/world';
import { Bone, Ray, Vector3 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { HeldTool, rayBlock, strikeEmote } from '../src/player-hands.js';

const voxels = () =>
  createWorldState(
    WorldDocument.parse({
      schemaVersion: 1,
      experienceId: 'exp-hands',
      version: 0,
      style: { base: 'voxel' },
      sizeTier: 'small',
      access: { mode: 'public' },
      environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
      terrain: {},
      voxels: { seed: 1234, generator: 1 },
      spawn: { position: [0.5, 8, 0.5] },
    }),
  ).voxels!;

describe('aiming with the hands (P2-28)', () => {
  it('finds the block a ray meets and the free cell in front of it', () => {
    const blocks = voxels();
    const ground = blocks.surfaceHeight(20, 20);
    // Straight down onto the ground from 3 m above it.
    const down = rayBlock(blocks, new Ray(new Vector3(20.5, ground + 3, 20.5), new Vector3(0, -1, 0)), 10);
    expect(down).toEqual({ hit: [20, ground - 1, 20], before: [20, ground, 20] });
    // Sideways into a block a player put there.
    blocks.setPlayerBlocks([[23, ground, 20, Block.planks]], '');
    const side = rayBlock(blocks, new Ray(new Vector3(20.5, ground + 0.5, 20.5), new Vector3(1, 0, 0)), 10);
    expect(side).toEqual({ hit: [23, ground, 20], before: [22, ground, 20] });
    // Nothing within reach.
    expect(
      rayBlock(blocks, new Ray(new Vector3(20.5, ground + 3, 20.5), new Vector3(0, 1, 0)), 5),
    ).toBeNull();
  });

  it('follows slanted rays cell by cell', () => {
    const blocks = voxels();
    const ground = blocks.surfaceHeight(20, 20);
    const slant = new Vector3(1, -1, 0.3).normalize();
    const found = rayBlock(blocks, new Ray(new Vector3(20.2, ground + 2.5, 20.4), slant), 20)!;
    expect(found).not.toBeNull();
    const [x, y, z] = found.hit;
    expect(blocks.solidAt(x, y, z)).toBe(true);
    // The cell before shares a face with the hit block.
    const [bx, by, bz] = found.before!;
    expect(Math.abs(bx - x) + Math.abs(by - y) + Math.abs(bz - z)).toBe(1);
    expect(blocks.solidAt(bx, by, bz)).toBe(false);
  });
});

describe('the game tool in hand (P9-12)', () => {
  it('holds the melee tool in the right hand, swaps it, and puts it down', () => {
    const hand = new Bone();
    hand.name = 'RightHand';
    const grip = { bone: hand, palm: new Vector3(-0.06, 0, 0), along: new Vector3(-1, 0, 0) };
    const tool = new HeldTool();
    tool.set('genvr.core.gameplay.melee-tool');
    tool.holdIn(grip);
    expect(tool.itemId).toBe('genvr.core.gameplay.melee-tool');
    expect(tool.mesh?.parent).toBe(hand);
    // Holding the same tool again keeps the same mesh.
    const mesh = tool.mesh;
    tool.set('genvr.core.gameplay.melee-tool');
    expect(tool.mesh).toBe(mesh);
    // Items outside the Core Library cannot be held.
    tool.set('nobody.unknown');
    expect(tool.itemId).toBeNull();
    expect(hand.children).toHaveLength(0);
    tool.set('genvr.core.gameplay.melee-tool');
    tool.holdIn(grip);
    tool.set(null);
    expect(tool.mesh).toBeNull();
    expect(hand.children).toHaveLength(0);
  });

  it('plays the Strike clip when the avatar has it, and only then (the look of a strike)', () => {
    const duration = (clip: string) => (clip === 'Strike' ? 0.4 : 1);
    expect(strikeEmote(['Idle', 'Strike'], duration)).toEqual({ clip: 'Strike', left: 0.4, moving: true });
    expect(strikeEmote(['Idle', 'Walk'], duration)).toBeNull();
  });
});
