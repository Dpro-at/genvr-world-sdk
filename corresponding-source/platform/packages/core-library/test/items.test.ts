import { GenvrManifest } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import {
  CORE_ITEMS,
  getCoreItem,
  itemBounds,
  itemGeneratedLook,
  itemModelLook,
  itemParts,
  type ItemPart,
} from '../src/index.js';

/** A flat face as an axis-aligned rectangle: its axis, which way it faces, and its bounds. */
interface Face {
  axis: number;
  side: -1 | 1;
  lo: number[];
  hi: number[];
}

/**
 * The flat faces of a part: all six of a box (top and bottom only when turned by an odd angle),
 * the ends of a cylinder, and the base of a cone, pyramid, or wedge. Turned and round shapes use
 * their bounds, which errs on the side of finding a clash.
 */
function flatFaces(part: ItemPart): Face[] {
  const turn = part.rotationY ?? 0;
  const sin = Math.abs(Math.sin(turn));
  const cos = Math.abs(Math.cos(turn));
  const square = sin < 1e-6 || cos < 1e-6;
  const [w, h, d] = part.size;
  const half = [(w * cos + d * sin) / 2, h / 2, (w * sin + d * cos) / 2];
  const lo = [0, 1, 2].map((a) => part.position[a]! - half[a]!);
  const hi = [0, 1, 2].map((a) => part.position[a]! + half[a]!);
  const face = (axis: number, side: -1 | 1): Face => ({ axis, side, lo, hi });
  const ends = [face(1, -1), face(1, 1)];
  if (part.shape === 'box')
    return square ? [0, 2].flatMap((a) => [face(a, -1), face(a, 1)]).concat(ends) : ends;
  if (part.shape === 'cylinder') return ends;
  if (part.shape === 'sphere') return [];
  return [face(1, -1)];
}

/** Two faces in one plane, facing the same way, with an overlap of some area. */
function sameSpot(a: Face, b: Face): boolean {
  const plane = (f: Face) => (f.side < 0 ? f.lo : f.hi)[f.axis]!;
  if (a.axis !== b.axis || a.side !== b.side || Math.abs(plane(a) - plane(b)) > 1e-6) return false;
  let area = 1;
  for (let o = 0; o < 3; o += 1)
    if (o !== a.axis) area *= Math.max(0, Math.min(a.hi[o]!, b.hi[o]!) - Math.max(a.lo[o]!, b.lo[o]!));
  return area > 1e-6;
}

describe('core items', () => {
  it('have valid, unique manifests and at least one part', () => {
    const ids = new Set<string>();
    for (const item of CORE_ITEMS) {
      expect(GenvrManifest.safeParse(item.manifest).success).toBe(true);
      expect(item.manifest.id.startsWith('genvr.core.')).toBe(true);
      expect(ids.has(item.manifest.id)).toBe(false);
      ids.add(item.manifest.id);
      // Realistic-only items (P2-38) are a real model or a generated look (the palm, the sea life) with no blocky parts.
      if (item.manifest.styles.includes('blocky')) expect(item.parts.length).toBeGreaterThan(0);
      else
        expect(
          itemModelLook(item, 'realistic') ?? itemGeneratedLook(item, 'realistic'),
          item.manifest.id,
        ).not.toBeNull();
    }
    expect(CORE_ITEMS.length).toBeGreaterThanOrEqual(12);
  });

  it('stand on the ground (bounds start at y = 0)', () => {
    for (const item of CORE_ITEMS) {
      const { min } = item.parts.length
        ? itemBounds(item.parts)
        : (itemModelLook(item, 'realistic')?.model.bounds ??
          itemGeneratedLook(item, 'realistic')!.generated.bounds);
      expect(Math.abs(min[1]), item.manifest.id).toBeLessThan(0.01);
    }
  });

  it('carry placement rules by kind, with their own additions (P2-11)', () => {
    const rules = (id: string) => getCoreItem(id)?.manifest.placement;
    expect(rules('genvr.core.tree.pine')).toMatchObject({ stands: ['ground'], maxTilt: 10 });
    expect(rules('genvr.core.bench')).toMatchObject({ stands: ['ground', 'built'], clearFront: 0.8 });
    expect(rules('genvr.core.house.small')).toMatchObject({ maxSlope: 15, clearFront: 1.5 });
    expect(rules('genvr.core.part.box')).toBeUndefined();
  });

  it('have cube looks for the Voxel style that stand on the ground (P2-26 stage 3)', () => {
    const voxel = CORE_ITEMS.filter((item) => item.looks?.voxel);
    expect(voxel.map((item) => item.manifest.id)).toEqual(
      expect.arrayContaining([
        'genvr.core.tree.round',
        'genvr.core.tree.pine',
        'genvr.core.bush',
        'genvr.core.flower',
        'genvr.core.rock',
        'genvr.core.house.small',
        'genvr.core.fence',
        'genvr.core.crate',
        'genvr.core.barrel',
        'genvr.core.bench',
        'genvr.core.table',
        'genvr.core.lamp',
        'genvr.core.ladder',
        'genvr.core.cone',
      ]),
    );
    for (const item of voxel) {
      const parts = itemParts(item, 'voxel');
      expect(parts, item.manifest.id).not.toBe(item.parts);
      expect(
        parts.every((part) => part.shape === 'box'),
        item.manifest.id,
      ).toBe(true);
      // Light enough to scatter by the dozen: inner cubes are dropped and rows merged.
      expect(parts.length, item.manifest.id).toBeLessThan(400);
      expect(Math.abs(itemBounds(parts).min[1]), item.manifest.id).toBeLessThan(0.01);
      expect(item.manifest.styles).toContain('voxel');
    }
    // Other styles keep the default parts.
    const pine = getCoreItem('genvr.core.tree.pine')!;
    expect(itemParts(pine, 'blocky')).toBe(pine.parts);
    expect(itemParts(pine)).toBe(pine.parts);
  });

  it('never draw two flat faces in the same place, in any look (no flicker)', () => {
    // Two faces in one plane, facing the same way and overlapping, fight over each pixel and
    // flicker as the camera moves (z-fighting; the owner saw it on the round tree, 2026-09-27).
    for (const item of CORE_ITEMS)
      for (const [look, parts] of [
        ['default', item.parts] as const,
        // Looks made of parts; model looks (P2-38) are real meshes checked by the model pipeline.
        ...Object.entries(item.looks ?? {}).filter((entry): entry is [string, readonly ItemPart[]] =>
          Array.isArray(entry[1]),
        ),
      ]) {
        const all = parts.map(flatFaces);
        const fights: string[] = [];
        for (let i = 0; i < all.length; i += 1)
          for (let j = i + 1; j < all.length; j += 1)
            for (const a of all[i]!)
              for (const b of all[j]!) if (sameSpot(a, b)) fights.push(`parts ${i} and ${j}`);
        expect(fights, `${item.manifest.id} (${look})`).toEqual([]);
      }
  });

  it('are found by id', () => {
    expect(getCoreItem('genvr.core.crate')?.manifest.name).toBe('Crate');
    expect(getCoreItem('nope')).toBeUndefined();
  });
});

describe('road types', () => {
  it('have unique core ids and sensible widths; unknown ids fall back to the street', async () => {
    const { ROAD_TYPES, getRoadType } = await import('../src/index.js');
    expect(new Set(ROAD_TYPES.map((t) => t.id)).size).toBe(ROAD_TYPES.length);
    for (const type of ROAD_TYPES) {
      expect(type.id.startsWith('genvr.core.road.')).toBe(true);
      expect(type.width).toBeGreaterThanOrEqual(2);
      expect(type.width).toBeLessThanOrEqual(16);
    }
    expect(getRoadType(undefined).look).toBe('street');
    expect(getRoadType('nope').look).toBe('street');
    expect(getRoadType('genvr.core.road.rail').look).toBe('rail');
  });
});
