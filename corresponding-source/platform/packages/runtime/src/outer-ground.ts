import { BufferAttribute, BufferGeometry } from 'three/webgpu';

/** Cells across the whole outer square (it reaches one place width beyond each border). */
const CELLS = 128;
/** Metres the outer ground sits below the place's own ground, so the two never flicker where they meet. */
const SINK = 0.05;

/**
 * The ground beyond the playable square (R2k). It starts at the place's own border heights and eases out to their
 * mean, so a real place built high above 0 (a town on a hill) no longer ends in a cliff down to a flat sheet at 0.
 * A frame of quads around the square, never under it; `tile` metres per texture repeat.
 */
export function outerGroundGeometry(heightAt: (x: number, z: number) => number, half: number, tile: number): BufferGeometry {
  const outer = half * 2;
  const step = (outer * 2) / CELLS;
  const clamp = (v: number) => Math.min(half, Math.max(-half, v));
  // The mean border height: where the outer ground settles far out.
  let sum = 0;
  let count = 0;
  for (let t = -half; t <= half; t += step)
    for (const [x, z] of [[t, -half], [t, half], [-half, t], [half, t]] as const) {
      sum += heightAt(x, z);
      count += 1;
    }
  const mean = count ? sum / count : 0;
  const heightOf = (x: number, z: number) => {
    const edge = heightAt(clamp(x), clamp(z));
    const away = Math.max(Math.abs(x) - half, Math.abs(z) - half, 0);
    const t = Math.min(1, away / half);
    return edge + (mean - edge) * t * t * (3 - 2 * t) - SINK;
  };

  const n = CELLS + 1;
  const positions = new Float32Array(n * n * 3);
  const uvs = new Float32Array(n * n * 2);
  for (let j = 0; j < n; j += 1)
    for (let i = 0; i < n; i += 1) {
      const x = -outer + i * step;
      const z = -outer + j * step;
      const k = j * n + i;
      positions.set([x, heightOf(x, z), z], k * 3);
      uvs.set([x / tile, -z / tile], k * 2);
    }
  const indices: number[] = [];
  const inside = (x: number, z: number) => Math.abs(x) < half - 1e-6 && Math.abs(z) < half - 1e-6;
  for (let j = 0; j < CELLS; j += 1)
    for (let i = 0; i < CELLS; i += 1) {
      const x = -outer + (i + 0.5) * step;
      const z = -outer + (j + 0.5) * step;
      // The square itself is the place's own ground.
      if (inside(x, z)) continue;
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
