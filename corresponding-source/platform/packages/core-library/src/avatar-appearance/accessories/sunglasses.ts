import { wearBox, defineWearable, pair } from '../_wearable.js';

const DARK = '#141414';

/** Dark sunglasses over both eyes. */
export default defineWearable({
  slug: 'sunglasses',
  name: 'Sunglasses',
  slot: 'face',
  kind: 'accessory',
  parts: [
    ...pair(() => 'Head', [0.13, 0.08, 0.02], [0.08, 1.635, 0.196], DARK),
    wearBox('Head', [0.05, 0.02, 0.015], [0, 1.655, 0.196], DARK),
    ...pair(() => 'Head', [0.015, 0.02, 0.2], [0.195, 1.655, 0.09], DARK),
  ],
});
