import { readdirSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CORE_ITEMS,
  EXPERIMENTAL_ITEMS,
  LIBRARY,
  generatedParamKeys,
  getCoreItem,
  isGeneratedLook,
  isModelLook,
  itemBlocksForStyle,
  itemBoundsForStyle,
  itemGeneratedLook,
  itemModelLook,
  itemParts,
} from '../src/index.js';

const TEST_BOX = 'genvr.core.tidewater.test-box';

describe('generated looks (Tidewater world, decision 130)', () => {
  it('the test box is a Realistic-only item drawn by a runtime generator', () => {
    const item = getCoreItem(TEST_BOX)!;
    expect(item).toBeDefined();
    expect(item.manifest.styles).toEqual(['realistic']);
    expect(item.experimental).toBe(true);
    expect(item.world).toBe('tidewater');
    const look = itemGeneratedLook(item, 'realistic')!;
    expect(isGeneratedLook(look)).toBe(true);
    expect(isModelLook(look)).toBe(false);
    expect(look.generated.generator).toBe('genvr.test-box');
    expect(look.generated.source.license).toBe('MIT');
  });

  it('has no parts and no model look, so other styles and the model loader leave it alone', () => {
    const item = getCoreItem(TEST_BOX)!;
    expect(item.parts).toEqual([]);
    expect(itemParts(item, 'realistic')).toEqual([]);
    expect(itemModelLook(item, 'realistic')).toBeNull();
    expect(itemGeneratedLook(item, 'blocky')).toBeNull();
  });

  it('measures its bounds and blocks from the generated look', () => {
    const item = getCoreItem(TEST_BOX)!;
    const look = itemGeneratedLook(item, 'realistic')!;
    expect(itemBoundsForStyle(item, 'realistic')).toEqual(look.generated.bounds);
    // Other styles fall back to the generated bounds, like Realistic-only model items.
    expect(itemBoundsForStyle(item, 'blocky')).toEqual(look.generated.bounds);
    expect(itemBlocksForStyle(item, 'realistic')).toBeNull();
  });

  it('every default parameter is inside its own limits', () => {
    // Experimental and opened generated items alike (the palm and the sea life are in CORE_ITEMS).
    for (const item of [...EXPERIMENTAL_ITEMS, ...CORE_ITEMS.filter((entry) => entry.world === 'tidewater')]) {
      const look = itemGeneratedLook(item, 'realistic');
      if (!look) continue;
      const { params, limits } = look.generated;
      expect(Object.keys(params).length).toBeLessThanOrEqual(16);
      for (const [key, value] of Object.entries(params)) {
        const limit = limits[key]!;
        expect(limit, key).toBeDefined();
        if (typeof value === 'number') {
          if (limit.min !== undefined) expect(value).toBeGreaterThanOrEqual(limit.min);
          if (limit.max !== undefined) expect(value).toBeLessThanOrEqual(limit.max);
        }
        if (typeof value === 'string') expect(limit.values).toContain(value);
      }
    }
  });

  it('lists the generator parameter names of an item (empty for ordinary items)', () => {
    expect(generatedParamKeys(TEST_BOX)).toEqual(['depth', 'height', 'seed', 'width']);
    expect(generatedParamKeys('genvr.core.crate')).toEqual([]);
    expect(generatedParamKeys('no.such.item')).toEqual([]);
  });

  it('experimental items stay out of the catalog and the library until they are opened (one change)', () => {
    expect(EXPERIMENTAL_ITEMS.length).toBeGreaterThan(0);
    for (const item of EXPERIMENTAL_ITEMS) {
      expect(item.experimental).toBe(true);
      expect(item.world).toBe('tidewater');
      expect(item.manifest.id.startsWith('genvr.core.tidewater.')).toBe(true);
      expect(CORE_ITEMS).not.toContain(item);
      expect(LIBRARY).not.toContain(item);
      expect(getCoreItem(item.manifest.id)).toBe(item);
    }
  });

  it('keeps each experimental item in 3d-models/tidewater/<subcategory>/<slug>.ts, all registered', async () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', '3d-models', 'tidewater');
    const files = readdirSync(root)
      .filter((name) => statSync(join(root, name)).isDirectory())
      .flatMap((sub) => readdirSync(join(root, sub)).map((name) => join(root, sub, name)));
    const registered = [...EXPERIMENTAL_ITEMS, ...CORE_ITEMS.filter(item => item.world === 'tidewater')];
    expect(files.length).toBe(registered.length);
    for (const file of files) {
      const { default: item } = (await import(pathToFileURL(file).href)) as {
        default: (typeof EXPERIMENTAL_ITEMS)[number];
      };
      expect(item.manifest.subcategory).toBe(basename(dirname(file)));
      expect(item.manifest.id).toBe(`genvr.core.tidewater.${basename(file, '.ts')}`);
      expect(registered).toContain(item);
    }
  });
});
