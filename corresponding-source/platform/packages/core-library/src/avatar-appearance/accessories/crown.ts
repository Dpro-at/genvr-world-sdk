import { wearBox, defineWearable } from '../_wearable.js';

const GOLD = '#f4c430';

/** A small golden crown with four points and a red jewel. */
export default defineWearable({
  slug: 'crown',
  name: 'Crown',
  slot: 'hat',
  kind: 'accessory',
  parts: [
    wearBox('Head', [0.3, 0.08, 0.3], [0, 1.87, 0], GOLD),
    ...[-1, 1].flatMap((x) =>
      [-1, 1].map((z) => wearBox('Head', [0.06, 0.08, 0.06], [0.12 * x, 1.95, 0.12 * z], GOLD)),
    ),
    wearBox('Head', [0.06, 0.05, 0.02], [0, 1.87, 0.155], '#d62828'),
  ],
});
