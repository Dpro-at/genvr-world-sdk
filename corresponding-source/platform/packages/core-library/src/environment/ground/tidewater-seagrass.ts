import { defineGround } from './_ground.js';

/** Source seabed splat.z vegetation; a paintable surface, separate from future 3D blades. */
export default defineGround({
  name: 'tidewater-seagrass',
  title: 'Seagrass bed',
  soil: 'grass',
  kind: 'grass',
  tile: 3,
  files: [],
  picture: '/materials/ground/tidewater/seagrass.webp',
  procedural: { generator: 'tidewater-ground', variant: 'seagrass', fallback: 'grass-004' },
  source: { name: 'Tidewater Terrain (4811ba48)', page: 'https://github.com/dgreenheck/tidewater', license: 'MIT' },
});
