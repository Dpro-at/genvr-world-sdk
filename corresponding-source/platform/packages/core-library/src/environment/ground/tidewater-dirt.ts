import { defineGround } from './_ground.js';

/** Source Terrain.js surface, Tidewater4811ba48 (MIT); phone fallback remains separately credited. */
export default defineGround({
  name: 'tidewater-dirt',
  title: 'Path soil',
  soil: 'dirt',
  kind: 'ground',
  tile: 3,
  files: [],
  picture: '/materials/ground/tidewater/dirt.webp',
  procedural: { generator: 'tidewater-ground', variant: 'dirt', fallback: 'ground-103' },
  source: { name: 'Tidewater Terrain (4811ba48)', page: 'https://github.com/dgreenheck/tidewater', license: 'MIT' },
});
