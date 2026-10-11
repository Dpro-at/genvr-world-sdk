import { defineBlock } from './_block.js';
import { bevel, capped, plain, speckled } from './_pixels.js';
import dirt from './dirt.js';

const packed = speckled({ base: 0xc49a62, light: 0xd3ad78, dark: 0xb08652, darkShare: 0.1 }, 13);
const cleanPacked = plain(0xc9a36b);

/** Packed light earth of dirt roads. */
export default defineBlock({
  key: 'path',
  name: 'Dirt Road',
  look: {
    top: bevel(packed, 0.05),
    side: bevel(capped(packed, dirt.look.side, 2, 14)),
    bottom: dirt.look.bottom,
    plain: {
      top: bevel(cleanPacked, 0.04),
      side: bevel(capped(cleanPacked, dirt.look.plain.side, 3, 14), 0.05),
      bottom: dirt.look.plain.bottom,
    },
    opacity: 1,
  },
});
