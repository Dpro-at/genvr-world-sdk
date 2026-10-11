import { wearBox, defineWearable, pair } from '../_wearable.js';

const BOW = '#1d3557';

/** A neat bow tie under the chin. */
export default defineWearable({
  slug: 'bow-tie',
  name: 'Bow tie',
  slot: 'neck',
  kind: 'clothing',
  parts: [
    ...pair(() => 'Spine2', [0.07, 0.07, 0.03], [0.045, 1.35, 0.16], BOW),
    wearBox('Spine2', [0.03, 0.035, 0.035], [0, 1.35, 0.162], BOW),
  ],
});
