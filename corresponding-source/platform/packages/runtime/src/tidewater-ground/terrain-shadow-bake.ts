/** Tidewater4811ba48 MIT TerrainBake: base4x4 average, Float32 max reduction, half uploads. */
import { DataUtils } from 'three/webgpu';
export function buildShadowHeights(
  terrain: { res: number; heights: Float32Array; texel: number },
  factor = 4,
) {
  const { res, heights: H } = terrain;
  const n = res / factor;
  let cur = new Float32Array(n * n);
  let maxHeight = -Infinity;
  const inv = 1 / (factor * factor);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let b = 0; b < factor; b++) {
        const row = (j * factor + b) * res + i * factor;
        for (let a = 0; a < factor; a++) s += H[row + a]!;
      }

      const v = s * inv;
      cur[j * n + i] = v;
      if (v > maxHeight) maxHeight = v;
    }

  const toHalf = (src: Float32Array) => {
    const out = new Uint16Array(src.length);
    for (let i = 0; i < src.length; i++) out[i] = DataUtils.toHalfFloat(src[i]!);
    return out;
  };

  const levels = [{ data: toHalf(cur), width: n, height: n }];
  let w = n;
  while (w > 1) {
    const m = w >> 1;
    const next = new Float32Array(m * m);
    for (let j = 0; j < m; j++)
      for (let i = 0; i < m; i++) {
        const a = 2 * j * w + 2 * i;
        next[j * m + i] = Math.max(cur[a]!, cur[a + 1]!, cur[a + w]!, cur[a + w + 1]!);
      }

    levels.push({ data: toHalf(next), width: m, height: m });
    cur = next;
    w = m;
  }

  return { levels, texel: terrain.texel * factor, maxHeight };
}
