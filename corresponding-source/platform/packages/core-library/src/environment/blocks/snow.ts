import { defineBlock } from './_block.js';
import { bevel, capped, plain, speckled } from './_pixels.js';
import stone from './stone.js';

const white = speckled({ base: 0xf4f8fc, light: 0xffffff, dark: 0xdde8f2, darkShare: 0.1 }, 5);
const cleanWhite = plain(0xf3f7fb);

/** Snow on mountain tops: white on top, stone sides with a snowy edge. */
export default defineBlock({
  key: 'snow',
  name: 'Snow',
  look: {
    top: bevel(white, 0.04),
    side: bevel(capped(white, stone.look.side, 4, 12)),
    bottom: stone.look.bottom,
    plain: {
      top: bevel(cleanWhite, 0.03),
      side: bevel(capped(cleanWhite, stone.look.plain.side, 5, 12), 0.05),
      bottom: stone.look.plain.bottom,
    },
    opacity: 1,
  },
});
