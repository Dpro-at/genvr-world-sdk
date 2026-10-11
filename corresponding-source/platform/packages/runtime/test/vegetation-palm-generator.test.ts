import { describe, expect, it } from 'vitest';
import { buildGenerated } from '../src/generators.js';
import { palmGenerator, palmGeometryBinding } from '../src/vegetation/palm-generator.js';

describe('reusable source palm generator', () => {
  it('builds shared static near/far geometry with separate raw shader metadata', () => {
    const first = buildGenerated('tidewater.palm', { seed: 11, height: 10, lean: .12, leanAngle: .3 })!;
    const again = buildGenerated('tidewater.palm', { leanAngle: .3, lean: .12, height: 10, seed: 11 })!;
    expect(again).toBe(first);
    expect(first.meshes).toHaveLength(1); expect(first.lods).toHaveLength(1);
    const near = first.meshes[0]!.geometry, far = first.lods[0]![0]!.geometry;
    const a = palmGeometryBinding(near)!, b = palmGeometryBinding(far)!;
    expect(a.level).toBe(0); expect(b.level).toBe(1); expect(a.definition).toEqual(b.definition);
    expect(a.definition.seed).toBe(.5115870486479253);
    expect(a.source).not.toBe(near); expect(a.source.getAttribute('color')).toBeUndefined();
    expect(near.getAttribute('color').count).toBe(near.getAttribute('position').count);
    expect(far.index!.count).toBeLessThan(near.index!.count);
    expect(first.meshes[0]).not.toHaveProperty('setupInstance');
    expect(first.bounds.max[1]).toBeGreaterThan(12);
    expect(first.blocks!.max[1]).toBeCloseTo(10.2);
    expect(first.blocks!.max[0] - first.blocks!.min[0]).toBeLessThan(2);
  });
  it('keeps different author settings independent and clamps malformed direct callers', () => {
    const built = palmGenerator.build({ seed: 11.9, height: 100, lean: -1, leanAngle: Infinity }, 0);
    const metadata = palmGeometryBinding(built.levels[0]![0]!.geometry)!;
    expect(metadata.definition).toEqual({ seed: .5115870486479253, height: 20, lean: 0, leanAngle: .3 });
    const small = buildGenerated('tidewater.palm', { height: 3, seed: 12 })!;
    const tall = buildGenerated('tidewater.palm', { height: 20, seed: 12 })!;
    expect(small.meshes[0]!.geometry).not.toBe(tall.meshes[0]!.geometry);
    expect(small.bounds.max[1]).toBeLessThan(tall.bounds.max[1]);
    for (const level of built.levels) for (const part of level) {
      palmGeometryBinding(part.geometry)!.source.dispose(); part.geometry.dispose();
    }
  });
});
