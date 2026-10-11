import { box, defineModel } from '../_parts.js';

export const ZONE_AREA_ID = 'genvr.core.gameplay.zone-area';

/**
 * A zone area: a flat pad 4 m by 4 m. The room reads it as an area zone, 4 m times its x and z
 * scale; its `zoneTag` param names it for the rules. Seen while building; while playing only
 * with `zoneVisible`.
 */
export default defineModel({
  id: ZONE_AREA_ID,
  name: 'Zone Area',
  subcategory: 'gameplay',
  collider: 'none',
  resizable: true,
  marker: { kind: 'zone' },
  parts: [
    box([4, 0.04, 4], [0, 0.02, 0], '#8e7cc3'), // pad
    // A lighter inset on top: its bottom sits on the pad's top but faces the other way (no flicker).
    box([3.4, 0.02, 3.4], [0, 0.05, 0], '#c9bfe6'),
  ],
});
