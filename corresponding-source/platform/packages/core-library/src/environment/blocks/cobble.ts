import { defineBlock } from './_block.js';
import { bevel, bricks } from './_pixels.js';

const face = bevel(bricks(0x9aa1a8, 0x7c838b, 0x8d949b), 0.06);
const clean = bevel(bricks(0x9ea5ac, 0x828990), 0.05);

/** Grey stone bricks for the footing of walls. */
export default defineBlock({
  key: 'cobble',
  name: 'Stone Bricks',
  look: {
    top: face,
    side: face,
    bottom: face,
    plain: { top: clean, side: clean, bottom: clean },
    opacity: 1,
  },
});
