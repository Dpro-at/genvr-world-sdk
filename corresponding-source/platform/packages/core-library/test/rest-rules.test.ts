import { describe, expect, it } from 'vitest';
import { CORE_ITEMS, getCoreItem, itemBoundsForStyle, restRule } from '../src/index.js';

const boundsOf = (id: string) => itemBoundsForStyle(getCoreItem(id)!, 'realistic');

describe('rest rules (P2-43)', () => {
  it('gives trees an upright rule with a trunk-sized base', () => {
    const rule = restRule(getCoreItem('genvr.core.oak-tree')!, boundsOf('genvr.core.oak-tree'));
    expect(rule.mode).toBe('upright');
    expect(rule.sink).toBe(0.3);
    const b = rule.base!;
    expect(b.max[0] - b.min[0]).toBeLessThanOrEqual(0.6);
  });

  it('lets rocks tilt with the slope', () => {
    expect(restRule(getCoreItem('genvr.core.rock-07')!, boundsOf('genvr.core.rock-07')).mode).toBe('tilt');
  });

  it('grades buildings, keeps grid blocks exact, and never moves floating things', () => {
    for (const item of CORE_ITEMS) {
      const rule = restRule(item, itemBoundsForStyle(item, 'blocky'));
      if (item.manifest.physics?.floats) expect(rule.mode).toBe('float');
      else if (item.grid != null || item.resizable) expect(rule).toEqual({ mode: 'upright', sink: 0 });
      else if (item.group === 'buildings' && !item.manifest.placement?.rest) expect(rule.mode).toBe('grade');
    }
  });

  it('only real buildings grade: a pier and a fort stand on a foundation, posts stay upright (final review, I2)', () => {
    const ruleOf = (id: string) => restRule(getCoreItem(id)!, boundsOf(id));
    expect(ruleOf('genvr.core.modular-wooden-pier').mode).toBe('foundation');
    expect(ruleOf('genvr.core.modular-fort-01').mode).toBe('foundation');
    for (const id of ['genvr.core.fence', 'genvr.core.ladder', 'genvr.core.modular-electricity-poles'])
      expect(ruleOf(id)).toEqual({ mode: 'upright', sink: 0.05 });
    expect(ruleOf('genvr.core.house.small').mode).toBe('grade');
    // Written in the manifest itself, so every reader of the manifest sees the same rule.
    expect(getCoreItem('genvr.core.modular-wooden-pier')!.manifest.placement?.rest?.mode).toBe('foundation');
  });

  it('produces finite base coordinates for all nature items at blocky style (P2-43 fix)', () => {
    for (const item of CORE_ITEMS) {
      if (item.group !== 'nature') continue;
      const rule = restRule(item, itemBoundsForStyle(item, 'blocky'));
      if (rule.base) {
        // Ensure all base coordinates are finite (avoid NaN/Infinity).
        expect(Number.isFinite(rule.base.min[0])).toBe(true);
        expect(Number.isFinite(rule.base.min[1])).toBe(true);
        expect(Number.isFinite(rule.base.max[0])).toBe(true);
        expect(Number.isFinite(rule.base.max[1])).toBe(true);
      }
    }
  });

  it('oak tree at blocky style gets a finite trunk base', () => {
    const oak = getCoreItem('genvr.core.oak-tree')!;
    const rule = restRule(oak, itemBoundsForStyle(oak, 'blocky'));
    expect(rule.mode).toBe('upright');
    expect(rule.sink).toBe(0.3);
    // Oak-tree is realistic-only; at blocky it should fall back to realistic bounds and get a base.
    const b = rule.base;
    expect(b).toBeDefined();
    expect(Number.isFinite(b!.min[0])).toBe(true);
    expect(Number.isFinite(b!.max[0])).toBe(true);
    expect(b!.max[0] - b!.min[0]).toBeLessThanOrEqual(0.6);
  });
});
