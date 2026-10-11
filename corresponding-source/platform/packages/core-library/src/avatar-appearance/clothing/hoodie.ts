import { wearBox, defineWearable, pair } from '../_wearable.js';

/**
 * Long sleeves, a hood resting on the back, drawstrings, and a front pocket. Under a jacket or a
 * vest the collar and pocket hide; the hood stays out over the back.
 */
export default defineWearable({
  slug: 'hoodie',
  name: 'Hoodie',
  slot: 'top',
  kind: 'clothing',
  paint: { forearms: 'shirt' },
  parts: [
    wearBox('Spine2', [0.36, 0.16, 0.08], [0, 1.36, -0.18], 'shirt'),
    wearBox('Spine2', [0.3, 0.05, 0.3], [0, 1.39, 0], 'shirt', { covered: true }),
    ...pair(() => 'Spine2', [0.015, 0.12, 0.015], [0.05, 1.3, 0.152], '#f5f5f5'),
    wearBox('Spine1', [0.3, 0.1, 0.02], [0, 1.04, 0.142], 'shirt', { covered: true }),
  ],
});
