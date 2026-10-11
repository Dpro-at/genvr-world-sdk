import { box, defineModel, DARK_WOOD, WOOD } from '../_parts.js';
import { cellsToParts, fill, seeded, VOXEL_COLORS } from '../_voxel.js';

/** Voxel look: two rails of log cubes and plank rungs about every 35 cm. */
const random = seeded(101);
const cells = [
  ...fill([-3, 0, 0], [-3, 29, 0], VOXEL_COLORS.log, random),
  ...fill([2, 0, 0], [2, 29, 0], VOXEL_COLORS.log, random),
  ...[3, 6, 10, 13, 17, 20, 24, 27].flatMap((y) =>
    fill([-2, y, 0], [1, y, 0], VOXEL_COLORS.planks, random, 'row'),
  ),
];

/** Rungs from near the ground to near the top. */
const RUNGS = 8;

export default defineModel({
  id: 'genvr.core.ladder',
  name: 'Ladder',
  subcategory: 'structures',
  // Players walk into it and climb (P2-23); it does not block them.
  collider: 'none',
  climbable: true,
  // Stands on the ground or on a floor, leaning on nothing (it stays upright).
  placement: { stands: ['ground', 'built'], rest: { mode: 'upright', sink: 0.05 } },
  parts: [
    box([0.08, 3, 0.08], [-0.28, 1.5, 0], DARK_WOOD),
    box([0.08, 3, 0.08], [0.28, 1.5, 0], DARK_WOOD),
    ...Array.from({ length: RUNGS }, (_, i) => box([0.5, 0.05, 0.06], [0, 0.3 + i * 0.35, 0], WOOD)),
  ],
  looks: { voxel: cellsToParts(cells, 0.1, [0, 0, -0.05]) },
});
