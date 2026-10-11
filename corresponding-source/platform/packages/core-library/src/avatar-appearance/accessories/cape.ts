import { wearBox, defineWearable } from '../_wearable.js';

const CAPE = '#c1121f';

/** A hero cape hanging down the back, with a golden clasp. */
export default defineWearable({
  slug: 'cape',
  name: 'Cape',
  slot: 'back',
  kind: 'accessory',
  large: true,
  parts: [
    wearBox('Spine2', [0.46, 0.72, 0.03], [0, 1.0, -0.165], CAPE),
    wearBox('Spine2', [0.5, 0.05, 0.31], [0, 1.37, 0], CAPE),
    wearBox('Spine2', [0.06, 0.06, 0.02], [0, 1.34, 0.16], '#f4c430'),
  ],
});
