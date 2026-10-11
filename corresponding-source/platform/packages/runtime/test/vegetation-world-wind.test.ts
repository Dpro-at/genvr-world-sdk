import { describe, expect, it, vi } from 'vitest';
import { TSL, Vector2 } from 'three/webgpu';
import { TerrainActiveSurface } from '@genvr/contracts';
import { TerrainFieldStore, encodeTerrainFieldTile, terrainFieldFloat32Bytes } from '@genvr/world';
import { TidewaterWorldWind } from '../src/vegetation/world-wind.js';
import { TidewaterGround } from '../src/tidewater-ground/index.js';
import { NativeTerrainView } from '../src/terrain-native/view.js';

const terrain = { half: 4, heightAt: () => 1 };
describe('shared world vegetation and ground wind', () => {
  it('advances one source phase while consumers rebuild without resetting or double advancing it', () => {
    const direction = TSL.uniform(new Vector2(1, 0)), speed = TSL.uniform(7);
    const wind = new TidewaterWorldWind({ windDirection: direction, windSpeed: speed });
    const first = new TidewaterGround(terrain, undefined, wind);
    expect(first.detail).toBe(wind.detail); expect(first.gustOffset).toBe(wind.gustOffset);
    wind.update(2); first.update(0, 2);
    expect(wind.gustOffset.value.x).toBeCloseTo(12.8);
    first.dispose();
    const second = new TidewaterGround(terrain, undefined, wind);
    direction.value.set(0, 1); speed.value = 3;
    wind.update(1); second.update(0, 1);
    expect(wind.gustOffset.value.x).toBeCloseTo(12.8);
    expect(wind.gustOffset.value.y).toBeCloseTo(3.6);
    expect(second.detail).toBe(first.detail);
    second.dispose(); wind.dispose();
  });
  it('owns exactly one texture and preserves standalone ground ownership', () => {
    const wind = new TidewaterWorldWind(), disposed = vi.fn();
    wind.detail.addEventListener('dispose', disposed);
    const ground = new TidewaterGround(terrain, undefined, wind);
    ground.dispose(); expect(disposed).not.toHaveBeenCalled();
    wind.dispose(); wind.dispose(); expect(disposed).toHaveBeenCalledTimes(1);
    const before = wind.gustOffset.value.clone(); wind.update(1);
    expect(wind.gustOffset.value).toEqual(before);
    const standalone = new TidewaterGround(terrain), owned = vi.fn();
    standalone.detail.addEventListener('dispose', owned);
    standalone.update(0, 1); expect(standalone.gustOffset.value.length()).toBeCloseTo(6.4);
    standalone.dispose(); standalone.dispose(); expect(owned).toHaveBeenCalledTimes(1);
  });
  it('native ground borrows the same texture and leaves its lifetime to the world', async () => {
    const descriptor = { schemaVersion: 1 as const, id: 'wind', origin: [-8, -8] as [number, number],
      spacing: 1, width: 8, height: 8, sampling: 'cell-center' as const,
      channels: [{ id: 'height', encoding: 'f32le' as const, range: [-2, 2] as [number, number] }, { id: 'sand', encoding: 'u8' as const }],
      heightBinding: { channel: 'height', offset: 0 } };
    const store = new TerrainFieldStore(descriptor);
    store.replace(encodeTerrainFieldTile(descriptor, { tx: 0, tz: 0, channels: {
      height: terrainFieldFloat32Bytes(new Float32Array(64)), sand: new Uint8Array(64).fill(255),
    } }), store.revision);
    const surface = TerrainActiveSurface.parse({ setId: 'wind', outsideHeight: -70, edge: 'constant', farEdge: 'exclusive',
      materialBindings: [{ itemId: 'genvr.core.ground.tidewater-beach-sand', inputs: { coverage: { channel: 'sand', scale: 1 / 255 } } }] });
    const wind = new TidewaterWorldWind(), disposed = vi.fn(); wind.detail.addEventListener('dispose', disposed);
    const native = await NativeTerrainView.create(store, surface, { providers: { detailTexture: wind.detail,
      gustOffset: wind.gustOffset, windDirection: wind.windDirection, windSpeed: wind.windSpeed } });
    native.dispose(); expect(disposed).not.toHaveBeenCalled();
    wind.update(1); expect(wind.gustOffset.value.length()).toBeCloseTo(6.4);
    wind.dispose(); expect(disposed).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid time steps before changing the phase', () => {
    const wind = new TidewaterWorldWind();
    expect(() => wind.update(-1)).toThrow('time step'); expect(() => wind.update(NaN)).toThrow('time step');
    expect(wind.gustOffset.value.length()).toBe(0); wind.dispose();
  });
});
