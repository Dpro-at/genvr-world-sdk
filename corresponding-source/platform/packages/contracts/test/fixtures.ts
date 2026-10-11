import type { Game, GenvrManifestInput, WorldDocumentInput } from '../src/index.js';

export const seaWaterManifest: GenvrManifestInput = {
  schemaVersion: 1,
  id: 'genvr.core.water.sea',
  name: 'Sea Water',
  version: '1.0.0',
  type: 'environment',
  category: 'environment',
  subcategory: 'water',
  styles: ['realistic', 'anime', 'blocky', 'voxel'],
  author: { id: 'genvr', name: 'Genvr' },
  source: 'core',
  license: 'genvr-core-free',
  price: { type: 'free' },
  entry: { model: 'model.glb', script: 'scripts/main.js' },
  physics: { collider: 'none', buoyancy: 1, friction: 0.1 },
  material: { kind: 'water', tags: ['liquid', 'conductive'] },
  params: {
    waveHeight: { type: 'number', min: 0, max: 5, default: 1 },
  },
  audio: { ambient: 'audio/waves.ogg' },
  budget: { triangles: 0, textureMB: 4, mobileReady: true },
  dependencies: [],
  facets: { hasScript: true, rigged: false },
  trainingConsent: true,
};

export const emptyWorld: WorldDocumentInput = {
  schemaVersion: 1,
  experienceId: 'exp-001',
  version: 0,
  style: { base: 'blocky' },
  sizeTier: 'small',
  access: { mode: 'private' },
  environment: {
    sky: { preset: 'day' },
    weather: { preset: 'clear' },
  },
  terrain: {},
  spawn: { position: [0, 1, 0] },
};

/**
 * A neutral game for tests, built only from generic components: 2 players, 300 s of play, 100
 * health, back after 3 s, a point per knock-out, the highest score wins.
 */
export function testGame(): Game {
  return {
    match: { minPlayers: 2, durationSec: 300, countdownSec: 5, resultsSec: 10 },
    teams: { mode: 'none', friendlyFire: false },
    health: { max: 100 },
    respawn: { delaySec: 3, protectSec: 2 },
    score: { from: 'kills' },
    win: { by: 'highest_score' },
  };
}
