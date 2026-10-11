import { box, defineModel, DARK_WOOD, WOOD } from '../_parts.js';
import { cellsToParts, fill, seeded, VOXEL_COLORS } from '../_voxel.js';

/** Voxel look: a plank top on four legs of darker wood cubes. */
const random = seeded(81);
const cells = [
  ...fill([-8, 7, -4], [7, 7, 4], VOXEL_COLORS.planks, random, 'row'),
  ...[-7, 6].flatMap((x) => [-3, 3].flatMap((z) => fill([x, 0, z], [x, 6, z], VOXEL_COLORS.log, random))),
];

export default defineModel({
  id: 'genvr.core.table',
  name: 'Table',
  subcategory: 'props-and-decor',
  parts: [
    box([1.6, 0.08, 0.9], [0, 0.76, 0], WOOD),
    box([0.08, 0.72, 0.08], [-0.7, 0.36, -0.35], DARK_WOOD),
    box([0.08, 0.72, 0.08], [0.7, 0.36, -0.35], DARK_WOOD),
    box([0.08, 0.72, 0.08], [-0.7, 0.36, 0.35], DARK_WOOD),
    box([0.08, 0.72, 0.08], [0.7, 0.36, 0.35], DARK_WOOD),
  ],
  looks: { voxel: cellsToParts(cells, 0.1, [0, 0, -0.05]) },
});
