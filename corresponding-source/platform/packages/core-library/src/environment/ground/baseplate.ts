import { defineGround } from './_ground.js';

/**
 * Baseplate: the plain light square an empty place opens on, like a Roblox baseplate (owner, 2026-10-06). Drawn by
 * code (tooling/scripts/baseplate-ground.mjs), our own work; counts as rock (hard footsteps, nothing grows on it).
 */
export default defineGround({
  name: 'baseplate',
  title: 'Baseplate',
  soil: 'rock',
  kind: 'ground',
  tile: 8,
  files: [
    {
      size: 1024,
      color: '/materials/ground/baseplate/color-1024.webp',
      surface: '/materials/ground/baseplate/surface-1024.webp',
      bytes: 15882,
    },
    {
      size: 512,
      color: '/materials/ground/baseplate/color-512.webp',
      surface: '/materials/ground/baseplate/surface-512.webp',
      bytes: 4710,
    },
  ],
  picture: '/materials/ground/baseplate/picture.webp',
  source: { name: 'Genvr (drawn by code)', page: 'tooling/scripts/baseplate-ground.mjs', license: 'CC0' },
});
