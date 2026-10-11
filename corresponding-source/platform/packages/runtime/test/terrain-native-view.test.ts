import { describe, expect, it } from 'vitest';
import { TerrainActiveSurface } from '@genvr/contracts';
import { resolveTerrainSurface, terrainSurfaceSoil } from '@genvr/core-library';
import { TerrainFieldStore, encodeTerrainFieldTile, terrainFieldFloat32Bytes } from '@genvr/world';
import { PerspectiveCamera } from 'three/webgpu';
import { NativeTerrainView, validateNativeSurface } from '../src/terrain-native/view.js';

function fixture() {
  const descriptor = {
    schemaVersion: 1 as const,
    id: 'native',
    origin: [-8, -8] as [number, number],
    spacing: 1,
    width: 8,
    height: 8,
    sampling: 'cell-center' as const,
    channels: [
      { id: 'height', encoding: 'f32le' as const, range: [-2, 2] as [number, number] },
      { id: 'sand', encoding: 'u8' as const },
    ],
    heightBinding: { channel: 'height', offset: 20 },
  };
  const store = new TerrainFieldStore(descriptor);
  store.replace(
    encodeTerrainFieldTile(descriptor, {
      tx: 0,
      tz: 0,
      channels: {
        height: terrainFieldFloat32Bytes(Float32Array.from({ length: 64 }, (_, i) => i / 64 - 2)),
        sand: new Uint8Array(64).fill(200),
      },
    }),
    store.revision,
  );
  const surface = TerrainActiveSurface.parse({
    setId: 'native',
    outsideHeight: -70,
    edge: 'constant',
    farEdge: 'exclusive',
    materialBindings: [
      {
        itemId: 'genvr.core.ground.tidewater-beach-sand',
        inputs: { coverage: { channel: 'sand', scale: 1 / 255 } },
      },
    ],
  });
  return { store, surface };
}
describe('native terrain visual provider', () => {
  it('classifies interaction soil through declared resource roles, independently of visual masks', () => {
    const { store, surface } = fixture();
    const profile = resolveTerrainSurface(store.descriptor, surface);
    expect(terrainSurfaceSoil(profile, () => null, 19, 20, 0, 0)).toBe('sand');
    expect(terrainSurfaceSoil(profile, () => 0, 21, 20, 0, 0)).toBe('grass');
    expect(terrainSurfaceSoil(profile, () => 200, 21, 20, 0, 0)).toBe('sand');
    const rocky = resolveTerrainSurface(store.descriptor, {
      ...surface,
      materialBindings: [
        {
          itemId: 'genvr.core.ground.tidewater-rock',
          inputs: { coverage: { channel: 'sand', scale: 0 }, scarp: { channel: 'sand', scale: 1 / 255 } },
        },
      ],
    });
    expect(terrainSurfaceSoil(rocky, () => 200, 21, 20, 0, 0)).toBe('rock');
    expect(terrainSurfaceSoil(rocky, () => NaN, 21, 20, 0, 0)).toBe('grass');
  });
  it('rejects unsupported live grids and implicit or invalid resource inputs', () => {
    const { store, surface } = fixture();
    expect(resolveTerrainSurface(store.descriptor, surface)).toMatchObject({ size: 8, levels: 1 });
    expect(() => validateNativeSurface(store, surface)).not.toThrow();
    expect(() => resolveTerrainSurface({ ...store.descriptor, origin: [1, 1] }, surface)).toThrow('aligned');
    expect(() => resolveTerrainSurface({ ...store.descriptor, sampling: 'vertex' }, surface)).toThrow('cell');
    expect(() =>
      resolveTerrainSurface(
        { ...store.descriptor, heightBinding: { channel: 'height', offset: 450 } },
        surface,
      ),
    ).toThrow('bounds');
    expect(() =>
      resolveTerrainSurface(
        { ...store.descriptor, channels: [{ id: 'height', encoding: 'f32le' }] },
        surface,
      ),
    ).toThrow('range');
    expect(() =>
      resolveTerrainSurface({ ...store.descriptor, width: 4096, height: 4096, spacing: 128 }, surface),
    ).toThrow('levels');
    expect(() => resolveTerrainSurface(store.descriptor, { ...surface, materialBindings: [] })).toThrow(
      'explicit',
    );
    for (const inputs of [
      {},
      { coverage: { channel: 'missing', scale: 1 } },
      { coverage: { channel: 'sand', scale: -1 } },
      { coverage: { channel: 'sand', scale: 1 }, bogus: { channel: 'sand', scale: 1 } },
    ])
      expect(() =>
        resolveTerrainSurface(store.descriptor, {
          ...surface,
          materialBindings: [{ itemId: 'genvr.core.ground.tidewater-beach-sand', inputs }],
        }),
      ).toThrow();
    expect(() =>
      resolveTerrainSurface(store.descriptor, {
        ...surface,
        materialBindings: [{ itemId: 'genvr.core.crate', inputs: {} }],
      }),
    ).toThrow('resource');
  });
  it('creates exact native geometry with cached material switching and idempotent disposal', async () => {
    const { store, surface } = fixture();
    const view = await NativeTerrainView.create(store, surface, { yieldControl: async () => {} });
    expect(view.gpu.textures.get('height')!.image.data![0]).toBe(-2);
    expect(view.seaLevel.value).toBe(20);
    expect(view.lod.G).toBe(40);
    const source = view.material,
      fallback = view.fallbackMaterial;
    view.setSourceMaterial(false);
    expect(view.material).toBe(fallback);
    view.setSourceMaterial(true);
    expect(view.material).toBe(source);
    expect(fallback.positionNode).toBe(source.positionNode);
    const camera = new PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.set(0, 30, 10);
    camera.lookAt(-4, 18, -4);
    camera.updateMatrixWorld();
    view.update(camera, 25);
    expect(view.seaLevel.value).toBe(25);
    let disposed = 0;
    source.addEventListener('dispose', () => disposed++);
    fallback.addEventListener('dispose', () => disposed++);
    view.dispose();
    view.dispose();
    view.update(camera);
    view.setSourceMaterial(true);
    expect(disposed).toBe(2);
    expect(view.group.children).toHaveLength(0);
    expect(view.gpu.textures.size).toBe(0);
  });
  it('supports explicit simplified material without building source WGSL and guards cancellation/revision', async () => {
    const { store, surface } = fixture();
    const view = await NativeTerrainView.create(store, surface, {
      sourceMaterial: false,
      yieldControl: async () => {},
    });
    expect(view.sourceMaterial).toBeNull();
    view.setSourceMaterial(true);
    expect(view.material).toBe(view.fallbackMaterial);
    view.dispose();
    const abort = new AbortController();
    abort.abort();
    await expect(NativeTerrainView.create(store, surface, { signal: abort.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    let yields = 0;
    await expect(
      NativeTerrainView.create(store, surface, {
        yieldControl: async () => {
          if (++yields === 2) store.restore(0, 0, null, store.revision);
        },
      }),
    ).rejects.toThrow('changed');
  });
});
