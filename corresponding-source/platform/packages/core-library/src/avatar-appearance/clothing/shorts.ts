import { defineWearable } from '../_wearable.js';

/** Short pants: the lower legs show. */
export default defineWearable({
  slug: 'shorts',
  name: 'Shorts',
  slot: 'bottom',
  kind: 'clothing',
  paint: { lowerLegs: 'skin' },
});
