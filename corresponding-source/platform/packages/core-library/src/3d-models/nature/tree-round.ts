import { realisticLook } from '../_realistic.js';
import { defineModel, shape, LEAF, WOOD } from '../_parts.js';
import { cellsToParts, clump, column, VOXEL_COLORS, type Cell } from '../_voxel.js';

/** Voxel look: a thick trunk of 0.4 m cubes with two short branches and an uneven leafy crown. */
const cube = 0.4;
const trunk: Cell[] = [
  ...column(-1, -1, 0, 7, VOXEL_COLORS.trunk, 1),
  ...column(0, -1, 0, 7, VOXEL_COLORS.trunk, 2),
  ...column(-1, 0, 0, 7, VOXEL_COLORS.trunk, 3),
  ...column(0, 0, 0, 7, VOXEL_COLORS.trunk, 4),
  [1, 5, -1, VOXEL_COLORS.trunk[1]],
  [-2, 6, 0, VOXEL_COLORS.trunk[2]],
];
const crown = [
  ...clump({ center: [-0.5, 8.5, -0.5], radius: [4.3, 2.8, 4.3], colors: VOXEL_COLORS.leaf, seed: 11 }),
  ...clump({ center: [1, 10, 0.5], radius: [2.6, 1.8, 2.6], colors: VOXEL_COLORS.leaf, seed: 12 }),
];

export default defineModel({
  id: 'genvr.core.tree.round',
  name: 'Round Tree',
  subcategory: 'nature',
  parts: [
    shape('cylinder', [0.4, 2, 0.4], [0, 1, 0], WOOD),
    shape('sphere', [2.6, 2.4, 2.6], [0, 3, 0], LEAF),
  ],
  looks: { ...realisticLook('genvr.core.tree.round'), voxel: cellsToParts([...trunk, ...crown], cube) },
});
