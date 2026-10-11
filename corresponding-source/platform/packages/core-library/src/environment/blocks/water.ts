import { defineBlock } from './_block.js';
import { plain, ripples } from './_pixels.js';

const face = ripples({ base: 0x1e8ee8, light: 0x55bdfb, dark: 0x1a82da, darkShare: 0.05 }, 7);
const clean = plain(0x1fa6d8);

/** Clear blue water in square steps with a soft shine. */
export default defineBlock({
  key: 'water',
  name: 'Water',
  look: {
    top: face,
    side: face,
    bottom: face,
    plain: { top: clean, side: clean, bottom: clean },
    opacity: 0.86,
  },
});
