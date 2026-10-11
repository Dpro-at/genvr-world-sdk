import { defineGround } from './_ground.js';

/**
 * Pavement: light grey 50 cm concrete slabs for sidewalks (Real place, owner 2026-10-06). Drawn by code
 * (tooling/scripts/pavement-ground.mjs), our own work; counts as rock (hard footsteps, nothing grows on it).
 */
export default defineGround({
  name: 'pavement',
  title: 'Pavement',
  soil: 'rock',
  kind: 'road',
  tile: 2,
  files: [
    {
      size: 1024,
      color: '/materials/ground/pavement/color-1024.webp',
      surface: '/materials/ground/pavement/surface-1024.webp',
      bytes: 90228,
    },
    {
      size: 512,
      color: '/materials/ground/pavement/color-512.webp',
      surface: '/materials/ground/pavement/surface-512.webp',
      bytes: 23848,
    },
  ],
  picture: '/materials/ground/pavement/picture.webp',
  source: { name: 'Genvr (drawn by code)', page: 'tooling/scripts/pavement-ground.mjs', license: 'CC0' },
});
