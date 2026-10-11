import { box, defineModel, shape, DARK_WOOD } from '../_parts.js';
import { cellsToParts, seeded, shade, VOXEL_COLORS, type Cell } from '../_voxel.js';

/**
 * Voxel look: a cottage of half-meter cubes: a stone footing, rows of planks between dark log
 * corners, a door and two windows on the front (+z), and a stepped red roof with eaves.
 */
const random = seeded(51);
const cells: Cell[] = [];
const [min, max, wallTop] = [-4, 3, 6];
for (let y = 0; y < wallTop; y += 1)
  for (let z = min; z <= max; z += 1)
    for (let x = min; x <= max; x += 1) {
      const edgeX = x === min || x === max;
      const edgeZ = z === min || z === max;
      if (!edgeX && !edgeZ) continue;
      const front = z === max;
      let color: string;
      if (y === 0) color = shade(VOXEL_COLORS.stone, random);
      else if (edgeX && edgeZ) color = shade(VOXEL_COLORS.log, random);
      else if (front && (x === -1 || x === 0) && y <= 3) color = VOXEL_COLORS.door[0];
      else if ((z === max || z === min) && (x === -3 || x === 2) && (y === 2 || y === 3))
        color = VOXEL_COLORS.glass[0];
      else color = VOXEL_COLORS.planks[y % 2 ? 0 : 1];
      cells.push([x, y, z, color]);
    }
// Stepped roof, one cube wider than the walls on every side.
for (let k = 0; min - 1 + k <= max + 1 - k; k += 1)
  for (let z = min - 1 + k; z <= max + 1 - k; z += 1)
    for (let x = min - 1 + k; x <= max + 1 - k; x += 1)
      cells.push([x, wallTop + k, z, shade(VOXEL_COLORS.roof, random)]);

export default defineModel({
  id: 'genvr.core.house.small',
  name: 'Small House',
  subcategory: 'structures',
  // The door is on the front; a house needs flat ground.
  placement: { clearFront: 1.5, maxSlope: 15 },
  parts: [
    box([4, 2.8, 4], [0, 1.4, 0], '#f2e6d0'),
    shape('pyramid', [4.8, 1.6, 4.8], [0, 3.6, 0], '#c0392b'),
    // The door starts just above the house's bottom face (faces in one plane flicker).
    box([0.9, 1.8, 0.05], [0, 0.905, 2.01], DARK_WOOD),
    box([0.8, 0.7, 0.05], [-1.2, 1.7, 2.01], '#8fd3ff'),
    box([0.8, 0.7, 0.05], [1.2, 1.7, 2.01], '#8fd3ff'),
  ],
  looks: { voxel: cellsToParts(cells, 0.5) },
});
