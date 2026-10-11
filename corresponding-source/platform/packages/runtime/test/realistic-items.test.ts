import { describe, expect, it } from 'vitest';
import { coreModelPackage, ItemPackages } from '../src/item-packages.js';
import { resolveItem } from '../src/items.js';

describe('real 3D models of Core items (P2-38)', () => {
  it('makes a package from the library look, with its levels', () => {
    const pkg = coreModelPackage('genvr.core.tree.pine')!;
    expect(pkg.manifest.entry.model).toBe('lod0.glb');
    expect(pkg.manifest.entry.lods).toEqual(['lod1.glb', 'lod2.glb']);
    expect(pkg.files[0]!.url).toMatch(/^\/models\/realistic\/.+\/lod0\.glb$/);
    expect(coreModelPackage('genvr.core.crate')).toBeNull();
  });

  it('keeps the blocky parts in blocky places and while the model loads', () => {
    const models = new ItemPackages(async () => null);
    const blocky = resolveItem('genvr.core.tree.pine', undefined, 'blocky', models);
    expect(blocky.parts.length).toBeGreaterThan(0);
    const loading = resolveItem('genvr.core.tree.pine', undefined, 'realistic', models);
    expect(loading.parts.length).toBeGreaterThan(0);
  });

  it('shows a placeholder for a Realistic-only item until its model arrives', () => {
    const models = new ItemPackages(async () => null);
    const oak = resolveItem('genvr.core.oak-tree', undefined, 'realistic', models);
    // The placeholder box of items whose model is not there yet.
    expect(oak.parts.map((part) => part.shape)).toEqual(['box']);
  });
});
