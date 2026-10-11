import { describe, expect, it } from 'vitest';
import { DRAW_DISTANCE } from '../src/scatter-view.js';
import { addSkirt, stepForChunk } from '../src/terrain-view.js';

describe('terrain detail where things are drawn (P2-43)', () => {
  it('draws every chunk that scatter reaches at full detail', () => {
    // A 64 m chunk whose nearest edge is 120 m away: scatter draws trees there.
    expect(stepForChunk([120, 0, 184, 64], 0, 0, DRAW_DISTANCE)).toBe(1);
  });
  it('coarsens only beyond it', () => {
    expect(stepForChunk([200, 0, 264, 64], 0, 0, DRAW_DISTANCE)).toBe(2);
    expect(stepForChunk([400, 0, 464, 64], 0, 0, DRAW_DISTANCE)).toBe(4);
  });
});

/** A flat count x count grid at unit spacing, wired exactly as `chunkGeometryArrays` builds one. */
function flatGrid(count: number) {
  const positions = new Float32Array(count * count * 3);
  let p = 0;
  for (let iz = 0; iz < count; iz += 1) {
    for (let ix = 0; ix < count; ix += 1) {
      positions[p++] = ix;
      positions[p++] = 0;
      positions[p++] = iz;
    }
  }
  const indices = new Uint32Array((count - 1) * (count - 1) * 6);
  let i = 0;
  for (let z = 0; z < count - 1; z += 1) {
    for (let x = 0; x < count - 1; x += 1) {
      const a = z * count + x;
      const b = a + 1;
      const c = a + count;
      const d = c + 1;
      indices.set([a, c, b, b, c, d], i);
      i += 6;
    }
  }
  const colors = new Float32Array(count * count * 3);
  const normals = new Float32Array(count * count * 3);
  for (let v = 0; v < count * count; v += 1) normals[v * 3 + 1] = 1; // straight up
  const slots = new Array<number>(count * count).fill(0);
  return { positions, indices, colors, normals, slots };
}

/** Cross product of (p1 - p0) and (p2 - p0), the face normal of a CCW triangle p0, p1, p2. */
function faceNormal(positions: Float32Array, a: number, b: number, c: number): [number, number, number] {
  const p0 = [positions[a * 3]!, positions[a * 3 + 1]!, positions[a * 3 + 2]!];
  const p1 = [positions[b * 3]!, positions[b * 3 + 1]!, positions[b * 3 + 2]!];
  const p2 = [positions[c * 3]!, positions[c * 3 + 1]!, positions[c * 3 + 2]!];
  const u = [p1[0]! - p0[0]!, p1[1]! - p0[1]!, p1[2]! - p0[2]!];
  const v = [p2[0]! - p0[0]!, p2[1]! - p0[1]!, p2[2]! - p0[2]!];
  return [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
}

describe('addSkirt (P2-43)', () => {
  it('faces every skirt triangle away from the chunk centre, on all four edges', () => {
    const count = 5;
    const grid = flatGrid(count);
    const { positions, indices } = addSkirt(
      count,
      grid.positions,
      grid.colors,
      grid.normals,
      grid.indices,
      grid.slots,
    );
    const centre = (count - 1) / 2;
    let skirtTriangles = 0;
    for (let t = grid.indices.length; t < indices.length; t += 3) {
      const [a, b, c] = [indices[t]!, indices[t + 1]!, indices[t + 2]!];
      const normal = faceNormal(positions, a, b, c);
      // The triangle's own horizontal position relative to the chunk centre, ignoring height:
      // "away from the centre" for a vertical skirt wall is a horizontal question.
      const midX = (positions[a * 3]! + positions[b * 3]! + positions[c * 3]!) / 3 - centre;
      const midZ = (positions[a * 3 + 2]! + positions[b * 3 + 2]! + positions[c * 3 + 2]!) / 3 - centre;
      const outward = normal[0] * midX + normal[2] * midZ;
      expect(outward).toBeGreaterThan(0);
      skirtTriangles += 1;
    }
    // 4 edges x (count - 1) quads x 2 triangles: every skirt triangle got checked.
    expect(skirtTriangles).toBe(4 * (count - 1) * 2);
  });

  it('drops far enough to hide the largest measured coarse-ground gap (P2-43 final review)', () => {
    const count = 5;
    const grid = flatGrid(count);
    const { positions } = addSkirt(
      count,
      grid.positions,
      grid.colors,
      grid.normals,
      grid.indices,
      grid.slots,
    );
    let lowest = Infinity;
    for (let v = 0; v < positions.length / 3; v += 1) lowest = Math.min(lowest, positions[v * 3 + 1]!);
    // A step-4 chunk was measured 2.1 m off the true ground on mountains (seed 3): 2 m was not
    // enough, so the skirt drops 8 m.
    expect(lowest).toBe(-8);
  });
});
