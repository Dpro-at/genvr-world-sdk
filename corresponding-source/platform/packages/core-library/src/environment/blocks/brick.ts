import { defineBlock } from './_block.js';
import { bevel, bricks } from './_pixels.js';

const face = bevel(bricks(0xb4553f, 0xd9cbb8, 0xa34a36), 0.05);
const clean = bevel(bricks(0xb85a43, 0xe0d4c3), 0.04);

/** Red bricks in tidy rows, for brick roads and later walls. */
export default defineBlock({
  key: 'brick',
  name: 'Brick',
  look: {
    top: face,
    side: face,
    bottom: face,
    plain: { top: clean, side: clean, bottom: clean },
    opacity: 1,
  },
});
