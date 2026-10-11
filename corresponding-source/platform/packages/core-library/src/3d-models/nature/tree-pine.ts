import { realisticLook } from '../_realistic.js';
import { defineModel, shape, DARK_LEAF, WOOD } from '../_parts.js';
import { cellsToParts, column, seeded, shade, VOXEL_COLORS, type Cell } from '../_voxel.js';

/** Voxel look: a short trunk under square tiers of dark green cubes that narrow to a point. */
const cube = 0.5;
const TIERS = [3, 3, 2, 3, 2, 1, 2, 1, 0, 0];
const random = seeded(21);
const cells: Cell[] = [
  ...column(-1, -1, 0, 2, VOXEL_COLORS.trunk, 22),
  ...column(0, -1, 0, 2, VOXEL_COLORS.trunk, 23),
  ...column(-1, 0, 0, 2, VOXEL_COLORS.trunk, 24),
  ...column(0, 0, 0, 2, VOXEL_COLORS.trunk, 25),
];
TIERS.forEach((r, i) => {
  for (let z = -r - 1; z <= r; z += 1)
    for (let x = -r - 1; x <= r; x += 1) {
      // Corners of the wider tiers stay open, so each tier reads round from afar.
      const corner = (x === -r - 1 || x === r) && (z === -r - 1 || z === r);
      if (corner && r > 1) continue;
      cells.push([x, 2 + i, z, shade(VOXEL_COLORS.pine, random)]);
    }
});

export default defineModel({
  id: 'genvr.core.tree.pine',
  name: 'Pine Tree',
  subcategory: 'nature',
  parts: [
    shape('cylinder', [0.35, 1.2, 0.35], [0, 0.6, 0], WOOD),
    shape('cone', [2.6, 2, 2.6], [0, 2, 0], DARK_LEAF),
    shape('cone', [2, 1.8, 2], [0, 3.1, 0], DARK_LEAF),
    shape('cone', [1.3, 1.5, 1.3], [0, 4.1, 0], DARK_LEAF),
  ],
  looks: { ...realisticLook('genvr.core.tree.pine'), voxel: cellsToParts(cells, cube) },
});
