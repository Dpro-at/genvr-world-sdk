import { defineStylePack } from './_style-pack.js';

/** Natural colors, smooth shading, deeper water, and light from a physical sky (P2-36). */
export default defineStylePack({
  style: 'realistic',
  name: 'Realistic',
  look: {
    ground: 0x5e7d3a,
    groundAccent: 0x566f35,
    tile: 12,
    flatShading: false,
    soils: [0x5e7d3a, 0x6f5638, 0xc9b28a, 0x7a7a74, 0xe8eef2, 0x4a3a28],
    water: { color: 0x2d6f9e, opacity: 0.85 },
    light: 1,
    lighting: 'sky',
  },
});
