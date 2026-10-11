import { box, defineModel, shape } from '../_parts.js';
import { cellsToParts, seeded, shade, VOXEL_COLORS, type Cell } from '../_voxel.js';

/** Voxel look: stepped orange layers narrowing to a tip, with one white band. */
const random = seeded(121);
/** Half width of each layer in cubes; a round layer drops its corners. */
const LAYERS: Array<[half: number, round: boolean]> = [
  [2, false],
  [2, true],
  [1, false],
  [1, false],
  [1, true],
  [1, true],
  [0, false],
];
const cells: Cell[] = [];
LAYERS.forEach(([half, round], y) => {
  const colors = y === 3 ? VOXEL_COLORS.white : VOXEL_COLORS.cone;
  for (let z = -half; z <= half; z += 1)
    for (let x = -half; x <= half; x += 1)
      if (!(round && Math.abs(x) === half && Math.abs(z) === half))
        cells.push([x, y, z, shade(colors, random)]);
});

export default defineModel({
  id: 'genvr.core.cone',
  name: 'Traffic Cone',
  subcategory: 'props-and-decor',
  parts: [
    box([0.5, 0.05, 0.5], [0, 0.025, 0], '#ff7a1a'),
    shape('cone', [0.4, 0.7, 0.4], [0, 0.4, 0], '#ff7a1a'),
    shape('cylinder', [0.26, 0.1, 0.26], [0, 0.4, 0], '#ffffff'),
  ],
  looks: { voxel: cellsToParts(cells, 0.1, [-0.05, 0, -0.05]) },
});
