import { wearBox, defineWearable } from '../_wearable.js';

/** A pointy party hat made of three stacked blocks. */
export default defineWearable({
  slug: 'party-hat',
  name: 'Party hat',
  slot: 'hat',
  kind: 'accessory',
  large: true,
  parts: [
    wearBox('Head', [0.26, 0.1, 0.26], [0, 1.83, 0], '#ff5d8f'),
    wearBox('Head', [0.17, 0.1, 0.17], [0, 1.93, 0], '#ffd166'),
    wearBox('Head', [0.09, 0.1, 0.09], [0, 2.03, 0], '#ff5d8f'),
    wearBox('Head', [0.07, 0.07, 0.07], [0, 2.11, 0], '#ffffff'),
  ],
});
