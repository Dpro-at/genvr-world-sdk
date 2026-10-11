import { wearBox, defineWearable } from '../_wearable.js';

const RED = '#d62828';

/** A warm scarf around the neck with one end hanging down the front. */
export default defineWearable({
  slug: 'scarf',
  name: 'Scarf',
  slot: 'neck',
  kind: 'clothing',
  parts: [
    wearBox('Neck', [0.3, 0.08, 0.3], [0, 1.4, 0], RED),
    wearBox('Spine2', [0.09, 0.22, 0.03], [0.09, 1.27, 0.16], RED),
    wearBox('Spine2', [0.09, 0.03, 0.035], [0.09, 1.2, 0.162], '#f1faee'),
  ],
});
