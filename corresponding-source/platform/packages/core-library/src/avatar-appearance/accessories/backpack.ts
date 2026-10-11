import { wearBox, defineWearable, pair } from '../_wearable.js';

/** A school backpack with a front pocket and shoulder straps. */
export default defineWearable({
  slug: 'backpack',
  name: 'Backpack',
  slot: 'back',
  kind: 'accessory',
  large: true,
  parts: [
    wearBox('Spine2', [0.34, 0.36, 0.14], [0, 1.18, -0.21], '#f4a261'),
    wearBox('Spine2', [0.24, 0.13, 0.04], [0, 1.1, -0.295], '#e76f51'),
    ...pair(() => 'Spine2', [0.05, 0.24, 0.02], [0.13, 1.26, 0.152], '#e76f51'),
  ],
});
