import { defineGround } from './_ground.js';

/** Source Terrain.js surface, Tidewater4811ba48 (MIT); phone fallback remains separately credited. */
export default defineGround({
  name: 'tidewater-seabed-sand',
  title: 'Seabed sand',
  soil: 'sand',
  kind: 'sand',
  tile: 3,
  files: [],
  picture: '/materials/ground/tidewater/seabed-sand.webp',
  procedural: { generator: 'tidewater-ground', variant: 'seabed-sand', fallback: 'ground-054' },
  source: { name: 'Tidewater Terrain (4811ba48)', page: 'https://github.com/dgreenheck/tidewater', license: 'MIT' },
});
