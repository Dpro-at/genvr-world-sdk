/**
 * Small deterministic helpers for the sea-life generators (SEALIFE-01). Own code; the same seed always gives the
 * same numbers on every device, so a placed copy looks the same for every player.
 */

/** mulberry32: a fast 32-bit generator returning numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seeded random source with range helpers. `salt` separates the streams of different item kinds. */
export function seeded(seed: number, salt: number) {
  const next = mulberry32((Math.floor(seed) * 2654435761 + salt * 40503) >>> 0);
  // Warm up: the first values of nearby seeds are correlated.
  for (let i = 0; i < 4; i++) next();
  return {
    next,
    range: (min: number, max: number) => min + (max - min) * next(),
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
  };
}

export type Seeded = ReturnType<typeof seeded>;

/** A stable hash of a 3D point to [0, 1) (colour variation that does not depend on build order). */
export function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** A number parameter read defensively (generators also run on old or bad data). */
export function numberParam(
  params: Readonly<Record<string, unknown>>,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = params[key];
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

/** A string parameter limited to its listed values. */
export function choiceParam<T extends string>(
  params: Readonly<Record<string, unknown>>,
  key: string,
  values: readonly T[],
  fallback: T,
): T {
  const value = params[key];
  return typeof value === 'string' && (values as readonly string[]).includes(value) ? (value as T) : fallback;
}
