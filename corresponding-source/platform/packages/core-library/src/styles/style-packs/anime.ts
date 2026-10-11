import { defineStylePack } from './_style-pack.js';

/** Soft pastel colors, toon shading, and bright light. */
export default defineStylePack({
  style: 'anime',
  name: 'Anime',
  look: {
    ground: 0x8fdc7a,
    groundAccent: 0x7ccd6a,
    tile: 8,
    flatShading: true,
    soils: [0x8fdc7a, 0xc08a5a, 0xffe29a, 0xb8c0d0, 0xffffff, 0x8a6040],
    water: { color: 0x6fd3ff, opacity: 0.7 },
    light: 1.15,
  },
});
