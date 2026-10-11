import { box, defineModel, shape } from '../_parts.js';

export const SPAWN_POINT_ID = 'genvr.core.gameplay.spawn-point';

/**
 * Where players start in a game (P9-12): a flat pad with an arrow toward +z. Seen while building,
 * hidden while playing. The `team` instance param (any | red | blue) is read by the room; absent
 * means any.
 */
export default defineModel({
  id: SPAWN_POINT_ID,
  name: 'Spawn Point',
  subcategory: 'gameplay',
  collider: 'none',
  marker: { kind: 'spawn' },
  parts: [
    shape('cylinder', [1, 0.04, 1], [0, 0.02, 0], '#3a7bd5'), // pad
    box([0.16, 0.02, 0.4], [0, 0.05, -0.05], '#ffffff'), // arrow shaft
    shape('wedge', [0.4, 0.02, 0.25], [0, 0.05, 0.28], '#ffffff'), // arrow head
  ],
});
