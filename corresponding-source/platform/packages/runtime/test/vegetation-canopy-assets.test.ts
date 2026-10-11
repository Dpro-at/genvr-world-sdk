import { afterEach, describe, expect, it, vi } from 'vitest';
import { BufferGeometry, MeshBasicMaterial, type WebGPURenderer } from 'three/webgpu';
import { ImpostorAtlas } from '../src/vegetation/impostor-atlas.js';
import { createCanopyAssets } from '../src/vegetation/canopy-assets.js';

const state = vi.hoisted(() => ({
  leafBake: vi.fn(),
  leafDispose: vi.fn(),
  materials: [] as { dispose(): void }[],
}));
vi.mock('../src/vegetation/leaf-atlas.js', () => ({
  LeafAtlas: class {
    bake = state.leafBake;
    dispose = state.leafDispose;
  },
}));
vi.mock('../src/vegetation/impostor-bake-material.js', () => ({
  createCanopyBakeMaterials: () => {
    const albedo = new MeshBasicMaterial(),
      normal = new MeshBasicMaterial();
    state.materials.push(albedo, normal);
    return { albedo, normal };
  },
}));
afterEach(() => {
  vi.restoreAllMocks();
  state.leafBake.mockReset();
  state.leafDispose.mockReset();
  state.materials.length = 0;
});
const renderer = () => ({ init: vi.fn().mockResolvedValue(undefined), dispose: vi.fn() });

describe('per-world canopy assets', () => {
  it('awaits atlas completion and releases all owned resources once without disposing renderer', async () => {
    let finish!: () => void;
    const bake = vi.spyOn(ImpostorAtlas.prototype, 'bake').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const geometryDispose = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const atlasDispose = vi.spyOn(ImpostorAtlas.prototype, 'dispose');
    const r = renderer();
    let ready = false;
    const pending = createCanopyAssets(r as unknown as WebGPURenderer).then((owner) => {
      ready = true;
      return owner;
    });
    await vi.waitFor(() => expect(bake).toHaveBeenCalledTimes(1));
    expect(ready).toBe(false);
    expect(state.leafBake).toHaveBeenCalledTimes(1);
    finish();
    const owner = await pending;
    expect(owner.impostor.groups.map((group) => group.variants.length)).toEqual([3, 2]);
    const materialDisposals = state.materials.map((material) => vi.spyOn(material, 'dispose'));
    owner.dispose();
    owner.dispose();
    expect(atlasDispose).toHaveBeenCalledTimes(1);
    expect(geometryDispose).toHaveBeenCalledTimes(7);
    expect(state.leafDispose).toHaveBeenCalledTimes(1);
    materialDisposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
    expect(r.dispose).not.toHaveBeenCalled();
  });
  it('releases allocations when asynchronous baking fails', async () => {
    vi.spyOn(ImpostorAtlas.prototype, 'bake').mockRejectedValue(new Error('GPU bake failed'));
    const geometryDispose = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const atlasDispose = vi.spyOn(ImpostorAtlas.prototype, 'dispose');
    const r = renderer();
    await expect(createCanopyAssets(r as unknown as WebGPURenderer)).rejects.toThrow('GPU bake failed');
    expect(geometryDispose).toHaveBeenCalledTimes(7);
    expect(atlasDispose).toHaveBeenCalledTimes(1);
    expect(state.leafDispose).toHaveBeenCalledTimes(1);
    expect(r.dispose).not.toHaveBeenCalled();
  });
  it('cleans the leaf atlas when its bake fails before other allocation', async () => {
    state.leafBake.mockImplementation(() => {
      throw new Error('Leaf failed');
    });
    await expect(createCanopyAssets(renderer() as unknown as WebGPURenderer)).rejects.toThrow('Leaf failed');
    expect(state.leafDispose).toHaveBeenCalledTimes(1);
    expect(state.materials).toHaveLength(0);
  });
});
