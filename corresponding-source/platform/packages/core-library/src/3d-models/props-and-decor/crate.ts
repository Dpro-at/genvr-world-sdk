import { box, defineModel, DARK_WOOD, WOOD } from '../_parts.js';
import { cellsToParts, seeded, shade, VOXEL_COLORS, type Cell } from '../_voxel.js';

/** Voxel look: a plank box of 5 x 5 x 5 cubes, its edges in darker wood like a frame. */
const random = seeded(51);
const cells: Cell[] = [];
for (let y = 0; y < 5; y += 1)
  for (let z = -2; z <= 2; z += 1)
    for (let x = -2; x <= 2; x += 1) {
      const edges = Number(Math.abs(x) === 2) + Number(y === 0 || y === 4) + Number(Math.abs(z) === 2);
      cells.push([x, y, z, shade(edges >= 2 ? VOXEL_COLORS.log : VOXEL_COLORS.planks, random)]);
    }

export default defineModel({
  id: 'genvr.core.crate',
  name: 'Crate',
  subcategory: 'props-and-decor',
  parts: [
    box([1, 1, 1], [0, 0.5, 0], WOOD),
    // The bands stand a little proud of the lid and the bottom: faces in one plane flicker.
    box([1.02, 0.12, 1.02], [0, 0.945, 0], DARK_WOOD),
    box([1.02, 0.12, 1.02], [0, 0.065, 0], DARK_WOOD),
  ],
  looks: { voxel: cellsToParts(cells, 0.2, [-0.1, 0, -0.1]) },
});
