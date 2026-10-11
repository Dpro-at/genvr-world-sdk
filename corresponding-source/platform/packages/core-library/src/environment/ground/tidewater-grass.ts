import { defineGround } from './_ground.js';

/** Source Terrain.js surface, Tidewater4811ba48 (MIT); phone fallback remains separately credited. */
export default defineGround({
  name: 'tidewater-grass',
  title: 'Meadow',
  soil: 'grass',
  kind: 'grass',
  tile: 3,
  files: [],
  picture: '/materials/ground/tidewater/grass.webp',
  procedural: { generator: 'tidewater-ground', variant: 'grass', fallback: 'grass-004' },
  source: { name: 'Tidewater Terrain (4811ba48)', page: 'https://github.com/dgreenheck/tidewater', license: 'MIT' },
});
