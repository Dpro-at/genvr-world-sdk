import { defineBlock } from './_block.js';
import { bevel, plain, speckled } from './_pixels.js';
import stone from './stone.js';

const tile = bevel(speckled({ base: 0xb7bcc2, light: 0xc8ccd1, dark: 0xa4aab1, speck: 2 }, 15), 0.14);
const cleanTile = bevel(plain(0xbcc1c7), 0.12);

/** Square stone tiles of paved roads and squares: one tile per block, with clear joints. */
export default defineBlock({
  key: 'paving',
  name: 'Paving',
  look: {
    top: tile,
    side: stone.look.side,
    bottom: stone.look.bottom,
    plain: { top: cleanTile, side: stone.look.plain.side, bottom: stone.look.plain.bottom },
    opacity: 1,
  },
});
