import { defineWearable, pair } from '../_wearable.js';

/** Small fairy wings on the back. */
export default defineWearable({
  slug: 'wings',
  name: 'Wings',
  slot: 'back',
  kind: 'accessory',
  large: true,
  parts: [
    ...pair(() => 'Spine2', [0.3, 0.34, 0.025], [0.2, 1.3, -0.19], '#bde0fe'),
    ...pair(() => 'Spine2', [0.2, 0.2, 0.025], [0.16, 1.04, -0.19], '#cdb4db'),
  ],
});
