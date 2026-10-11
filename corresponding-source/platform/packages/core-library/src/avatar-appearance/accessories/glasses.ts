import { wearBox, defineWearable, pair } from '../_wearable.js';

const FRAME = '#1c1b2e';

/** Reading glasses: a thin frame around each eye and arms over the ears. */
export default defineWearable({
  slug: 'glasses',
  name: 'Glasses',
  slot: 'face',
  kind: 'accessory',
  parts: [
    ...[1, -1].flatMap((x) => [
      wearBox('Head', [0.12, 0.015, 0.015], [0.08 * x, 1.678, 0.195], FRAME),
      wearBox('Head', [0.12, 0.015, 0.015], [0.08 * x, 1.582, 0.195], FRAME),
      wearBox('Head', [0.015, 0.1, 0.015], [0.08 * x + 0.053, 1.63, 0.195], FRAME),
      wearBox('Head', [0.015, 0.1, 0.015], [0.08 * x - 0.053, 1.63, 0.195], FRAME),
    ]),
    ...pair(() => 'Head', [0.015, 0.015, 0.2], [0.195, 1.66, 0.09], FRAME),
  ],
});
