import { defineBlock } from './_block.js';
import { bevel, capped, plain, speckled } from './_pixels.js';
import dirt from './dirt.js';

const green = speckled({ base: 0x6fcf4a, light: 0x86de5e, dark: 0x5cb93c }, 1);
const cleanGreen = plain(0x7cc43e);

/** Bright grass on top, earth on the sides with a green edge. */
export default defineBlock({
  key: 'grass',
  name: 'Grass',
  look: {
    top: bevel(green, 0.06),
    side: bevel(capped(green, dirt.look.side, 3, 11)),
    bottom: dirt.look.bottom,
    plain: {
      top: bevel(cleanGreen, 0.04),
      side: bevel(capped(cleanGreen, dirt.look.plain.side, 4, 11), 0.05),
      bottom: dirt.look.plain.bottom,
    },
    opacity: 1,
  },
});
