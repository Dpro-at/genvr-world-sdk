import { defineWearable, pair } from '../_wearable.js';

const LEATHER = '#6b4226';

/** Brown boots that reach up the shin. */
export default defineWearable({
  slug: 'boots',
  name: 'Boots',
  slot: 'shoes',
  kind: 'clothing',
  paint: { feet: LEATHER },
  parts: [
    ...pair((side) => `${side}Leg`, [0.2, 0.16, 0.22], [0.12, 0.17, 0], LEATHER),
    ...pair((side) => `${side}Leg`, [0.205, 0.03, 0.225], [0.12, 0.25, 0], '#8b5a3c'),
  ],
});
