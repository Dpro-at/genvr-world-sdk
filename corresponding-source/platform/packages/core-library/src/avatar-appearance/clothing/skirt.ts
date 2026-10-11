import { wearBox, defineWearable } from '../_wearable.js';

/** A skirt in the pants color over bare legs. */
export default defineWearable({
  slug: 'skirt',
  name: 'Skirt',
  slot: 'bottom',
  kind: 'clothing',
  paint: { upperLegs: 'skin', lowerLegs: 'skin' },
  parts: [wearBox('Hips', [0.52, 0.26, 0.32], [0, 0.78, 0], 'pants')],
});
