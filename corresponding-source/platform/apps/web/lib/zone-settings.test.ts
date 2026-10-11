import { RULE_LIMITS, zoneFromParams } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { shapeChoices, shapePatch, tagPatch, visiblePatch, zoneSettings } from './zone-settings';

/** Params after a patch, as `set_item_params` applies it (null removes). */
const apply = (params: Record<string, unknown>, patch: Record<string, unknown>) => {
  const next = { ...params };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next;
};

describe('zone settings of a placed item', () => {
  it('reads a plain item as off and a zone item by its own shape', () => {
    expect(zoneSettings({})).toEqual({ shape: 'off', tag: '', visible: false, active: false });
    expect(zoneSettings({ zoneTag: 'north' }, 'area')).toEqual({
      shape: 'area',
      tag: 'north',
      visible: false,
      active: true,
    });
    expect(zoneSettings({ zone: 'gate', zoneTag: 'line', zoneVisible: true }, 'area')).toMatchObject({
      shape: 'gate',
      visible: true,
      active: true,
    });
    expect(zoneSettings({ zone: 'area', zoneTag: '  ' }).active).toBe(false);
  });

  it('offers off only for items that are not zones by themselves', () => {
    expect(shapeChoices()).toEqual(['off', 'area', 'gate']);
    expect(shapeChoices('gate')).toEqual(['area', 'gate']);
  });

  it('writes what the room reads: shape, trimmed tag, visibility', () => {
    let params: Record<string, unknown> = { color: '#fafafa' };
    params = apply(params, shapePatch('gate'));
    params = apply(params, tagPatch('  north pad '));
    params = apply(params, visiblePatch(true));
    expect(zoneFromParams(params)).toEqual({ shape: 'gate', tag: 'north pad', visibleInPlay: true });
    params = apply(params, visiblePatch(false));
    expect(params).toEqual({ color: '#fafafa', zone: 'gate', zoneTag: 'north pad' });
    params = apply(params, shapePatch('off'));
    expect(params).toEqual({ color: '#fafafa' });
    expect(zoneFromParams(params)).toBeNull();
  });

  it("stores a zone item's own shape as no param", () => {
    expect(shapePatch('area', 'area')).toEqual({ zone: null });
    expect(shapePatch('gate', 'area')).toEqual({ zone: 'gate' });
  });

  it('cuts a long tag to the limit and removes an empty one', () => {
    expect(tagPatch('x'.repeat(60)).zoneTag).toHaveLength(RULE_LIMITS.name);
    expect(tagPatch('   ')).toEqual({ zoneTag: null });
  });
});
