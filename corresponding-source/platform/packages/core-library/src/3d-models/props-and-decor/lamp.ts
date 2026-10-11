import { realisticLook } from '../_realistic.js';
import { defineModel, shape, METAL } from '../_parts.js';
import { cellsToParts, fill, seeded, VOXEL_COLORS } from '../_voxel.js';

/** Voxel look: a metal foot and pole of cubes with a square light under a metal cap. */
const random = seeded(111);
const cells = [
  ...fill([-2, 0, -2], [1, 1, 1], VOXEL_COLORS.metal, random),
  ...fill([-1, 2, -1], [0, 34, 0], VOXEL_COLORS.metal, random),
  ...fill([-2, 35, -2], [1, 38, 1], VOXEL_COLORS.lampLight, random),
  ...fill([-2, 39, -2], [1, 39, 1], VOXEL_COLORS.metal, random),
];

export default defineModel({
  id: 'genvr.core.lamp',
  name: 'Street Lamp',
  subcategory: 'props-and-decor',
  placement: { maxTilt: 3 },
  parts: [
    shape('cylinder', [0.4, 0.2, 0.4], [0, 0.1, 0], METAL),
    shape('cylinder', [0.14, 3.6, 0.14], [0, 1.9, 0], METAL),
    shape('sphere', [0.5, 0.5, 0.5], [0, 3.8, 0], '#fff3b0'),
  ],
  looks: { ...realisticLook('genvr.core.lamp'), voxel: cellsToParts(cells, 0.1) },
  // The bulb glows at night and lights the street around the lamp.
  light: { at: [0, 3.8, 0], color: '#ffd59a', range: 32 },
});
