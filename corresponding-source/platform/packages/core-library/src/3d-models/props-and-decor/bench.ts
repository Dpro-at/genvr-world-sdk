import { realisticLook } from '../_realistic.js';
import { box, defineModel, METAL, WOOD } from '../_parts.js';
import { cellsToParts, fill, seeded, VOXEL_COLORS } from '../_voxel.js';

/** Voxel look: plank boards for the seat and back on cube legs of metal. */
const random = seeded(71);
const cells = [
  ...fill([-10, 4, -2], [9, 4, 1], VOXEL_COLORS.planks, random, 'row'),
  ...fill([-10, 6, -3], [9, 7, -3], VOXEL_COLORS.planks, random, 'row'),
  ...fill([-10, 9, -3], [9, 9, -3], VOXEL_COLORS.planks, random, 'row'),
  ...fill([-9, 0, -2], [-9, 3, 1], VOXEL_COLORS.metal, random),
  ...fill([8, 0, -2], [8, 3, 1], VOXEL_COLORS.metal, random),
  ...fill([-9, 5, -3], [-9, 8, -3], VOXEL_COLORS.metal, random),
  ...fill([8, 5, -3], [8, 8, -3], VOXEL_COLORS.metal, random),
];

export default defineModel({
  id: 'genvr.core.bench',
  name: 'Bench',
  subcategory: 'props-and-decor',
  // Room to sit down in front.
  placement: { clearFront: 0.8 },
  parts: [
    box([2, 0.1, 0.5], [0, 0.45, 0], WOOD),
    box([2, 0.5, 0.08], [0, 0.75, -0.22], WOOD),
    box([0.1, 0.45, 0.45], [-0.85, 0.225, 0], METAL),
    box([0.1, 0.45, 0.45], [0.85, 0.225, 0], METAL),
  ],
  looks: { ...realisticLook('genvr.core.bench'), voxel: cellsToParts(cells, 0.1, [0, 0, 0.05]) },
});
