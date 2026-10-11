import type { WorldSeed } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { decodeChunk, encodeChunk, insidePolygon, TerrainData } from '../src/terrain-data.js';
import { doorSpots } from '../src/walls.js';

/** Rough starter ground (P2-43): mountains give plenty of slope to measure a coarse step against. */
function bumpyTerrainForTest(): TerrainData {
  const half = 250;
  const terrain = new TerrainData(half, 64, 32);
  const world: WorldSeed = { seed: 3, kind: 'mountains', generator: 1 };
  terrain.world = world;
  return terrain;
}

const square = (cx: number, cz: number, r: number) =>
  [
    [cx - r, cz - r],
    [cx + r, cz - r],
    [cx + r, cz + r],
    [cx - r, cz + r],
  ] as const;

describe('insidePolygon', () => {
  it('detects points inside and outside', () => {
    expect(insidePolygon(0, 0, square(0, 0, 5))).toBe(true);
    expect(insidePolygon(6, 0, square(0, 0, 5))).toBe(false);
  });
});

describe('TerrainData', () => {
  it('starts flat', () => {
    const terrain = new TerrainData(250);
    expect(terrain.heightAt(10, -20)).toBe(0);
  });

  it('raises only inside the area', () => {
    const terrain = new TerrainData(250);
    terrain.sculpt(square(0, 0, 10), 'raise', 1);
    expect(terrain.heightAt(0, 0)).toBeCloseTo(1);
    expect(terrain.heightAt(30, 30)).toBe(0);
  });

  it('keeps shared chunk borders identical', () => {
    const terrain = new TerrainData(250, 64, 32);
    // Area straddling the border between chunk 0 and chunk -1 at x = 0.
    const touched = terrain.sculpt(square(0, 10, 8), 'raise', 0.7);
    expect(touched.has('0,0')).toBe(true);
    expect(touched.has('-1,0')).toBe(true);
    const right = terrain.getChunk(0, 0);
    const left = terrain.getChunk(-1, 0);
    const edge = terrain.edge;
    for (let iz = 0; iz < edge; iz += 1) {
      expect(right.heights[iz * edge]).toBe(left.heights[iz * edge + edge - 1]);
    }
  });

  it('interpolates between vertices', () => {
    const terrain = new TerrainData(250, 64, 32);
    terrain.sculpt(square(4, 0, 0.5), 'raise', 1); // single vertex at x = 4
    expect(terrain.heightAt(4, 0)).toBeCloseTo(1);
    expect(terrain.heightAt(3, 0)).toBeCloseTo(0.5);
  });

  it('flattens toward a target height and smooths peaks', () => {
    const terrain = new TerrainData(250);
    terrain.sculpt(square(0, 0, 10), 'raise', 1);
    terrain.sculpt(square(0, 0, 10), 'flatten', 1, 3);
    expect(terrain.heightAt(0, 0)).toBeCloseTo(3);

    terrain.sculpt(square(20, 20, 0.5), 'raise', 1);
    const before = terrain.heightAt(20, 20);
    terrain.sculpt(square(20, 20, 0.5), 'smooth', 1);
    expect(terrain.heightAt(20, 20)).toBeLessThan(before);
  });

  it('paints soil and rejects unknown soils', () => {
    const terrain = new TerrainData(250);
    terrain.paint(square(0, 0, 3), 'sand');
    const chunk = terrain.getChunk(0, 0);
    expect(chunk.soils[0]).toBe(2);
    expect(() => terrain.paint(square(0, 0, 3), 'lava' as never)).toThrow();
  });

  it('never edits outside the playable area', () => {
    const terrain = new TerrainData(64, 64, 32);
    const touched = terrain.sculpt(square(500, 500, 10), 'raise', 1);
    expect(touched.size).toBe(0);
  });

  it('round-trips chunks through the storage encoding', () => {
    const terrain = new TerrainData(250);
    terrain.sculpt(square(5, 5, 6), 'raise', 0.8);
    terrain.paint(square(5, 5, 6), 'rock');
    const chunk = terrain.getChunk(0, 0);
    const decoded = decodeChunk(encodeChunk(chunk));
    expect(decoded.cx).toBe(0);
    expect(Array.from(decoded.heights)).toEqual(Array.from(chunk.heights));
    expect(Array.from(decoded.soils)).toEqual(Array.from(chunk.soils));
  });
});

describe('slope and door helpers (P2-11)', () => {
  it('finds steep places, one per cell, with their slope', () => {
    const terrain = new TerrainData(100);
    expect(terrain.steepCells(1)).toEqual([]);
    // A 3 m cliff: raise a square without any slope limit.
    for (let i = 0; i < 3; i++) terrain.sculpt(square(0, 0, 6), 'raise', 1);
    const cells = terrain.steepCells(terrain.spacing * Math.tan((40 * Math.PI) / 180));
    expect(cells.length).toBeGreaterThan(0);
    expect(Math.max(...cells.map((c) => c.degrees))).toBe(56); // atan(3 / 2)
    expect(new Set(cells.map((c) => `${Math.floor(c.x / 16)},${Math.floor(c.z / 16)}`)).size).toBe(
      cells.length,
    );
  });

  it('places doors on their wall with the sill at the room floor (5 cm over the ground)', () => {
    const wall = {
      id: 'w',
      points: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ] as [number, number][],
      height: 3,
      closed: true,
      openings: [
        { id: 'd', kind: 'door' as const, segment: 0, offset: 4, width: 1.2, height: 2.2, bottom: 0 },
        { id: 'win', kind: 'window' as const, segment: 1, offset: 5, width: 1.4, height: 1.2, bottom: 1 },
      ],
    };
    expect(doorSpots(wall, () => 0.5)).toEqual([
      { wallId: 'w', openingId: 'd', x: 4, z: 0, sill: 0.55, normal: [expect.closeTo(0), 1], width: 1.2 },
    ]);
  });
});

describe('drawnHeightAt (P2-43)', () => {
  it('draws at step 1 exactly the height it measures, and says how far a coarse step is off', () => {
    const terrain = bumpyTerrainForTest();
    for (let i = 0; i < 500; i += 1) {
      const x = (i * 7.3) % 250;
      const z = (i * 13.1) % 250;
      expect(Math.abs(terrain.drawnHeightAt(x, z, 1) - terrain.heightAt(x, z))).toBeLessThan(1e-5);
    }
    let worst = 0;
    for (let i = 0; i < 500; i += 1) {
      const x = (i * 7.3) % 250;
      const z = (i * 13.1) % 250;
      worst = Math.max(worst, Math.abs(terrain.drawnHeightAt(x, z, 4) - terrain.heightAt(x, z)));
    }
    expect(worst).toBeGreaterThan(0.05); // the fault from the owner's picture, measured
  });
});
