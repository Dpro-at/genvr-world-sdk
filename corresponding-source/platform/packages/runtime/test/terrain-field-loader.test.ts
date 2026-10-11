import { describe, expect, it, vi } from 'vitest';
import {
  TerrainFieldDescriptor,
  type TerrainFieldSetMetadata,
  type TerrainFieldTile,
} from '@genvr/contracts';
import { encodeTerrainFieldTile, TerrainFieldSampler } from '@genvr/world';
import {
  hydrateTerrainFieldSet,
  type TerrainFieldPageLoader,
  type TerrainFieldPageRequest,
} from '../src/terrain-field-loader.js';

function fixture(width = 257, height = 257) {
  const descriptor = TerrainFieldDescriptor.parse({
    schemaVersion: 1,
    id: 'generic',
    origin: [-17, 29],
    spacing: 1,
    sampling: 'vertex',
    width,
    height,
    channels: [
      { id: 'height', encoding: 'f32le', range: [-1000, 1000] },
      { id: 'sand', encoding: 'u8' },
    ],
  });
  const tiles: TerrainFieldTile[] = [];
  for (let tz = 0; tz < Math.ceil(height / 128); tz++)
    for (let tx = 0; tx < Math.ceil(width / 128); tx++) {
      const cols = Math.min(128, width - tx * 128),
        rows = Math.min(128, height - tz * 128),
        raw = new Uint8Array(cols * rows * 4),
        mask = new Uint8Array(cols * rows),
        view = new DataView(raw.buffer);
      for (let z = 0; z < rows; z++)
        for (let x = 0; x < cols; x++) {
          const index = z * cols + x;
          view.setFloat32(index * 4, tx * 128 + x + (tz * 128 + z) * 0.5, true);
          mask[index] = (tx * 128 + x) % 256;
        }
      tiles.push(encodeTerrainFieldTile(descriptor, { tx, tz, channels: { height: raw, sand: mask } }));
    }
  const metadata: TerrainFieldSetMetadata = {
    descriptor,
    tiles: tiles.map((t) => `${t.tx},${t.tz}`).reverse(),
  };
  const loadPage: TerrainFieldPageLoader = async (request) => ({
    version: request.version,
    tiles: request.coordinates.map((c) => tiles.find((t) => t.tx === c.tx && t.tz === c.tz)!).reverse(),
  });
  return { metadata, tiles, loadPage };
}
describe('asynchronous complete terrain field hydration', () => {
  it.each(['scheduler', 'progress'] as const)(
    'propagates %s callback failure without publishing a store',
    async (failure) => {
      const f = fixture(129, 1),
        error = new Error('caller failed');
      let published = false;
      const loading = hydrateTerrainFieldSet(f.metadata, 1, f.loadPage, {
        yieldControl: async () => {
          if (failure === 'scheduler') throw error;
        },
        onProgress: (p) => {
          if (failure === 'progress' && p.loaded === 1) throw error;
        },
      }).then((store) => {
        published = true;
        return store;
      });
      await expect(loading).rejects.toBe(error);
      expect(published).toBe(false);
    },
  );
  it('loads bounded ordered pages, yields per tile and preserves cross-tile interpolation and raw bytes', async () => {
    const f = fixture(),
      requests: TerrainFieldPageRequest[] = [],
      progress: number[] = [];
    let yields = 0;
    const store = await hydrateTerrainFieldSet(
      f.metadata,
      7,
      async (r) => {
        requests.push(r);
        expect(Object.isFrozen(r.coordinates)).toBe(true);
        return f.loadPage(r);
      },
      {
        yieldControl: async () => {
          yields++;
        },
        onProgress: (p) => progress.push(p.loaded),
      },
    );
    expect(requests.map((r) => r.coordinates.length)).toEqual([8, 1]);
    expect(requests[0]!.coordinates[0]).toEqual({ tx: 0, tz: 0 });
    expect(yields).toBe(11);
    expect(progress).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(store.complete).toBe(true);
    for (const tile of f.tiles) expect(store.getTile(tile.tx, tile.tz)).toEqual(tile);
    const sampler = new TerrainFieldSampler(store);
    expect(sampler.sample('height', -17 + 127.5, 29 + 127.5)).toBe(191.25);
    expect(sampler.sample('height', 239, 285)).toBe(384);
    expect(sampler.sample('sand', -17 + 127.5, 29)).toBe(127.5);
  });
  it('rejects incomplete or invalid metadata before requesting any data', async () => {
    const f = fixture(),
      load = vi.fn(f.loadPage);
    await expect(
      hydrateTerrainFieldSet({ ...f.metadata, tiles: f.metadata.tiles.slice(1) }, 1, load),
    ).rejects.toThrow('incomplete');
    await expect(hydrateTerrainFieldSet({ ...f.metadata, tiles: ['0,0', '0,0'] }, 1, load)).rejects.toThrow();
    await expect(hydrateTerrainFieldSet(f.metadata, -1, load)).rejects.toThrow('version');
    expect(load).not.toHaveBeenCalled();
  });
  it.each([
    'version',
    'missing',
    'excessive',
    'duplicate',
    'unrequested',
    'wrong-set',
    'channel',
    'range',
  ] as const)('rejects %s pages instead of exposing partial data', async (kind) => {
    const f = fixture(129, 1);
    const load: TerrainFieldPageLoader = async (r) => {
      const response = await f.loadPage(r);
      const tiles = structuredClone(response.tiles) as TerrainFieldTile[];
      if (kind === 'version') return { ...response, version: r.version + 1 };
      if (kind === 'missing') tiles.pop();
      if (kind === 'excessive') tiles.push(tiles[0]!);
      if (kind === 'duplicate') tiles[1] = tiles[0]!;
      if (kind === 'unrequested') tiles[0]!.tx = 2;
      if (kind === 'wrong-set') tiles[0]!.setId = 'other';
      if (kind === 'channel') tiles[0]!.channels = { sand: 'AA==' };
      if (kind === 'range') {
        const b = new Uint8Array(4);
        new DataView(b.buffer).setFloat32(0, Infinity, true);
        tiles[0]!.channels.height = Buffer.from(b).toString('base64');
      }
      return { version: r.version, tiles };
    };
    await expect(
      hydrateTerrainFieldSet(f.metadata, 2, load, { yieldControl: async () => {} }),
    ).rejects.toThrow();
  });
  it('defaults to actual task yields before loading', async () => {
    const f = fixture(1, 1);
    let timerRan = false;
    setTimeout(() => {
      timerRan = true;
    }, 0);
    const store = await hydrateTerrainFieldSet(f.metadata, 1, async (r) => {
      expect(timerRan).toBe(true);
      return f.loadPage(r);
    });
    expect(store.complete).toBe(true);
  });
  it('rejects a second-page snapshot change after the first page was decoded', async () => {
    const f = fixture();
    let pages = 0,
      loaded = 0;
    await expect(
      hydrateTerrainFieldSet(
        f.metadata,
        3,
        async (r) => ({ ...(await f.loadPage(r)), version: ++pages === 2 ? 4 : 3 }),
        { yieldControl: async () => {}, onProgress: (p) => (loaded = p.loaded) },
      ),
    ).rejects.toThrow('version conflict');
    expect(loaded).toBe(8);
  });
  it.each(['initial', 'yield', 'request', 'progress'] as const)(
    'honors abort at %s without returning a partial store',
    async (when) => {
      const f = fixture(129, 1),
        controller = new AbortController();
      if (when === 'initial') controller.abort();
      const load = vi.fn(async (r: TerrainFieldPageRequest, signal?: AbortSignal) => {
        expect(signal).toBe(controller.signal);
        if (when === 'request') controller.abort();
        return f.loadPage(r);
      });
      await expect(
        hydrateTerrainFieldSet(f.metadata, 1, load, {
          signal: controller.signal,
          yieldControl: async () => {
            if (when === 'yield') controller.abort();
          },
          onProgress: (p) => {
            if (when === 'progress' && p.loaded === 1) controller.abort();
          },
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });
      if (when === 'initial' || when === 'yield') expect(load).not.toHaveBeenCalled();
    },
  );
  it('snapshots caller metadata and page objects across yields', async () => {
    const f = fixture(129, 1);
    let returned = false;
    const store = await hydrateTerrainFieldSet(
      f.metadata,
      4,
      async (r) => {
        const result = await f.loadPage(r);
        returned = true;
        return result;
      },
      {
        yieldControl: async () => {
          if (returned) {
            f.metadata.descriptor.origin[0] = 999;
            f.tiles[0]!.channels.height = 'AAAA';
          }
        },
      },
    );
    expect(store.complete).toBe(true);
    expect(store.descriptor.origin).toEqual([-17, 29]);
    expect(store.readValue('height', 0, 0)).toBe(0);
  });
});
