import { defineStylePack } from './_style-pack.js';

/** Simple shapes and bright colors, flat shading, studs on the ground. */
export default defineStylePack({
  style: 'blocky',
  name: 'Blocky',
  look: {
    ground: 0x5cc26a,
    groundAccent: 0x4fb35e,
    tile: 4,
    flatShading: true,
    soils: [0x5cc26a, 0xa0703f, 0xf2d27a, 0x9aa3ad, 0xf4f8ff, 0x6b4a2f],
    water: { color: 0x3aa0ff, opacity: 0.78 },
    light: 1,
  },
});
