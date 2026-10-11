import { defineBlock } from './_block.js';
import { bevel, plain, speckled } from './_pixels.js';

const face = bevel(
  speckled(
    { base: 0x9a948c, light: 0xb6b0a7, dark: 0x7c766e, lightShare: 0.3, darkShare: 0.25, speck: 2 },
    6,
  ),
);
const clean = bevel(plain(0x9d968c), 0.06);

/** Small pebbles, on lake floors and paths. */
export default defineBlock({
  key: 'gravel',
  name: 'Gravel',
  look: {
    top: face,
    side: face,
    bottom: face,
    plain: { top: clean, side: clean, bottom: clean },
    opacity: 1,
  },
});
