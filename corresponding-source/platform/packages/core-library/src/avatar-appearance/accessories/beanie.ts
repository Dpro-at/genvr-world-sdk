import { wearBox, defineWearable } from '../_wearable.js';

/** A knitted winter hat with a folded band and a pompom. */
export default defineWearable({
  slug: 'beanie',
  name: 'Beanie',
  slot: 'hat',
  kind: 'accessory',
  parts: [
    wearBox('Head', [0.42, 0.15, 0.4], [0, 1.835, -0.005], '#2a9d8f'),
    wearBox('Head', [0.43, 0.06, 0.41], [0, 1.77, -0.005], '#e9f5f3'),
    wearBox('Head', [0.09, 0.09, 0.09], [0, 1.95, -0.005], '#e9f5f3'),
  ],
});
