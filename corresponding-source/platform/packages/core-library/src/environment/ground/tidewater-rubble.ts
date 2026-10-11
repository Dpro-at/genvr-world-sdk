import { defineGround } from './_ground.js';

/** Source Terrain.js surface, Tidewater4811ba48 (MIT); phone fallback remains separately credited. */
export default defineGround({
  name: 'tidewater-rubble',
  title: 'Seabed rubble',
  soil: 'mud',
  kind: 'ground',
  tile: 3,
  files: [],
  picture: '/materials/ground/tidewater/rubble.webp',
  procedural: { generator: 'tidewater-ground', variant: 'rubble', fallback: 'ground-106' },
  source: { name: 'Tidewater Terrain (4811ba48)', page: 'https://github.com/dgreenheck/tidewater', license: 'MIT' },
});
