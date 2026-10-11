import { wearBox, defineWearable } from '../_wearable.js';

const VEST = '#6b705c';
const BUTTON = '#ddd5c4';

/**
 * A buttoned vest without sleeves: the body in the vest color with a V of the shirt at the neck.
 * An outer layer (decision 92): over a hoodie its long sleeves show.
 */
export default defineWearable({
  slug: 'vest',
  name: 'Vest',
  slot: 'top',
  layer: 'outer',
  kind: 'clothing',
  paint: { torso: VEST },
  parts: [
    wearBox('Spine2', [0.1, 0.08, 0.02], [0, 1.33, 0.146], 'shirt'),
    wearBox('Spine2', [0.025, 0.025, 0.015], [0, 1.24, 0.15], BUTTON),
    wearBox('Spine1', [0.025, 0.025, 0.015], [0, 1.12, 0.142], BUTTON),
    wearBox('Spine1', [0.025, 0.025, 0.015], [0, 1.0, 0.142], BUTTON),
  ],
});
