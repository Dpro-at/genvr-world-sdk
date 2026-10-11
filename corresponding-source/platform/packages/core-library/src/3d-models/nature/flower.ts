import { realisticLook } from '../_realistic.js';
import { defineModel, shape, DARK_LEAF } from '../_parts.js';
import { cellsToParts, VOXEL_COLORS, type Cell } from '../_voxel.js';

/** Voxel look: a white daisy of tiny cubes with a yellow middle, on a stem with two leaves. */
const [white, softWhite] = VOXEL_COLORS.petal;
const green = VOXEL_COLORS.stem[0];
const cells: Cell[] = [
  ...[0, 1, 2, 3, 4].map((y): Cell => [0, y, 0, green]),
  [1, 1, 0, green],
  [-1, 2, 0, green],
  [0, 5, 0, VOXEL_COLORS.flowerMiddle[0]],
  [1, 5, 0, white],
  [-1, 5, 0, white],
  [0, 5, 1, softWhite],
  [0, 5, -1, softWhite],
  [2, 5, 0, softWhite],
  [-2, 5, 0, softWhite],
  [0, 5, 2, white],
  [0, 5, -2, white],
];

export default defineModel({
  id: 'genvr.core.flower',
  name: 'Flower',
  subcategory: 'nature',
  collider: 'none',
  parts: [
    shape('cylinder', [0.06, 0.5, 0.06], [0, 0.25, 0], DARK_LEAF),
    shape('sphere', [0.3, 0.2, 0.3], [0, 0.55, 0], '#ff6fa8'),
    shape('sphere', [0.12, 0.12, 0.12], [0, 0.62, 0], '#ffd24a'),
  ],
  looks: { ...realisticLook('genvr.core.flower'), voxel: cellsToParts(cells, 0.1) },
});
