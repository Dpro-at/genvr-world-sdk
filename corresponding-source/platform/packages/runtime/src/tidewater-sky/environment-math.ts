/** Tidewater Environment.js (4811ba48), MIT: cube/GGX/SH reference equations. */
export const ENVIRONMENT_SIZE = 128;
export const ENVIRONMENT_LEVELS = 6;
export const ENVIRONMENT_GGX_SAMPLES = 96;
export type EnvRGB = readonly [number, number, number];
export const SH_COSINE = [1, 2 / 3, 2 / 3, 2 / 3, 0.25, 0.25, 0.25, 0.25, 0.25] as const;
export function environmentCubeDirection(face: number, x: number, y: number, size: number): [number, number, number] {
  const u = (x + 0.5) / size * 2 - 1, v = (y + 0.5) / size * 2 - 1;
  const d = [[1, -v, -u], [-1, -v, u], [u, 1, v], [u, -1, -v], [u, -v, 1], [-u, -v, -1]][face]!;
  const l = Math.hypot(...d); return [d[0]! / l, d[1]! / l, d[2]! / l];
}
export function environmentSHBasis([x, y, z]: EnvRGB): number[] {
  return [0.282095, 0.488603 * y, 0.488603 * z, 0.488603 * x, 1.092548 * x * y,
    1.092548 * y * z, 0.315392 * (3 * z * z - 1), 1.092548 * x * z, 0.546274 * (x * x - y * y)];
}
export function environmentSH(radiance: (direction: EnvRGB) => EnvRGB, size = 32): number[][] {
  const result = Array.from({ length: 9 }, () => [0, 0, 0]);
  for (let face = 0; face < 6; face++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = environmentCubeDirection(face, x, y, size), L = radiance(d), basis = environmentSHBasis(d);
    const u = (x + 0.5) / size * 2 - 1, v = (y + 0.5) / size * 2 - 1, t = 1 + u * u + v * v;
    const w = 4 / (Math.sqrt(t) * t * size * size);
    for (let k = 0; k < 9; k++) for (let c = 0; c < 3; c++) result[k]![c]! += L[c]! * w * basis[k]! * SH_COSINE[k]!;
  }
  return result;
}
export function environmentDiffuse(sh: readonly number[][], normal: EnvRGB): number[] {
  const b = environmentSHBasis(normal);
  return [0, 1, 2].map(c => Math.max(0, b.reduce((sum, v, k) => sum + v * sh[k]![c]!, 0)));
}
export function environmentHammersley(index: number, count = 96): [number, number] {
  let bits = index >>> 0;
  bits = ((bits << 16) | (bits >>> 16)) >>> 0;
  bits = (((bits & 0x55555555) << 1) | ((bits & 0xaaaaaaaa) >>> 1)) >>> 0;
  bits = (((bits & 0x33333333) << 2) | ((bits & 0xcccccccc) >>> 2)) >>> 0;
  bits = (((bits & 0x0f0f0f0f) << 4) | ((bits & 0xf0f0f0f0) >>> 4)) >>> 0;
  bits = (((bits & 0x00ff00ff) << 8) | ((bits & 0xff00ff00) >>> 8)) >>> 0;
  return [index / count, bits * 2.3283064365386963e-10];
}
/** CPU GGX at +Z, useful for energy-conservation and sample-sequence checks. */
export function environmentGGX(radiance: (direction: EnvRGB, lod: number) => EnvRGB, roughness: number): number[] {
  if (roughness === 0) return [...radiance([0, 0, 1], 0)];
  const a2 = roughness ** 4, sum = [0, 0, 0]; let weights = 0;
  for (let i = 0; i < 96; i++) {
    const [u, v] = environmentHammersley(i), phi = 2 * Math.PI * u;
    const ct = Math.sqrt((1 - v) / (1 + (a2 - 1) * v)), st = Math.sqrt(1 - ct * ct);
    const L: EnvRGB = [2 * ct * st * Math.cos(phi), 2 * ct * st * Math.sin(phi), 2 * ct * ct - 1];
    if (L[2] <= 0) continue;
    const d = ct * ct * (a2 - 1) + 1, pdf = a2 / (Math.PI * d * d) * 0.25;
    const lod = Math.max(0, Math.min(7, 0.5 * Math.log2((1 / (96 * pdf + 1e-4)) / (4 * Math.PI / (6 * 128 * 128))) + 1));
    const value = radiance(L, lod);
    for (let c = 0; c < 3; c++) sum[c]! += value[c]! * L[2]; weights += L[2];
  }
  return sum.map(v => v / Math.max(weights, 1e-4));
}
