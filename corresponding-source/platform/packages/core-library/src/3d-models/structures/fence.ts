import { realisticLook } from '../_realistic.js';
import { box, defineModel, WOOD } from '../_parts.js';
import { cellsToParts, fill, seeded, VOXEL_COLORS } from '../_voxel.js';

/** Voxel look: two posts of log cubes and two plank rails; exactly 2 m wide, so fences line up. */
const random = seeded(91);
const cells = [
  ...fill([-10, 0, 0], [-10, 10, 0], VOXEL_COLORS.log, random),
  ...fill([9, 0, 0], [9, 10, 0], VOXEL_COLORS.log, random),
  ...fill([-9, 4, 0], [8, 4, 0], VOXEL_COLORS.planks, random, 'row'),
  ...fill([-9, 8, 0], [8, 8, 0], VOXEL_COLORS.planks, random, 'row'),
];

export default defineModel({
  id: 'genvr.core.fence',
  name: 'Fence',
  subcategory: 'structures',
  // A post stands upright and sinks a little on a slope; it never grades the ground (P2-43).
  placement: { maxSlope: 40, maxTilt: 5, rest: { mode: 'upright', sink: 0.05 } },
  parts: [
    box([0.12, 1.1, 0.12], [-0.94, 0.55, 0], WOOD),
    box([0.12, 1.1, 0.12], [0.94, 0.55, 0], WOOD),
    // The rails end inside the posts, not on their outer faces (faces in one plane flicker).
    box([1.96, 0.12, 0.06], [0, 0.8, 0], WOOD),
    box([1.96, 0.12, 0.06], [0, 0.4, 0], WOOD),
  ],
  looks: { ...realisticLook('genvr.core.fence'), voxel: cellsToParts(cells, 0.1, [0, 0, -0.05]) },
});
