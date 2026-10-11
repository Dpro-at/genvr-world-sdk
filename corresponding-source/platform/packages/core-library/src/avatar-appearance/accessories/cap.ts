import { wearBox, defineWearable } from '../_wearable.js';

/** A baseball cap with the brim to the front. */
export default defineWearable({
  slug: 'cap',
  name: 'Cap',
  slot: 'hat',
  kind: 'accessory',
  parts: [
    wearBox('Head', [0.42, 0.12, 0.4], [0, 1.84, -0.005], '#e63946'),
    wearBox('Head', [0.34, 0.03, 0.16], [0, 1.795, 0.26], '#e63946'),
    wearBox('Head', [0.06, 0.03, 0.06], [0, 1.915, 0], '#f1faee'),
  ],
});
