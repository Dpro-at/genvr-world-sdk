import { describe, expect, it } from 'vitest';
import { SeaSwell } from '@genvr/contracts';
import { describeOceanControls, getOceanResource, queryLibrary } from '../src/index.js';

const id = 'genvr.core.water.tidewater-ocean';
describe('Reusable ocean resource', () => {
  it('is discoverable as realistic Water without duplicating the pond tool', () => {
    const entries = queryLibrary({ category: 'environment', subcategory: 'water', style: 'realistic' });
    expect(entries.filter((entry) => entry.manifest.id === id)).toHaveLength(1);
    expect(queryLibrary({ style: 'voxel' }).some((entry) => entry.manifest.id === id)).toBe(false);
    expect(getOceanResource('genvr.core.water.pond')).toBeUndefined();
  });
  it('describes only supported world fields, source credit and honest fallback limitations', () => {
    const resource = getOceanResource(id)!;
    const info = describeOceanControls(id)!;
    expect(info.scope).toBe('world');
    expect(info.controls.map((control) => control.key)).toEqual(['level', 'direction', 'period', 'height']);
    expect(info.source.commit).toBe('4811ba48');
    expect(resource.limitations).toContain('finite');
    expect(resource.fallback).toContain('lower graphics');
    expect(describeOceanControls('missing')).toBeNull();
  });
  it('matches actual swell schema limits and source defaults', () => {
    const controls = describeOceanControls(id)!.controls;
    for (const key of ['period', 'height'] as const) {
      const control = controls.find((entry) => entry.key === key)!;
      expect(SeaSwell.safeParse({ [key]: control.default }).success).toBe(true);
      expect(SeaSwell.safeParse({ [key]: control.min }).success).toBe(true);
      expect(SeaSwell.safeParse({ [key]: control.max }).success).toBe(true);
      expect(SeaSwell.safeParse({ [key]: control.max + 1 }).success).toBe(false);
    }
    expect(SeaSwell.safeParse({ direction: 360 }).success).toBe(false);
    expect(controls.find((entry) => entry.key === 'direction')!.default).toBeNull();
  });
});
