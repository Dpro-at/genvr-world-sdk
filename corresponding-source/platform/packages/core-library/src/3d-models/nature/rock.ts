import { realisticLook } from '../_realistic.js';
import { box, defineModel, STONE } from '../_parts.js';
import { cellsToParts, seeded, shade, VOXEL_COLORS, type Cell } from '../_voxel.js';

/** Voxel look: a heap of stone cubes in several greys, wider at the bottom. */
const random = seeded(41);
const cells: Cell[] = [];
const layers: Array<[number, number, number, number]> = [
  // y, x from, x to, z from..to (square half size)
  [0, -2, 1, 2],
  [1, -2, 0, 1],
  [2, -1, 0, 1],
];
for (const [y, x0, x1, r] of layers)
  for (let z = -r; z < r; z += 1)
    for (let x = x0; x <= x1; x += 1) {
      const edge = (x === x0 || x === x1) && (z === -r || z === r - 1);
      if (edge && random() < 0.5) continue;
      cells.push([x, y, z, shade(VOXEL_COLORS.rock, random)]);
    }

export default defineModel({
  id: 'genvr.core.rock',
  name: 'Rock',
  subcategory: 'nature',
  // Rocks lie anywhere on the ground, also on sand and in water.
  placement: {
    stands: ['ground', 'water'],
    soils: ['grass', 'dirt', 'sand', 'rock', 'snow', 'mud'],
    maxTilt: 180,
    maxSlope: 60,
  },
  parts: [
    box([1.4, 0.9, 1.2], [0, 0.45, 0], STONE, 0.3),
    box([0.9, 0.6, 0.8], [0.3, 1.1, 0.1], '#8a929b', 0.9),
  ],
  looks: { ...realisticLook('genvr.core.rock'), voxel: cellsToParts(cells, 0.45) },
});
