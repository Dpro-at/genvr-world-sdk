import { defineGround } from './_ground.js';

/** Source Terrain.js surface, Tidewater4811ba48 (MIT); phone fallback remains separately credited. */
export default defineGround({
  name: 'tidewater-beach-sand',
  title: 'Beach sand',
  soil: 'sand',
  kind: 'sand',
  tile: 3,
  files: [],
  picture: '/materials/ground/tidewater/beach-sand.webp',
  procedural: { generator: 'tidewater-ground', variant: 'beach-sand', fallback: 'ground-080' },
  source: { name: 'Tidewater Terrain (4811ba48)', page: 'https://github.com/dgreenheck/tidewater', license: 'MIT' },
});
