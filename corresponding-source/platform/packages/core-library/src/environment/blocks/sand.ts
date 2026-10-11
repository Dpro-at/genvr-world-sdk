import { defineBlock } from './_block.js';
import { bevel, plain, speckled } from './_pixels.js';

const face = bevel(speckled({ base: 0xf2dc9b, light: 0xf9eabb, dark: 0xe3c883, darkShare: 0.1 }, 3), 0.05);
const clean = bevel(plain(0xecd185), 0.04);

/** Warm sand for beaches and lake floors. */
export default defineBlock({
  key: 'sand',
  name: 'Sand',
  look: {
    top: face,
    side: face,
    bottom: face,
    plain: { top: clean, side: clean, bottom: clean },
    opacity: 1,
  },
});
