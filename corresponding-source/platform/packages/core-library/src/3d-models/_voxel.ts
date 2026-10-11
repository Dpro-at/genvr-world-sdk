import { box, type ItemPart } from './_parts.js';

/**
 * Cube-built looks for the Voxel style (P2-26 stage 3, decisions 98 and 99): shapes made of
 * small cubes in a few close shades of one color, so light and shape carry the detail. Only cubes
 * on the outside of a shape are kept (the inside never shows), and neighbors in the same shade
 * along a row merge into one longer box to keep items light. Made the same way every time.
 */

/** Edge of one small cube (half a ground block). */
export const CUBE = 0.5;

/** Shades per material, light to dark (the clean palette of the plain block look). */
export const VOXEL_COLORS = {
  leaf: ['#9fd84a', '#7cc43e', '#5fa834', '#478a2c'],
  pine: ['#4f8d3a', '#3c7431', '#2f5f29', '#264f23'],
  trunk: ['#a36c35', '#8b5829', '#704522'],
  rock: ['#b5bbc0', '#9aa3ab', '#838c95', '#707985'],
  planks: ['#d9b27a', '#c99f66', '#b88d57'],
  log: ['#8b5829', '#704522'],
  roof: ['#c0503a', '#a8432f', '#8f3a29'],
  stone: ['#a3a9b0', '#8e959d'],
  glass: ['#9fdcff'],
  door: ['#6e4424'],
  petal: ['#ffffff', '#f4f6fb'],
  flowerMiddle: ['#ffd24a'],
  stem: ['#4f9d3a'],
  metal: ['#7a838e', '#67707b', '#5b6470'],
  barrel: ['#d0493a', '#c0392b', '#a93226'],
  cone: ['#ff8a2a', '#ff7a1a', '#ec6a10'],
  white: ['#ffffff', '#eef0f4'],
  lampLight: ['#fff6c4', '#ffe98a'],
} as const;

/** A tiny seeded random generator, so every item is the same everywhere. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cells of a cube grid: x, y, z in cubes (y = 0 is the ground layer), with a color. */
export type Cell = readonly [number, number, number, string];

/**
 * Parts from grid cells: one cube per cell (where shapes overlap, a later cell paints over an
 * earlier one: two cubes in one place would flicker), hidden cells (all six neighbors filled) are
 * dropped, and runs of cells in one color along x merge into one box. `offset` (in meters) moves the result, e.g. by half a cube
 * to center a shape that is an odd number of cubes wide.
 */
export function cellsToParts(
  cells: readonly Cell[],
  size: number = CUBE,
  offset: readonly [number, number, number] = [0, 0, 0],
): ItemPart[] {
  const unique = new Map(cells.map((cell) => [`${cell[0]},${cell[1]},${cell[2]}`, cell]));
  const has = (x: number, y: number, z: number) => unique.has(`${x},${y},${z}`);
  const visible = [...unique.values()].filter(
    ([x, y, z]) =>
      !(
        has(x + 1, y, z) &&
        has(x - 1, y, z) &&
        has(x, y + 1, z) &&
        has(x, y - 1, z) &&
        has(x, y, z + 1) &&
        has(x, y, z - 1)
      ),
  );
  const byRow = new Map<string, Cell[]>();
  for (const cell of visible) {
    const row = `${cell[1]},${cell[2]},${cell[3]}`;
    byRow.set(row, [...(byRow.get(row) ?? []), cell]);
  }
  const parts: ItemPart[] = [];
  for (const row of byRow.values()) {
    row.sort((a, b) => a[0] - b[0]);
    let start = 0;
    for (let i = 1; i <= row.length; i += 1) {
      if (i < row.length && row[i]![0] === row[i - 1]![0] + 1) continue;
      const first = row[start]!;
      const length = i - start;
      parts.push(
        box(
          [length * size, size, size],
          [
            (first[0] + length / 2) * size + offset[0],
            (first[1] + 0.5) * size + offset[1],
            (first[2] + 0.5) * size + offset[2],
          ],
          first[3],
        ),
      );
      start = i;
    }
  }
  return parts;
}

/** One shade of a material, picked at random. */
export const shade = (colors: readonly string[], random: () => number) =>
  colors[Math.floor(random() * colors.length)]!;

/**
 * A rounded, uneven clump of cubes (tree crowns, bushes): cells inside an ellipsoid, with some
 * cells on its edge left out so the outline is not a perfect ball.
 */
export function clump(options: {
  /** Center in cubes. */
  center: readonly [number, number, number];
  /** Radii in cubes. */
  radius: readonly [number, number, number];
  colors: readonly string[];
  seed: number;
  /** Share of edge cells left out. */
  gaps?: number;
}): Cell[] {
  const random = seeded(options.seed);
  const [cx, cy, cz] = options.center;
  const [rx, ry, rz] = options.radius;
  const cells: Cell[] = [];
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1)
    for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z += 1)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
        if (d > 1) continue;
        // Edge cells (the outer part of the ball) may be left out; the top is kept rounder.
        if (d > 0.6 && random() < (options.gaps ?? 0.3)) continue;
        cells.push([x, y, z, shade(options.colors, random)]);
      }
  return cells;
}

/** A column of cells from `bottom` up to (not including) `top`. */
export function column(
  x: number,
  z: number,
  bottom: number,
  top: number,
  colors: readonly string[],
  seed: number,
): Cell[] {
  const random = seeded(seed);
  const cells: Cell[] = [];
  for (let y = bottom; y < top; y += 1) cells.push([x, y, z, shade(colors, random)]);
  return cells;
}

/**
 * A solid block of cells between two corners (inclusive, in cubes), each cell in a random shade;
 * `shadeBy: 'row'` gives each row along x one shade instead, so it merges into one board.
 */
export function fill(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  colors: readonly string[],
  random: () => number,
  shadeBy: 'cell' | 'row' = 'cell',
): Cell[] {
  const cells: Cell[] = [];
  for (let y = from[1]; y <= to[1]; y += 1)
    for (let z = from[2]; z <= to[2]; z += 1) {
      const rowColor = shade(colors, random);
      for (let x = from[0]; x <= to[0]; x += 1)
        cells.push([x, y, z, shadeBy === 'row' ? rowColor : shade(colors, random)]);
    }
  return cells;
}
