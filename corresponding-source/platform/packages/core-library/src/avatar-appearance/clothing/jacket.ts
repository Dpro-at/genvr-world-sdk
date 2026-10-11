import { wearBox, defineWearable, pair } from '../_wearable.js';

const JACKET = '#264653';

/**
 * An open jacket: sleeves and body in the jacket color, the shirt shows down the front. An outer
 * layer: it goes over a hoodie (decision 92).
 */
export default defineWearable({
  slug: 'jacket',
  name: 'Jacket',
  slot: 'top',
  layer: 'outer',
  kind: 'clothing',
  paint: { torso: JACKET, upperArms: JACKET, forearms: JACKET },
  parts: [
    wearBox('Spine2', [0.14, 0.24, 0.02], [0, 1.26, 0.146], 'shirt'),
    wearBox('Spine1', [0.14, 0.2, 0.02], [0, 1.06, 0.136], 'shirt'),
    ...pair(() => 'Spine2', [0.1, 0.05, 0.3], [0.1, 1.39, 0], JACKET),
    ...pair((side) => `${side}ForeArm`, [0.04, 0.14, 0.14], [0.64, 1.34, 0], '#e9c46a'),
  ],
});
