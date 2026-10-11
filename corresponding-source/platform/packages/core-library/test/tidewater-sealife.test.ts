import { describe, expect, it } from 'vitest';
import {
  CORE_ITEMS,
  EXPERIMENTAL_ITEMS,
  LIBRARY,
  generatedParamKeys,
  getCoreItem,
  itemGeneratedLook,
} from '../src/index.js';
import { describeGeneratedControls, generatedControlValueError } from '../src/generated-controls.js';
import { restRule } from '../src/rest-rules.js';

/** Sea-life items (SEALIFE-01): starfish, giant clam and sea shell, drawn by Genvr's own runtime generators. */
const ITEMS = {
  'genvr.core.tidewater.starfish': {
    generator: 'sealife.starfish',
    keys: ['arms', 'curl', 'palette', 'seed', 'size'],
    collider: 'box-free',
    motion: ['curl'],
  },
  'genvr.core.tidewater.giant-clam': {
    generator: 'sealife.giant-clam',
    keys: ['mantle', 'open', 'seed', 'size', 'speed'],
    collider: 'box',
    motion: ['open', 'speed'],
  },
  'genvr.core.tidewater.sea-shell': {
    generator: 'sealife.shell',
    keys: ['kind', 'seed', 'size', 'tone'],
    collider: 'box-free',
    motion: [],
  },
} as const;

describe('sea-life Core items (SEALIFE-01)', () => {
  it('are normal Realistic library items for every place (ITEMS-close-01) with a generated look', () => {
    for (const [id, expected] of Object.entries(ITEMS)) {
      const item = getCoreItem(id)!;
      expect(item, id).toBeDefined();
      expect(EXPERIMENTAL_ITEMS).not.toContain(item);
      expect(CORE_ITEMS).toContain(item);
      expect(LIBRARY).toContain(item);
      expect(item.experimental).toBeUndefined();
      expect(item.world).toBe('tidewater');
      expect(item.manifest.subcategory).toBe('nature');
      expect(item.manifest.styles).toEqual(['realistic']);
      const look = itemGeneratedLook(item, 'realistic')!;
      expect(look.generated.generator).toBe(expected.generator);
      expect(look.generated.source.name).toContain('own procedural code');
      expect(look.generated.picture).toBe(`/models/tidewater/sealife/${id.split('.').pop()}.png`);
      expect(generatedParamKeys(id)).toEqual(expected.keys);
      expect(item.manifest.physics?.collider === 'none').toBe(expected.collider === 'box-free');
    }
  });

  it('keep every default inside its limits and document every parameter', () => {
    for (const [id, expected] of Object.entries(ITEMS)) {
      const info = describeGeneratedControls(id)!;
      expect(info.controls.map((c) => c.key).sort()).toEqual([...expected.keys]);
      for (const control of info.controls) {
        expect(control.label.length).toBeGreaterThan(0);
        expect(control.description).toContain('Default:');
        expect(generatedControlValueError(control, control.default), `${id} ${control.key}`).toBeNull();
        expect(generatedControlValueError(control, {}), `${id} ${control.key}`).not.toBeNull();
        if (control.type === 'number') {
          expect(generatedControlValueError(control, Number.NaN)).not.toBeNull();
          expect(generatedControlValueError(control, control.min! - 1)).not.toBeNull();
          expect(generatedControlValueError(control, control.max! + 1)).not.toBeNull();
        }
        if (control.type === 'string') expect(generatedControlValueError(control, 'not-a-value')).not.toBeNull();
      }
      const motion = info.controls.filter((c) => c.group === 'motion').map((c) => c.key).sort();
      expect(motion).toEqual([...expected.motion]);
      expect(info.controls.find((c) => c.key === 'seed')).toMatchObject({ group: 'general' });
      expect(info.controls.find((c) => c.key === 'size')).toMatchObject({ group: 'appearance', unit: 'm' });
    }
  });

  it('never name a parameter after an instance setting the runtime reads itself (colour tint, material)', () => {
    for (const id of Object.keys(ITEMS)) {
      for (const key of generatedParamKeys(id)) expect(['color', 'material', 'zone', 'ride']).not.toContain(key);
    }
  });

  it('rest on sand, rock, mud or dirt or on the seabed, following the slope, a little sunk', () => {
    for (const id of Object.keys(ITEMS)) {
      const item = getCoreItem(id)!;
      expect(item.manifest.placement?.soils).toEqual(['sand', 'rock', 'mud', 'dirt']);
      // Under water they rest on the seabed, so standing in water is right for them (ITEMS-close-01).
      expect(item.manifest.placement?.stands).toEqual(['ground', 'built', 'water']);
      const look = itemGeneratedLook(item, 'realistic')!;
      const rule = restRule(item, look.generated.bounds);
      expect(rule.mode).toBe('tilt');
      expect(rule.sink).toBeGreaterThan(0);
      expect(look.generated.bounds.min[1]).toBe(0);
    }
  });

  it('state light triangle budgets for the nearest level', () => {
    expect(getCoreItem('genvr.core.tidewater.starfish')!.manifest.budget.triangles).toBeLessThanOrEqual(2000);
    expect(getCoreItem('genvr.core.tidewater.giant-clam')!.manifest.budget.triangles).toBeLessThanOrEqual(2500);
    expect(getCoreItem('genvr.core.tidewater.sea-shell')!.manifest.budget.triangles).toBeLessThanOrEqual(2500);
  });
});
