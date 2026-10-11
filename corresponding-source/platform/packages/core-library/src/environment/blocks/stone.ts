import { defineBlock } from './_block.js';
import { bevel, plain, speckled } from './_pixels.js';

const face = bevel(speckled({ base: 0xa6acb2, light: 0xbcc1c6, dark: 0x8e959c, speck: 2 }, 4), 0.1);
const clean = bevel(plain(0x939ba5), 0.06);

/** Clean grey stone for mountains and cliffs. */
export default defineBlock({
  key: 'stone',
  name: 'Stone',
  look: {
    top: face,
    side: face,
    bottom: face,
    plain: { top: clean, side: clean, bottom: clean },
    opacity: 1,
  },
});
