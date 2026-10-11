import { realisticLook } from '../_realistic.js';
import { defineModel, shape, LEAF } from '../_parts.js';
import { cellsToParts, clump, VOXEL_COLORS } from '../_voxel.js';

export default defineModel({
  id: 'genvr.core.bush',
  name: 'Bush',
  subcategory: 'nature',
  parts: [shape('sphere', [1.6, 1.1, 1.6], [0, 0.55, 0], LEAF)],
  // Voxel look: a low, uneven clump of leafy cubes resting on the ground.
  looks: {
    ...realisticLook('genvr.core.bush'),
    voxel: cellsToParts(
      clump({
        center: [-0.5, 1.2, -0.5],
        radius: [2.4, 1.7, 2.4],
        colors: VOXEL_COLORS.leaf,
        seed: 31,
      }).filter(([, y]) => y >= 0),
      0.35,
    ),
  },
});
