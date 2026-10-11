import { defineBlock } from './_block.js';
import { bevel, boards } from './_pixels.js';

const face = bevel(boards(0xd2a86c, 0xa77d48, 0xc99e62), 0.05);
const clean = bevel(boards(0xd9b27a, 0xb58a55), 0.04);

/** Light wooden boards for walls and room floors. */
export default defineBlock({
  key: 'planks',
  name: 'Planks',
  look: {
    top: face,
    side: face,
    bottom: face,
    plain: { top: clean, side: clean, bottom: clean },
    opacity: 1,
  },
});
