/** Tidewater / sky-pro partly-cloudy preset. Distances are metres, optical density is m^-1. */
export const CLOUD_PRESET = Object.freeze({ altitude: 4000, thickness: 5200, density: 0.019,
  coverage: 0.49, weatherScale: 29000, baseScale: 7500, baseStrength: 0.69,
  erosionScale: 0.13, erosionBase: 0.24, erosionPeak: 2.15, edgeSoftness: 0.095,
  windSpeed: 12, evolutionSpeed: 60.8 * 12 / 89, windSkew: 1750,
  maxSteps: 256, lightTaps: 6, stepMeters: 25, historyWeight: 0.9,
  panoramaWidth: 512, panoramaHeight: 160, shadowResolution: 256, shadowSize: 12000, shadowStrength: 0.85 });
export type CloudVector = readonly [number, number, number];
const RADIUS = 6371000;
export const cloudSmoothstep = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t);
};
/** Stable shell intersection from Tidewater scShellRoots (avoids cancellation near the surface). */
export function cloudShellRoots(directionY: number, altitude: number, originHeight: number): [number, number] {
  const b = (RADIUS + originHeight) * directionY;
  const c = (originHeight - altitude) * (2 * RADIUS + originHeight + altitude);
  const h = b * b - c;
  if (h < 0) return [-1, -1];
  const q = -b - (b >= 0 ? Math.sqrt(h) : -Math.sqrt(h));
  const other = c / (Math.abs(q) > 0.0001 ? q : -0.0001);
  return [Math.min(q, other), Math.max(q, other)];
}
export function cloudInterval(directionY: number, originHeight: number): [number, number] {
  const inner = cloudShellRoots(directionY, CLOUD_PRESET.altitude, originHeight);
  const outer = cloudShellRoots(directionY, CLOUD_PRESET.altitude + CLOUD_PRESET.thickness, originHeight);
  if (outer[1] <= 0) return [0, 0];
  let start = 0, end = Math.min(outer[1], 250000);
  if (originHeight < CLOUD_PRESET.altitude) start = Math.max(inner[1], 0);
  else {
    if (originHeight > CLOUD_PRESET.altitude + CLOUD_PRESET.thickness) start = Math.max(outer[0], 0);
    if (inner[0] >= 0) end = Math.min(end, inner[0]);
  }
  const ground = cloudShellRoots(directionY, 0, originHeight);
  if (ground[0] > 0) end = Math.min(end, ground[0]);
  return [start, end];
}
export function cloudPhase(mu: number, g: number): number {
  const d = Math.max(1 + g * g - 2 * g * mu, 0.001);
  return (1 - g * g) / (4 * Math.PI * d * Math.sqrt(d));
}
export function cloudPhases(mu: number): CloudVector {
  return [0, 1, 2].map(i => 0.8 * cloudPhase(mu, 0.8 / 2 ** i) + 0.2 * cloudPhase(mu, -0.2 / 2 ** i)) as unknown as CloudVector;
}
/** Three orders of multiple scattering: asymmetry and optical depth halve on each order. */
export function cloudLightEnergy(opticalDepth: number, mu: number): number {
  const p = cloudPhases(mu), q = Math.exp(-Math.max(0, opticalDepth) * 0.25);
  return q ** 4 * p[0] + q ** 2 * 0.5 * p[1] + q * 0.25 * p[2];
}
export function cloudLattice(frame: number): [number, number] {
  const index = frame % 16; let x = 0, y = 0;
  for (let bit = 0; bit < 2; bit++) {
    const pair = (index >> (bit * 2)) & 3;
    x |= ((pair >> 1) ^ (pair & 1)) << (1 - bit); y |= (pair & 1) << (1 - bit);
  }
  return [x, y];
}
/** Exact density shape, given the procedural weather and Perlin-Worley RGB samples. */
export function cloudDensity(height: number, weather: number, base: CloudVector, detail: CloudVector, coverage: number = CLOUD_PRESET.coverage): number {
  if (height < -0.1 || height > 1.3 || coverage <= 0) return 0;
  const edge = CLOUD_PRESET.edgeSoftness;
  const required = (1 - cloudSmoothstep(0, 0.13, height)) * 0.54;
  const floor = cloudSmoothstep(required - 0.1, required, weather);
  const top = weather + coverage - 1 + (base[0] * 0.7 + base[1] * 0.41 + base[2] * 0.23) * 0.69 * coverage;
  if (floor <= 0 || top < height - edge) return 0;
  const local = Math.max(0, Math.min(1, height / Math.max(top, 0.001)));
  const strength = 0.24 + (2.15 - 0.24) * local;
  if (Math.min(top - height, height) >= 0.173 * strength * coverage + edge) return floor;
  const erosion = (detail[0] * 0.113 + detail[1] * 0.04 + detail[2] * 0.02) * strength * coverage;
  return cloudSmoothstep(-edge, edge, top - erosion - height) * cloudSmoothstep(-edge, edge, height - erosion) * floor;
}
