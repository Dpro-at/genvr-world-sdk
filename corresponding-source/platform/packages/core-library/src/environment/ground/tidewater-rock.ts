import { defineGround } from './_ground.js';

/** Source Terrain.js surface, Tidewater4811ba48 (MIT); phone fallback remains separately credited. */
export default defineGround({
  name: 'tidewater-rock',
  title: 'Rock',
  soil: 'rock',
  kind: 'rock',
  tile: 3,
  files: [],
  picture: '/materials/ground/tidewater/rock.webp',
  procedural: { generator: 'tidewater-ground', variant: 'rock', fallback: 'rock-051' },
  source: { name: 'Tidewater Terrain (4811ba48)', page: 'https://github.com/dgreenheck/tidewater', license: 'MIT' },
});
