import { defineBlock } from './_block.js';
import { bevel, plain, speckled } from './_pixels.js';

const face = bevel(speckled({ base: 0x9b6b43, light: 0xb07e52, dark: 0x85593a }, 2));
const clean = bevel(plain(0x8f5a2e), 0.05);

/** Brown earth under the grass. */
export default defineBlock({
  key: 'dirt',
  name: 'Dirt',
  look: {
    top: face,
    side: face,
    bottom: face,
    plain: { top: clean, side: clean, bottom: clean },
    opacity: 1,
  },
});
