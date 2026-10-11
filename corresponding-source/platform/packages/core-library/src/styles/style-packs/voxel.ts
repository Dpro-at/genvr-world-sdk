import { defineStylePack } from './_style-pack.js';

/**
 * Cubes you can dig and stack (decision 98): a bright, tidy pixel-cube world. New Voxel places get
 * block ground (environment/blocks); the ground colors below match the grass block.
 */
export default defineStylePack({
  style: 'voxel',
  name: 'Voxel',
  look: {
    ground: 0x6fcf4a,
    groundAccent: 0x5cb93c,
    tile: 1,
    flatShading: true,
    soils: [0x6fcf4a, 0x9b6b43, 0xf2dc9b, 0xa6acb2, 0xf4f8fc, 0x5c3d24],
    water: { color: 0x3aa6f0, opacity: 0.78 },
    light: 1.05,
    sky: { sun: 'square', moon: 'square', clouds: 'cubes', drops: 'pixel' },
    blocks: 'plain',
    avatar: 'cubes',
  },
});
