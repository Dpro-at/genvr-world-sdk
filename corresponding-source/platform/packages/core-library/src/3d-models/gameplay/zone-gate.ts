import { box, defineModel, directionMark } from '../_parts.js';

export const ZONE_GATE_ID = 'genvr.core.gameplay.zone-gate';

/**
 * A zone gate: a plain frame 12 m wide facing +z (the yellow chevron on the bar points that way).
 * The room reads it as a gate zone crossed along its facing, 12 m times its x scale wide; its
 * `zoneTag` param names it for the rules. Seen while building; while playing only with `zoneVisible`.
 */
export default defineModel({
  id: ZONE_GATE_ID,
  name: 'Zone Gate',
  subcategory: 'gameplay',
  collider: 'none',
  resizable: true,
  marker: { kind: 'zone' },
  parts: [
    box([0.4, 4, 0.4], [-6, 2, 0], '#8e7cc3'), // left post
    box([0.4, 4, 0.4], [6, 2, 0], '#8e7cc3'), // right post
    box([12.6, 0.4, 0.3], [0, 4, 0], '#8e7cc3'), // bar
    ...directionMark(4.2), // points +z, the direction it is crossed in
  ],
});
