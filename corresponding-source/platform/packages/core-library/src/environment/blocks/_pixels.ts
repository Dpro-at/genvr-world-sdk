import { BLOCK_PIXELS } from './_block.js';

/**
 * Small drawing helpers for block pictures: tidy, bright pixel art with a few tones per block
 * (decision 98: no noise or dirt), made the same way every time from a fixed seed.
 */

const N = BLOCK_PIXELS;

function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x + 1, 0x27d4eb2d) ^ Math.imul(y + 1, 0x165667b1) ^ Math.imul(seed, 0x3c6ef372);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** Tones of one block: the main color, a lighter and a darker one (share of each pixel). */
export interface Tones {
  base: number;
  light: number;
  dark: number;
  /** Share of light and dark pixels (the rest are base). */
  lightShare?: number;
  darkShare?: number;
  /** Pixels per speck (2 draws calmer, bigger specks). */
  speck?: 1 | 2;
}

/** A face of scattered tones. */
export function speckled(tones: Tones, seed: number): number[] {
  const light = tones.lightShare ?? 0.16;
  const dark = tones.darkShare ?? 0.12;
  const speck = tones.speck ?? 1;
  const pixels: number[] = [];
  for (let y = 0; y < N; y += 1)
    for (let x = 0; x < N; x += 1) {
      const r = hash(Math.floor(x / speck), Math.floor(y / speck), seed);
      pixels.push(r < light ? tones.light : r < light + dark ? tones.dark : tones.base);
    }
  return pixels;
}

/** A face of one clean color (the plain look). */
export const plain = (color: number): number[] => new Array<number>(N * N).fill(color);

/** Bricks in rows of 8 x 4 pixels, every other row shifted by half a brick, with mortar lines. */
export function bricks(brick: number, mortar: number, shade?: number): number[] {
  const pixels: number[] = [];
  for (let y = 0; y < N; y += 1)
    for (let x = 0; x < N; x += 1) {
      const row = Math.floor(y / 4);
      const shift = row % 2 ? 4 : 0;
      const joint = y % 4 === 3 || (x + shift) % 8 === 7;
      const alternate = shade !== undefined && (Math.floor((x + shift) / 8) + row) % 3 === 0;
      pixels.push(joint ? mortar : alternate ? shade : brick);
    }
  return pixels;
}

/** Boards: horizontal planks four pixels high with a darker line between them, joints staggered. */
export function boards(wood: number, line: number, shade?: number): number[] {
  const pixels: number[] = [];
  for (let y = 0; y < N; y += 1)
    for (let x = 0; x < N; x += 1) {
      const row = Math.floor(y / 4);
      const joint = y % 4 === 3 || (row % 2 === 0 && x === 11) || (row % 2 === 1 && x === 4);
      pixels.push(joint ? line : shade !== undefined && row % 2 ? shade : wood);
    }
  return pixels;
}

/** Soft horizontal shine lines (water). */
export function ripples(tones: Tones, seed: number): number[] {
  const pixels: number[] = [];
  for (let y = 0; y < N; y += 1) {
    const start = Math.floor(hash(0, y, seed) * N);
    const length = y % 4 === 1 ? 3 + Math.floor(hash(1, y, seed) * 4) : 0;
    for (let x = 0; x < N; x += 1) {
      const onLine = length > 0 && (x - start + N) % N < length;
      const r = hash(x, y, seed + 1);
      pixels.push(onLine ? tones.light : r < (tones.darkShare ?? 0.08) ? tones.dark : tones.base);
    }
  }
  return pixels;
}

/** A side face with another face's top rows (grass or snow over the block below). */
export function capped(
  cap: readonly number[],
  body: readonly number[],
  rows: number,
  seed: number,
): number[] {
  const pixels = [...body];
  for (let x = 0; x < N; x += 1) {
    // A tidy, slightly uneven lower edge: some columns reach one row further down.
    const depth = rows + (hash(x, 0, seed) < 0.4 ? 1 : 0);
    for (let y = 0; y < depth; y += 1) pixels[y * N + x] = cap[y * N + x]!;
  }
  return pixels;
}

const scale = (color: number, factor: number) => {
  const channel = (shift: number) =>
    Math.max(0, Math.min(255, Math.round(((color >> shift) & 0xff) * factor))) << shift;
  return channel(16) | channel(8) | channel(0);
};

/** A clean edge on every block: a lighter top-left line and a darker bottom-right one. */
export function bevel(pixels: readonly number[], amount = 0.08): number[] {
  return pixels.map((color, i) => {
    const x = i % N;
    const y = Math.floor(i / N);
    if (x === 0 || y === 0) return scale(color, 1 + amount);
    if (x === N - 1 || y === N - 1) return scale(color, 1 - amount * 1.4);
    return color;
  });
}
