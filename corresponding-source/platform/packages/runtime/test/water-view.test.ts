import { describe, expect, it } from 'vitest';
import { WorldDocument } from '@genvr/contracts';
import { type Mesh, MeshStandardNodeMaterial, type WebGPURenderer } from 'three/webgpu';
import {
  bakeWaterDepth,
  DEFAULT_WATER_QUALITY,
  MAX_REFLECTING_BODIES,
  MAX_STORED_DEPTH,
  SOUND_SHORE_RES,
  polygonArea,
  waterGridGeometry,
  waveHeightAt,
  WaterView,
} from '../src/water-view.js';

describe('water depth map (P2-02 shores)', () => {
  // A beach: the ground rises from 4 m under the water at x = 0 to above it at x = 10.
  const beach = (x: number) => -4 + x * 0.5;
  const pond = {
    level: 0,
    area: [
      [0, 0],
      [10, 0],
      [10, 6],
      [0, 6],
    ] as Array<[number, number]>,
  };

  it('stores depth over the ground at about one meter per cell, zero where the ground is above', () => {
    const map = bakeWaterDepth(pond, (x) => beach(x));
    expect(map).toMatchObject({ minX: 0, minZ: 0, sizeX: 10, sizeZ: 6, width: 11, height: 7 });
    const at = (i: number) => (map.data[i]! / 255) * MAX_STORED_DEPTH;
    expect(at(0)).toBeCloseTo(4, 1);
    expect(at(4)).toBeCloseTo(2, 1);
    // From x = 8 the ground is at or above the water.
    expect(at(8)).toBe(0);
    expect(at(10)).toBe(0);
  });

  it('keeps big seas to a small map and clamps deep water', () => {
    const sea = {
      level: 0,
      area: [
        [-2000, -2000],
        [2000, -2000],
        [2000, 2000],
        [-2000, 2000],
      ] as Array<[number, number]>,
    };
    const map = bakeWaterDepth(sea, () => -50);
    expect(map.width).toBe(256);
    expect(map.height).toBe(256);
    expect(map.data.every((value) => value === 255)).toBe(true);
  });
});

describe('water surface grid (P2-39)', () => {
  const square = (r: number): Array<[number, number]> => [
    [-r, -r],
    [r, -r],
    [r, r],
    [-r, r],
  ];

  it('gives the surface inner vertices, so the waves have something to move', () => {
    const geometry = waterGridGeometry(square(10), 1);
    const count = geometry.getAttribute('position').count;
    // A 20 x 20 m square at one vertex per meter: 21 x 21 corners, far more than the 4 of a
    // polygon fan (which is why the old ShapeGeometry surface could never be displaced).
    expect(count).toBe(21 * 21);
    expect(geometry.getIndex()!.count).toBe(20 * 20 * 6);
  });

  it('holds world coordinates, with local y as world -z so the plane faces up', () => {
    const geometry = waterGridGeometry(square(4), 1);
    const position = geometry.getAttribute('position');
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < position.count; i += 1) {
      xs.push(position.getX(i));
      ys.push(position.getY(i));
      expect(position.getZ(i)).toBe(0);
    }
    expect(Math.min(...xs)).toBeCloseTo(-4, 5);
    expect(Math.max(...xs)).toBeCloseTo(4, 5);
    expect(Math.min(...ys)).toBeCloseTo(-4, 5);
    expect(Math.max(...ys)).toBeCloseTo(4, 5);
  });

  it('drops the cells a bent shape does not reach, and keeps the ring at the shore', () => {
    // An L shape: the top right quarter of a 20 x 20 square is missing.
    const bent: Array<[number, number]> = [
      [-10, -10],
      [10, -10],
      [10, 0],
      [0, 0],
      [0, 10],
      [-10, 10],
    ];
    const full = waterGridGeometry(square(10), 1).getIndex()!.count;
    const cut = waterGridGeometry(bent, 1).getIndex()!.count;
    expect(cut).toBeLessThan(full);
    // About three quarters of the area is left; the shore ring keeps it a little above that.
    expect(cut).toBeGreaterThan(full * 0.7);
    expect(cut).toBeLessThan(full * 0.9);
  });

  it('never grows past the cap, however big the sea or however fine the setting', () => {
    const huge = waterGridGeometry(square(4000), 1);
    expect(huge.getAttribute('position').count).toBe(193 * 193);
    // A pond keeps its own size at a coarse setting, down to a single cell.
    const tiny = waterGridGeometry(square(1), 0.25);
    expect(tiny.getAttribute('position').count).toBe(2 * 2);
  });
});

describe('wave height on the CPU (P2-39)', () => {
  it('matches itself at the same place and moment, and moves on with the clock', () => {
    expect(waveHeightAt(3, 4, 1)).toBe(waveHeightAt(3, 4, 1));
    expect(waveHeightAt(3, 4, 1)).not.toBe(waveHeightAt(3, 4, 1.4));
  });

  it('stays small enough to be a bob, not a ride', () => {
    let highest = 0;
    for (let t = 0; t < 20; t += 0.25)
      for (let x = -30; x < 30; x += 3) highest = Math.max(highest, Math.abs(waveHeightAt(x, x * 0.7, t)));
    // The four waves together can never lift a floating item more than their heights add up to.
    const total = 0.13 + 0.05 + 0.02 + 0.012;
    expect(highest).toBeLessThanOrEqual(total);
    expect(highest).toBeGreaterThan(0.05);
  });

  it('uses only as many waves as the quality asks for', () => {
    expect(waveHeightAt(2, 2, 0.5, 0)).toBe(0);
    expect(waveHeightAt(2, 2, 0.5, 1)).not.toBe(waveHeightAt(2, 2, 0.5, 4));
    // Asking for more than there are is the same as asking for all of them.
    expect(waveHeightAt(2, 2, 0.5, 99)).toBe(waveHeightAt(2, 2, 0.5, 4));
  });
});

describe('the reflection budget (P2-39)', () => {
  const square = (r: number, cx = 0, cz = 0): Array<[number, number]> => [
    [cx - r, cz - r],
    [cx + r, cz - r],
    [cx + r, cz + r],
    [cx - r, cz + r],
  ];

  it('measures how much ground a water body covers, whichever way it is wound', () => {
    expect(polygonArea(square(10))).toBeCloseTo(400, 5);
    expect(polygonArea([...square(10)].reverse())).toBeCloseTo(400, 5);
    expect(polygonArea(square(1.5))).toBeCloseTo(9, 5);
    // A triangle, to show it is not just bounding boxes.
    expect(
      polygonArea([
        [0, 0],
        [4, 0],
        [0, 6],
      ]),
    ).toBeCloseTo(12, 5);
  });

  it('only ever has two mirrors to give out', () => {
    expect(MAX_REFLECTING_BODIES).toBe(2);
    expect(DEFAULT_WATER_QUALITY.reflect).toBe(MAX_REFLECTING_BODIES);
  });
});

describe('the sea stays Gerstner without WebGPU (Tidewater plan task 2)', () => {
  const docWithSea = () =>
    WorldDocument.parse({
      schemaVersion: 1,
      experienceId: 'exp-test',
      version: 0,
      style: { base: 'realistic' },
      sizeTier: 'small',
      access: { mode: 'private' },
      environment: { sky: { preset: 'day' }, weather: { preset: 'clear' }, sea: { level: 2 } },
      terrain: {},
      spawn: { position: [0, 1, 0] },
    });
  const tidewaterQuality = { ...DEFAULT_WATER_QUALITY, ocean: 'tidewater' as const, oceanCascades: 4, oceanGrid: 64 };

  function seaMesh(view: WaterView) {
    return view.group.children.find((child) => child.name === 'water:sea') as Mesh | undefined;
  }

  it('keeps the Gerstner sea when the quality asks for Tidewater but no WebGPU renderer is attached', () => {
    const doc = docWithSea();
    const view = new WaterView(() => -5, 0x2266aa, 0.8, 100);
    view.setQuality(tidewaterQuality, doc);
    view.sync(doc);
    expect(view.tidewaterSea).toBeNull();
    expect(seaMesh(view)?.material).toBeInstanceOf(MeshStandardNodeMaterial);
    view.dispose();
  });

  it('a WebGL2 renderer is never used for the FFT sea', () => {
    const doc = docWithSea();
    const view = new WaterView(() => -5, 0x2266aa, 0.8, 100);
    view.setQuality(tidewaterQuality, doc);
    view.setRenderer({ backend: { isWebGPUBackend: false } } as unknown as WebGPURenderer, doc);
    view.sync(doc);
    expect(view.tidewaterSea).toBeNull();
    expect(seaMesh(view)?.material).toBeInstanceOf(MeshStandardNodeMaterial);
    view.dispose();
  });

  it('the Gerstner sea is built exactly as before at every phone and WebGL2 quality', () => {
    const doc = docWithSea();
    for (const quality of [DEFAULT_WATER_QUALITY, { ...DEFAULT_WATER_QUALITY, ocean: 'gerstner' as const }]) {
      const view = new WaterView(() => -5, 0x2266aa, 0.8, 100);
      view.setQuality(quality, doc);
      view.sync(doc);
      const mesh = seaMesh(view)!;
      expect(mesh.position.y).toBeCloseTo(2.02, 6);
      expect(mesh.rotation.x).toBeCloseTo(-Math.PI / 2, 6);
      view.dispose();
    }
  });

  it('phones and WebGL2 still hear the surf: a shore field is solved for the sound alone (Tidewater plan task 6)', async () => {
    const doc = docWithSea();
    // a beach rising towards -z through the sea level (2 m)
    const view = new WaterView((_x, z) => 2 - z * 0.08, 0x2266aa, 0.8, 100);
    view.setQuality(DEFAULT_WATER_QUALITY, doc);
    view.sync(doc);
    expect(view.tidewaterSea).toBeNull();
    expect(view.surfGround()?.level).toBe(2);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const shore = view.surfShore();
    expect(shore?.field.res).toBe(SOUND_SHORE_RES);
    expect(shore?.level).toBe(2);
    expect(shore?.period).toBe(9);
    // the same object until something changes (the scheduler keeps its stations)
    view.sync(doc);
    expect(view.surfShore()).toBe(shore);
    view.dispose();
  });

  it('a place without a sea has no surf', () => {
    const doc = docWithSea();
    const dry = WorldDocument.parse({ ...doc, environment: { ...doc.environment, sea: undefined } });
    const view = new WaterView(() => -5, 0x2266aa, 0.8, 100);
    view.sync(dry);
    expect(view.surfGround()).toBeNull();
    expect(view.surfShore()).toBeNull();
    view.dispose();
  });
});
