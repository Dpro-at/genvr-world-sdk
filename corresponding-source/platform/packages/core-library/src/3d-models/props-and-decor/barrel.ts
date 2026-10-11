import { defineModel, shape, METAL } from '../_parts.js';
import { cellsToParts, seeded, shade, VOXEL_COLORS, type Cell } from '../_voxel.js';

/** Voxel look: round layers of red cubes, a little narrower at the ends, with two metal bands. */
const random = seeded(61);
const cells: Cell[] = [];
for (let y = 0; y < 11; y += 1) {
  const radius = y < 2 || y > 8 ? 3.6 : 4.1;
  const colors = y === 2 || y === 8 ? VOXEL_COLORS.metal : VOXEL_COLORS.barrel;
  for (let z = -4; z < 4; z += 1)
    for (let x = -4; x < 4; x += 1)
      if ((x + 0.5) ** 2 + (z + 0.5) ** 2 <= radius ** 2) cells.push([x, y, z, shade(colors, random)]);
}

export default defineModel({
  id: 'genvr.core.barrel',
  name: 'Barrel',
  subcategory: 'props-and-decor',
  parts: [
    shape('cylinder', [0.8, 1.1, 0.8], [0, 0.55, 0], '#c0392b'),
    shape('cylinder', [0.84, 0.08, 0.84], [0, 0.25, 0], METAL),
    shape('cylinder', [0.84, 0.08, 0.84], [0, 0.85, 0], METAL),
  ],
  looks: { voxel: cellsToParts(cells, 0.1) },
});
