import { describe, expect, it } from 'vitest';
import { WorldPackage } from '../src/world-package.js';

const move = (shareable: boolean, slot: number) => ({
  id: `punch-v${slot}`, name: `Punch ${slot}`, slot, once: true, passes_course: true, pace: { speed: 0, stride: 0 },
  rights: { shareable, reasons: shareable ? [] : ['Made on an imported character.'] },
  motion: { id: 'made-punch', name: 'Punch', frames: 60, keys: [{ frame: 0, values: { 'R.elbow.bend': 90 } }] },
});
const world = { format: 'genvr-world', formatVersion: 1, sdkVersion: '0.3.0', id: 'local.world', title: 'W', base: { style: { base: 'blocky' }, sizeTier: 'small' }, commands: [] };

describe('a world carries its made motions (board M19, Q-M19d A)', () => {
  it('keeps shareable made motions with their keys, and stays valid without them', () => {
    expect(WorldPackage.parse(world).madeMoves).toBeUndefined();
    const parsed = WorldPackage.parse({ ...world, madeMoves: [move(true, 3)] });
    expect(parsed.madeMoves?.[0]).toMatchObject({ slot: 3, motion: { keys: [{ frame: 0 }] } });
  });
  it('refuses a made motion that is not shareable, and two on one key', () => {
    expect(() => WorldPackage.parse({ ...world, madeMoves: [move(false, 3)] })).toThrow(/shareable/);
    expect(() => WorldPackage.parse({ ...world, madeMoves: [move(true, 3), { ...move(true, 3), id: 'other-v1' }] })).toThrow(/slot 3/);
  });
});
